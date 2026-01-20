import db from "../config/db.js";

const createError = (status, message) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

/**
 * Like album
 */
export const likeAlbum = async (userId, albumId) => {
  if (!userId || !albumId) {
    throw createError(400, "userId and albumId are required");
  }

  // check album exists
  const [albums] = await db.query(
     `
    SELECT id
    FROM albums
    WHERE id = ?
      AND release_date IS NOT NULL
      AND release_date <= NOW()
    `,
    [albumId]
  );
  if (!albums[0]) {
    throw createError(404, "Album not found");
  }

  // insert like (ignore duplicate)
  await db.query(
    `
    INSERT INTO album_likes (user_id, album_id)
    VALUES (?, ?)
    ON DUPLICATE KEY UPDATE liked_at = liked_at
    `,
    [userId, albumId]
  );

  return { liked: true };
};

/**
 * Unlike album
 */
export const unlikeAlbum = async (userId, albumId) => {
  if (!userId || !albumId) {
    throw createError(400, "userId and albumId are required");
  }

  await db.query(
    `
    DELETE FROM album_likes
    WHERE user_id = ? AND album_id = ?
    `,
    [userId, albumId]
  );

  return { liked: false };
};

/**
 * Get liked albums of user
 */
export const getLikedAlbums = async (userId) => {
  if (!userId) return [];

  const [rows] = await db.query(
    `
    SELECT
      al.id,
      al.title,
      al.cover_url,
      al.release_date,
      al.artist_id,
      ar.name AS artist_name,
      alikes.liked_at
    FROM album_likes alikes
    JOIN albums al ON al.id = alikes.album_id
    LEFT JOIN artists ar ON ar.id = al.artist_id
    WHERE alikes.user_id = ?
    AND al.release_date IS NOT NULL
    AND al.release_date <= NOW()
    ORDER BY alikes.liked_at DESC
    `,
    [userId]
  );

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    cover_url: row.cover_url,
    release_date: row.release_date,
    liked_at: row.liked_at,
    artist: row.artist_id
      ? {
          id: row.artist_id,
          name: row.artist_name,
        }
      : null,
  }));
};

export default {
  likeAlbum,
  unlikeAlbum,
  getLikedAlbums,
};
