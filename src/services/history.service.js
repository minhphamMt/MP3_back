import db from "../config/db.js";

const createError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

export const recordListeningHistory = async (userId, songId) => {
  if (!userId) {
    throw createError(400, "User is required to record listening history");
  }

  await db.query(
    `
    INSERT INTO listening_history (user_id, song_id)
    VALUES (?, ?)
  `,
    [userId, songId]
  );
};

export default {
  recordListeningHistory,
};
