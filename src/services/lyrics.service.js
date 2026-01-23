import db from "../config/db.js";

const createError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

export const listLyricsBySongId = async (songId) => {
  if (!songId) {
    throw createError(400, "songId is required");
  }

  const [rows] = await db.query(
    `
    SELECT id, song_id, start_time, end_time, text
    FROM lyrics
    WHERE song_id = ?
    ORDER BY start_time ASC
    `,
    [songId]
  );

  return rows;
};

const fetchLyricLine = async (songId, comparator, timeMs, order) => {
  const [rows] = await db.query(
    `
    SELECT id, song_id, start_time, end_time, text
    FROM lyrics
    WHERE song_id = ? AND start_time ${comparator} ?
    ORDER BY start_time ${order}
    LIMIT 1
    `,
    [songId, timeMs]
  );

  return rows[0] || null;
};

export const getLyricSnapshot = async (songId, timeMs) => {
  if (!songId) {
    throw createError(400, "songId is required");
  }

  if (!Number.isFinite(timeMs) || timeMs < 0) {
    throw createError(400, "time must be a non-negative number");
  }

  const [currentRows] = await db.query(
    `
    SELECT id, song_id, start_time, end_time, text
    FROM lyrics
    WHERE song_id = ? AND start_time <= ? AND end_time >= ?
    ORDER BY start_time DESC
    LIMIT 1
    `,
    [songId, timeMs, timeMs]
  );

  const current = currentRows[0] || null;

  let previous = null;
  let next = null;

  if (current) {
    previous = await fetchLyricLine(songId, "<", current.start_time, "DESC");
    next = await fetchLyricLine(songId, ">", current.start_time, "ASC");
  } else {
    previous = await fetchLyricLine(songId, "<", timeMs, "DESC");
    next = await fetchLyricLine(songId, ">", timeMs, "ASC");
  }

  return {
    current,
    previous,
    next,
  };
};

export default {
  listLyricsBySongId,
  getLyricSnapshot,
};