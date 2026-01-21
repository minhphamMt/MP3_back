import db from "../config/db.js";
import SONG_STATUS from "../constants/song-status.js";
import { recordListeningHistory } from "./history.service.js";

const createError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const normalizeGenres = (genres) => {
  if (!genres) return [];
  const list = Array.isArray(genres)
    ? genres
    : String(genres)
        .split(",")
        .map((item) => item.trim());

  return [...new Set(list.filter(Boolean))];
};

const parseGenreString = (genreString) =>
  genreString ? genreString.split(",").filter(Boolean) : [];
const normalizeGenreInput = (genres) => {
  if (!genres) return [];
  const list = Array.isArray(genres)
    ? genres
    : String(genres)
        .split(",")
        .map((item) => item.trim());

  return [...new Set(list.filter(Boolean))];
};

const ensureGenreIds = async (genres = []) => {
  if (!genres.length) return [];

  const names = normalizeGenreInput(genres);
  if (!names.length) return [];

  const placeholders = names.map(() => "?").join(",");
  const [existingRows] = await db.query(
    `SELECT id, name FROM genres WHERE name IN (${placeholders})`,
    names
  );

  const existingMap = new Map(existingRows.map((row) => [row.name, row.id]));
  const missingNames = names.filter((name) => !existingMap.has(name));

  for (const name of missingNames) {
    const [result] = await db.query("INSERT INTO genres (name) VALUES (?)", [
      name,
    ]);
    existingMap.set(name, result.insertId);
  }

  return names.map((name) => existingMap.get(name)).filter(Boolean);
};

