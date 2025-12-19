import db from "../config/db.js";
import SONG_STATUS from "../constants/song-status.js";
import { buildPaginationMeta } from "../utils/pagination.js";
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
     SET status = ?, reviewed_by = ?, reject_reason = ?, reviewed_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `,
    [
      status,
      reviewerId || null,
      status === SONG_STATUS.REJECTED ? rejectReason || null : null,
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
}) => {
  const filters = [];
  const params = [];
  const normalizedGenres = normalizeGenres(genres);

  if (status) {
    filters.push("s.status = ?");
    params.push(status);
  }

  if (artistId) {
    filters.push("s.artist_id = ?");
    params.push(artistId);
  }

  if (albumId) {
    filters.push("s.album_id = ?");
    params.push(albumId);
  }

  if (normalizedGenres.length > 0) {
    const placeholders = normalizedGenres.map(() => "?").join(",");
    filters.push(
      `EXISTS (
        SELECT 1
        FROM song_genres sg
        JOIN genres g ON g.id = sg.genre_id
        WHERE sg.song_id = s.id AND g.name IN (${placeholders})
      )`
    );
    params.push(...normalizedGenres);
  }

  const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

  const [countRows] = await db.query(
    `SELECT COUNT(*) as total FROM songs s ${whereClause}`,
    params
  );
  const total = countRows[0]?.total || 0;

  const [rows] = await db.query(
    `
    SELECT
      s.*,
      ar.name AS artist_name,
      al.title AS album_title,
      (SELECT COUNT(*) FROM song_likes sl WHERE sl.song_id = s.id) AS like_count,
      (SELECT GROUP_CONCAT(DISTINCT g2.name)
        FROM song_genres sg2
        JOIN genres g2 ON g2.id = sg2.genre_id
        WHERE sg2.song_id = s.id) AS genres
    FROM songs s
    LEFT JOIN artists ar ON ar.id = s.artist_id
    LEFT JOIN albums al ON al.id = s.album_id
    ${whereClause}
    ORDER BY s.id DESC
    LIMIT ? OFFSET ?;
  `,
    [...params, limit, offset]
  );

  const items = rows.map((row) => ({
    ...row,
    like_count: row.like_count || 0,
    genres: parseGenreString(row.genres),
    artist: row.artist_id ? { id: row.artist_id, name: row.artist_name } : null,
    album: row.album_id ? { id: row.album_id, title: row.album_title } : null,
  }));

  return {
    items,
    meta: buildPaginationMeta(page, limit, total),
  };
};

export const getSongById = async (id, { status, genres = [] } = {}) => {
  const normalizedGenres = normalizeGenres(genres);
  const filters = ["s.id = ?"];
  const params = [id];

  if (status) {
    filters.push("s.status = ?");
    params.push(status);
  }

  if (normalizedGenres.length > 0) {
    const placeholders = normalizedGenres.map(() => "?").join(",");
    filters.push(
      `EXISTS (
        SELECT 1
        FROM song_genres sg
        JOIN genres g ON g.id = sg.genre_id
        WHERE sg.song_id = s.id AND g.name IN (${placeholders})
      )`
    );
    params.push(...normalizedGenres);
  }

  const whereClause = `WHERE ${filters.join(" AND ")}`;

  const [rows] = await db.query(
    `
    SELECT
      s.*,
      ar.name AS artist_name,
      al.title AS album_title,
      (SELECT COUNT(*) FROM song_likes sl WHERE sl.song_id = s.id) AS like_count,
      (SELECT GROUP_CONCAT(DISTINCT g2.name)
        FROM song_genres sg2
        JOIN genres g2 ON g2.id = sg2.genre_id
        WHERE sg2.song_id = s.id) AS genres
    FROM songs s
    LEFT JOIN artists ar ON ar.id = s.artist_id
    LEFT JOIN albums al ON al.id = s.album_id
    ${whereClause}
    LIMIT 1;
  `,
    params
  );

  const song = rows[0];

  if (!song) {
    return null;
  }

  return {
    ...song,
    like_count: song.like_count || 0,
    genres: parseGenreString(song.genres),
    artist: song.artist_id
      ? { id: song.artist_id, name: song.artist_name }
      : null,
    album: song.album_id
      ? { id: song.album_id, title: song.album_title }
      : null,
  };
};
export const likeSong = async (songId, userId) => {
  const [songs] = await db.query("SELECT id FROM songs WHERE id = ?", [songId]);
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

export const recordSongPlay = async (songId, userId, duration = null) => {
  const [result] = await db.query(
    "UPDATE songs SET play_count = play_count + 1 WHERE id = ?",
    [songId]
  );

  if (!result.affectedRows) {
    throw createError(404, "Song not found");
  }

  if (userId) {
    await recordListeningHistory(userId, songId, duration);
  }

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
};
