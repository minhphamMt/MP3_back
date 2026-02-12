import db from "../config/db.js";
import { buildPaginationMeta } from "../utils/pagination.js";
const createError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

export const recordListeningHistory = async (
  userId,
  songId,
  duration
) => {
  if (!userId) {
    throw createError(400, "User is required to record listening history");
  }

  if (!Number.isFinite(duration) || duration < 30) {
    // an toàn thêm 1 lớp
    return;
  }

  await db.query(
    `
    INSERT INTO listening_history (user_id, song_id, duration)
    VALUES (?, ?, ?)
    `,
    [userId, songId, duration]
  );
};




const parseGenreString = (genreString) =>
  genreString ? genreString.split(",").filter(Boolean) : [];

export const getUserListeningHistory = async (
  userId,
  { page, limit, offset }
) => {
  // total
  const [countRows] = await db.query(
    `
    SELECT COUNT(*) AS total
    FROM listening_history lh
    JOIN songs s ON s.id = lh.song_id
    WHERE lh.user_id = ?
    AND s.is_deleted = 0
    `,
    [userId]
  );

  const total = countRows[0]?.total || 0;

  if (!total) {
    return {
      items: [],
      meta: buildPaginationMeta(page, limit, 0),
    };
  }

  // data
  const [rows] = await db.query(
    `
    SELECT
  lh.id AS history_id,
  lh.listened_at,
  lh.duration,

  s.id AS song_id,
  s.title AS song_title,
  s.cover_url,
  s.duration AS song_duration,

  ar.id AS artist_id,
  ar.name AS artist_name,

  al.id AS album_id,
  al.title AS album_title,

  GROUP_CONCAT(DISTINCT g.name) AS genres

FROM listening_history lh
JOIN songs s ON s.id = lh.song_id
LEFT JOIN artists ar ON ar.id = s.artist_id
LEFT JOIN albums al ON al.id = s.album_id
LEFT JOIN song_genres sg ON sg.song_id = s.id
LEFT JOIN genres g ON g.id = sg.genre_id

WHERE lh.user_id = ?
AND s.is_deleted = 0
AND (ar.id IS NULL OR ar.is_deleted = 0)
AND (al.id IS NULL OR al.is_deleted = 0)

GROUP BY 
  lh.id,
  lh.listened_at,
  lh.duration,
  s.id,
  s.title,
  s.cover_url,
  s.duration,
  ar.id,
  ar.name,
  al.id,
  al.title

ORDER BY lh.listened_at DESC
LIMIT ? OFFSET ?
    `,
    [userId, limit, offset]
  );

  const items = rows.map((row) => ({
    id: row.history_id,
    listened_at: row.listened_at,
    duration: row.duration,
    song: {
      id: row.song_id,
      title: row.song_title,
      cover_url: row.cover_url,
      duration: row.song_duration,
      genres: parseGenreString(row.genres),
      artist: row.artist_id
        ? { id: row.artist_id, name: row.artist_name }
        : null,
      album: row.album_id
        ? { id: row.album_id, title: row.album_title }
        : null,
    },
  }));

  return {
    items,
    meta: buildPaginationMeta(page, limit, total),
  };
};


export default {
  recordListeningHistory,
  getUserListeningHistory
};