const syncSongGenres = async (songId, genres = []) => {
  const genreIds = await ensureGenreIds(genres);

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query("DELETE FROM song_genres WHERE song_id = ?", [
      songId,
    ]);

    if (genreIds.length) {
      const values = genreIds.map((genreId) => [songId, genreId]);
      await connection.query(
        "INSERT INTO song_genres (song_id, genre_id) VALUES ?",
        [values]
      );
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};
const getSongLikesCount = async (songId) => {
  const [rows] = await db.query(
    "SELECT COUNT(*) AS likes FROM song_likes WHERE song_id = ?",
    [songId]
  );
  return rows[0]?.likes || 0;
};

const getSongPlayCount = async (songId) => {
  const [rows] = await db.query(
    "SELECT play_count FROM songs WHERE id = ? LIMIT 1",
    [songId]
  );
  if (!rows[0]) {
    throw createError(404, "Song not found");
  }
  return rows[0].play_count || 0;
};

const getSongEngagement = async (songId) => {
  const [playCount, likeCount] = await Promise.all([
    getSongPlayCount(songId),
    getSongLikesCount(songId),
  ]);
  return { playCount, likeCount };
};

export const updateSongMedia = async (songId, { audioPath, coverUrl }) => {
  const [songs] = await db.query("SELECT id FROM songs WHERE id = ?", [songId]);
  if (!songs[0]) {
    throw createError(404, "Song not found");
  }

  const updates = [];
  const params = [];

  if (audioPath) {
    updates.push("audio_path = ?");
    params.push(audioPath);
  }

  if (coverUrl) {
    updates.push("cover_url = ?");
    params.push(coverUrl);
  }

  if (!updates.length) {
    return getSongById(songId);
  }

  params.push(songId);

  await db.query(`UPDATE songs SET ${updates.join(", ")} WHERE id = ?`, params);
  return getSongById(songId);
};

export const reviewSong = async (
  songId,
  { status, reviewerId, rejectReason }
) => {
  const allowedStatuses = Object.values(SONG_STATUS);
  if (!allowedStatuses.includes(status)) {
    throw createError(400, "Invalid status");
  }

  if (status === SONG_STATUS.REJECTED && !rejectReason) {
    throw createError(400, "reject_reason is required for rejected status");
  }

  const [songs] = await db.query("SELECT id FROM songs WHERE id = ?", [songId]);
  if (!songs[0]) {
    throw createError(404, "Song not found");
  }

await db.query(
  `
  UPDATE songs
  SET
    status = ?,
    reviewed_by = ?,
    reject_reason = ?,
    reviewed_at = CURRENT_TIMESTAMP,
    release_date = CASE
      WHEN ? = 'approved' AND release_date IS NULL
      THEN CURRENT_TIMESTAMP
      ELSE release_date
    END
  WHERE id = ?
  `,
  [
    status,
    reviewerId || null,
    status === SONG_STATUS.REJECTED ? rejectReason || null : null,
    status,
    songId,
  ]
);


  return getSongById(songId);
};
export const listSongs = async ({
page,
  limit,
  offset,
  genres = [],
  status,
  artistId,
  albumId,
  includeUnreleased = false,
  keyword,
}) => {
const filters = ["1=1"];
  const params = [];

  if (keyword) {
    const normalizedKeyword = `%${keyword}%`;
    filters.push(
      "(s.title LIKE ? OR ar.name LIKE ? OR al.title LIKE ?)"
    );
    params.push(normalizedKeyword, normalizedKeyword, normalizedKeyword);
  }

  if (!includeUnreleased) {
    filters.push("s.status = 'approved'");
    filters.push("s.release_date IS NOT NULL");
    filters.push("s.release_date <= NOW()");
  }
  if (includeUnreleased && status) {
    filters.push("s.status = ?");
    params.push(status);
  }

  const normalizedGenres = normalizeGenres(genres);
  if (normalizedGenres.length) {
    const placeholders = normalizedGenres.map(() => "?").join(",");
    filters.push(
      `EXISTS (
        SELECT 1
        FROM song_genres sg
        JOIN genres g ON g.id = sg.genre_id
        WHERE sg.song_id = s.id
          AND g.name IN (${placeholders})
      )`
    );
    params.push(...normalizedGenres);
  }

  if (artistId) {
    filters.push("s.artist_id = ?");
    params.push(artistId);
  }

  if (albumId) {
    filters.push("s.album_id = ?");
    params.push(albumId);
  }

  const whereClause = `WHERE ${filters.join(" AND ")}`;

  const [rows] = await db.query(
    `
    SELECT
      s.*,
      ar.name AS artist_name,
      al.title AS album_title,
      (
        SELECT GROUP_CONCAT(DISTINCT g.name ORDER BY g.name SEPARATOR ',')
        FROM song_genres sg
        JOIN genres g ON g.id = sg.genre_id
        WHERE sg.song_id = s.id
      ) AS genres
    FROM songs s
    LEFT JOIN artists ar ON ar.id = s.artist_id
    LEFT JOIN albums al ON al.id = s.album_id
    ${whereClause}
    ORDER BY s.release_date DESC
    LIMIT ? OFFSET ?
    `,
    [...params, limit, offset]
  );

  return {
    items: rows.map((row) => ({
      ...row,
      genres: parseGenreString(row.genres),
    })),
    meta: { page, limit },
  };
};

export const getSongById = async (
  id,
  { includeUnreleased = false } = {}
) => {
  const filters = ["s.id = ?"];
  const params = [id];

  // 🔐 USER → chỉ thấy approved
  if (!includeUnreleased) {
    filters.push("s.status = 'approved'");
  }

  if (!includeUnreleased) {
    filters.push("s.release_date IS NOT NULL");
    filters.push("s.release_date <= NOW()");
  }

  const whereClause = `WHERE ${filters.join(" AND ")}`;

  const [rows] = await db.query(
    `
    SELECT
      s.*,
      ar.name AS artist_name,
      al.title AS album_title,
      al.release_date AS album_release_date,
      (
        SELECT GROUP_CONCAT(DISTINCT g.name ORDER BY g.name SEPARATOR ',')
        FROM song_genres sg
        JOIN genres g ON g.id = sg.genre_id
        WHERE sg.song_id = s.id
      ) AS genres
    FROM songs s
    LEFT JOIN artists ar ON ar.id = s.artist_id
    LEFT JOIN albums al ON al.id = s.album_id
    ${whereClause}
    LIMIT 1;
    `,
    params
  );

  if (!rows[0]) return null;

  return {
    ...rows[0],
    genres: parseGenreString(rows[0].genres),
  };
};

export const likeSong = async (songId, userId) => {
  const [songs] = await db.query(
    `
    SELECT id
    FROM songs
    WHERE id = ?
      AND status = 'approved'
      AND release_date IS NOT NULL
      AND release_date <= NOW()
    `,
    [songId]
  );
  if (!songs[0]) {
    throw createError(404, "Song not found");
  }

  await db.query(
    `
    INSERT INTO song_likes (song_id, user_id)
    VALUES (?, ?)
    ON DUPLICATE KEY UPDATE song_id = song_id
  `,
    [songId, userId]
  );

  return getSongEngagement(songId);
};

export const unlikeSong = async (songId, userId) => {
  const [songs] = await db.query("SELECT id FROM songs WHERE id = ?", [songId]);
  if (!songs[0]) {
    throw createError(404, "Song not found");
  }

  await db.query("DELETE FROM song_likes WHERE song_id = ? AND user_id = ?", [
    songId,
    userId,
  ]);

  return getSongEngagement(songId);
};
const MIN_INTERVAL_SECONDS = 300; // 5 phút

const hasRecentListening = async (userId, songId) => {
  const [rows] = await db.query(
    `
    SELECT 1
    FROM listening_history
    WHERE user_id = ?
      AND song_id = ?
      AND listened_at >= NOW() - INTERVAL ? SECOND
    LIMIT 1
    `,
    [userId, songId, MIN_INTERVAL_SECONDS]
  );

  return Boolean(rows[0]);
};

const getWeekStartDate = () => {
  return `
    DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY)
  `;
};
export const recordSongPlay = async (songId, userId, duration = null) => {
  /**
   * 0️⃣ CHẶN NHẠC CHƯA PHÁT HÀNH
   * - Bài phải tồn tại
   * - status = approved
   * - release_date đã tới
   */
  const [songRows] = await db.query(
    `
    SELECT s.id
    FROM songs s
    WHERE s.id = ?
      AND s.status = 'approved'
      AND s.release_date IS NOT NULL
      AND s.release_date <= NOW()
    LIMIT 1
    `,
    [songId]
  );

  if (!songRows[0]) {
    throw createError(404, "Song not released or not found");
  }

  /**
   * 1️⃣ phải nghe thật ≥ 30s
   */
  if (!Number.isFinite(duration) || duration < 30) {
    return getSongEngagement(songId);
  }

  /**
   * 2️⃣ chống spam: đã nghe trong 5 phút gần nhất?
   */
  if (userId) {
    const alreadyCounted = await hasRecentListening(userId, songId);
    if (alreadyCounted) {
      return getSongEngagement(songId);
    }
  }

  /**
   * 3️⃣ tăng play_count (tổng)
   */
  const [result] = await db.query(
    "UPDATE songs SET play_count = play_count + 1 WHERE id = ?",
    [songId]
  );

  if (!result.affectedRows) {
    throw createError(404, "Song not found");
  }

  /**
   * 4️⃣ lưu listening history
   */
  if (userId) {
    await recordListeningHistory(userId, songId, duration);
  }

  /**
   * 5️⃣ thống kê theo NGÀY
   */
  await db.query(
    `
    INSERT INTO song_play_stats (song_id, period_type, period_start, play_count)
    VALUES (?, 'day', CURDATE(), 1)
    ON DUPLICATE KEY UPDATE play_count = play_count + 1
    `,
    [songId]
  );

  /**
   * 6️⃣ thống kê theo TUẦN
   */
  await db.query(
    `
    INSERT INTO song_play_stats (song_id, period_type, period_start, play_count)
    VALUES (
      ?,
      'week',
      DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY),
      1
    )
    ON DUPLICATE KEY UPDATE play_count = play_count + 1
    `,
    [songId]
  );

  /**
   * 7️⃣ trả kết quả
   */
  return getSongEngagement(songId);
};






export const incrementPlayCount = async (songId) => {
  const [result] = await db.query(
    "UPDATE songs SET play_count = play_count + 1 WHERE id = ?",
    [songId]
  );

  if (!result.affectedRows) {
    throw createError(404, "Song not found");
  }

  return getSongEngagement(songId);
};

export const getSongStats = async (songId) => getSongEngagement(songId);
export const createSong = async ({
  title,
  artist_id,
  album_id,
  duration,
  audio_path,
  cover_url,
  status = SONG_STATUS.APPROVED,
  release_date,
  genres = [],
  zing_song_id,
}) => {
  if (!title) {
    throw createError(400, "title is required");
  }

  const allowedStatuses = Object.values(SONG_STATUS);
  if (status && !allowedStatuses.includes(status)) {
    throw createError(400, "Invalid status");
  }

  const [result] = await db.query(
    `
    INSERT INTO songs (
      title,
      artist_id,
      album_id,
      duration,
      audio_path,
      cover_url,
      status,
      release_date,
      zing_song_id
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    [
      title,
      artist_id || null,
      album_id || null,
      duration || null,
      audio_path || null,
      cover_url || null,
      status,
      release_date || null,
      zing_song_id || null,
    ]
  );

  await syncSongGenres(result.insertId, genres);
  return getSongById(result.insertId);
};

export const updateSong = async (
  id,
  {
    title,
    artist_id,
    album_id,
    duration,
    audio_path,
    cover_url,
    status,
    release_date,
    genres,
    zing_song_id,
  }
) => {
  const [existing] = await db.query("SELECT * FROM songs WHERE id = ?", [id]);
  if (!existing[0]) {
    throw createError(404, "Song not found");
  }

  const allowedStatuses = Object.values(SONG_STATUS);
  if (status && !allowedStatuses.includes(status)) {
    throw createError(400, "Invalid status");
  }

  const fields = [];
  const values = [];

  const updatable = {
    title,
    artist_id,
    album_id,
    duration,
    audio_path,
    cover_url,
    status,
    release_date,
    zing_song_id,
  };

  Object.entries(updatable).forEach(([key, value]) => {
    if (value !== undefined) {
      fields.push(`${key} = ?`);
      values.push(value);
    }
  });

  if (fields.length) {
    values.push(id);
    await db.query(
      `UPDATE songs SET ${fields.join(", ")} WHERE id = ?`,
      values
    );
  }

  if (genres !== undefined) {
    await syncSongGenres(id, genres);
  }

  return getSongById(id);
};

export const deleteSong = async (id) => {
  const [result] = await db.query("DELETE FROM songs WHERE id = ?", [id]);
  if (!result.affectedRows) {
    throw createError(404, "Song not found");
  }
};
export const listSongsByArtist = async (
  artistId,
  { includeUnreleased = false } = {}
) => {
  const [artistRows] = await db.query(
    `
    SELECT
      id,
      name,
      alias,
      bio,
      short_bio,
      avatar_url,
      cover_url,
      birthday,
      realname,
      national
    FROM artists
    WHERE id = ?
    LIMIT 1
    `,
    [artistId]
  );
  if (!artistRows[0]) {
    throw new Error("Artist not found");
  }
  const [songRows] = await db.query(
    `
    SELECT
      s.id,
      s.title,
      s.duration,
      s.audio_path,
      s.cover_url,
      s.album_id,
      s.status,
      al.title AS album_title
    FROM songs s
    LEFT JOIN albums al ON s.album_id = al.id
    WHERE s.artist_id = ?
      AND ${includeUnreleased ? "1=1" : "s.status = 'approved'"}
      AND ${includeUnreleased ? "1=1" : "s.audio_path IS NOT NULL"}
      ${
        includeUnreleased
          ? ""
          : "AND s.release_date IS NOT NULL AND s.release_date <= NOW()"
      }
    ORDER BY s.release_date DESC
    `,
    [artistId]
  );

  return {
    artist: artistRows[0],
    songs: songRows,
  };
};

export const getLikedSongsByUser = async (userId) => {
  const [rows] = await db.query(
    `
    SELECT s.id
    FROM song_likes ls
    JOIN songs s ON s.id = ls.song_id
    WHERE ls.user_id = ?
  `,
    [userId]
  );

  return rows;
};

export const getLikedSongs= async (userId) => {
  const [rows] = await db.query(
    `
    SELECT
      s.id,
      s.title,
      s.duration,
      s.audio_path,
      s.cover_url,
      s.artist_id,
      ar.name AS artist_name,
      s.album_id,
      al.title AS album_title,
      sl.liked_at
    FROM song_likes sl
    JOIN songs s ON s.id = sl.song_id
    LEFT JOIN artists ar ON ar.id = s.artist_id
    LEFT JOIN albums al ON al.id = s.album_id
    WHERE sl.user_id = ?
    AND s.status = 'approved'
      AND s.release_date IS NOT NULL
      AND s.release_date <= NOW()
    ORDER BY sl.liked_at DESC
    `,
    [userId]
  );

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    duration: row.duration,
    audio_url: row.audio_path,
    cover_url: row.cover_url,
    artist_id: row.artist_id,
    artist_name: row.artist_name,
    album_id: row.album_id,
    album_title: row.album_title,
    liked_at: row.liked_at,
  }));
};

export default {
  listSongs,
  getSongById,
  likeSong,
  unlikeSong,
  recordSongPlay,
  incrementPlayCount,
  getSongStats,
  reviewSong,
  updateSongMedia,
  createSong,
  updateSong,
  deleteSong,
  listSongsByArtist,
  getLikedSongsByUser,
  getLikedSongs
};
