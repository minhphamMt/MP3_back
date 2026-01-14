import db from "../config/db.js";

const createError = (status, message) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

/**
 * Follow artist
 */
export const followArtist = async (userId, artistId) => {
  if (!userId || !artistId) {
    throw createError(400, "userId and artistId are required");
  }

  // check artist exists
  const [artists] = await db.query(
    "SELECT id FROM artists WHERE id = ?",
    [artistId]
  );
  if (!artists[0]) {
    throw createError(404, "Artist not found");
  }

  // insert follow (ignore duplicate)
  const [result] = await db.query(
    `
    INSERT INTO artist_follows (user_id, artist_id)
    VALUES (?, ?)
    ON DUPLICATE KEY UPDATE followed_at = followed_at
    `,
    [userId, artistId]
  );

  // nếu insert mới thì affectedRows = 1
  if (result.affectedRows === 1) {
    await db.query(
      `
      UPDATE artists
      SET follow_count = follow_count + 1
      WHERE id = ?
      `,
      [artistId]
    );
  }

  return { followed: true };
};

/**
 * Unfollow artist
 */
export const unfollowArtist = async (userId, artistId) => {
  if (!userId || !artistId) {
    throw createError(400, "userId and artistId are required");
  }

  const [result] = await db.query(
    `
    DELETE FROM artist_follows
    WHERE user_id = ? AND artist_id = ?
    `,
    [userId, artistId]
  );

  if (result.affectedRows) {
    await db.query(
      `
      UPDATE artists
      SET follow_count = GREATEST(follow_count - 1, 0)
      WHERE id = ?
      `,
      [artistId]
    );
  }

  return { followed: false };
};

/**
 * Get followed artists of user
 */
export const getFollowedArtists = async (userId) => {
  if (!userId) {
    return [];
  }

  const [rows] = await db.query(
    `
    SELECT
      a.id,
      a.name,
      a.alias,
      a.short_bio,
      a.avatar_url,
      a.cover_url,
      a.national,
      a.follow_count,
      af.followed_at,

      COUNT(s.id) AS song_count
    FROM artist_follows af
    JOIN artists a ON a.id = af.artist_id
    LEFT JOIN songs s 
      ON s.artist_id = a.id
      AND s.status = 'approved'   -- nếu bạn có status

    WHERE af.user_id = ?
    GROUP BY
      a.id,
      af.followed_at
    ORDER BY af.followed_at DESC
    `,
    [userId]
  );

  return rows;
};


export default {
  followArtist,
  unfollowArtist,
  getFollowedArtists,
};
