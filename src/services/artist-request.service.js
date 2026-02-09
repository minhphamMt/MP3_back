import db from "../config/db.js";
import {
  createArtist,
  getArtistByUserIdWithDeleted,
  restoreArtist,
} from "./artist.service.js";
import { setUserRole } from "./user.service.js";
import { ROLES } from "../constants/roles.js";

const createError = (status, message) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

export const getArtistRequestById = async (id) => {
  if (!id) return null;
  const [rows] = await db.query(
    `
    SELECT ar.*, u.email, u.display_name
    FROM artist_requests ar
    JOIN users u ON u.id = ar.user_id
    WHERE ar.id = ?
    LIMIT 1
  `,
    [id]
  );

  return rows[0] || null;
};

export const getArtistRequestByUserId = async (userId) => {
  if (!userId) return null;
  const [rows] = await db.query(
    `
    SELECT ar.*, u.email, u.display_name
    FROM artist_requests ar
    JOIN users u ON u.id = ar.user_id
    WHERE ar.user_id = ?
    LIMIT 1
  `,
    [userId]
  );

  return rows[0] || null;
};

export const listArtistRequests = async ({
  page,
  limit,
  offset,
  status,
  keyword,
} = {}) => {
  const filters = ["1=1"];
  const params = [];

  if (status) {
    filters.push("ar.status = ?");
    params.push(status);
  }

  if (keyword) {
    const normalizedKeyword = `%${keyword}%`;
    filters.push(
      "(ar.artist_name LIKE ? OR u.email LIKE ? OR u.display_name LIKE ?)"
    );
    params.push(normalizedKeyword, normalizedKeyword, normalizedKeyword);
  }

  const whereClause = `WHERE ${filters.join(" AND ")}`;

  const [rows] = await db.query(
    `
    SELECT ar.*, u.email, u.display_name
    FROM artist_requests ar
    JOIN users u ON u.id = ar.user_id
    ${whereClause}
    ORDER BY ar.created_at DESC
    LIMIT ? OFFSET ?
  `,
    [...params, limit, offset]
  );

  return {
    items: rows,
    meta: { page, limit },
  };
};

export const createArtistRequest = async ({
  userId,
  artistName,
  bio,
  avatarUrl,
  proofLink,
}) => {
  if (!userId) {
    throw createError(400, "userId is required");
  }

  if (!artistName) {
    throw createError(400, "artist_name is required");
  }

  const [artistRows] = await db.query(
    "SELECT id FROM artists WHERE user_id = ? AND is_deleted = 0 LIMIT 1",
    [userId]
  );

  if (artistRows[0]) {
    throw createError(409, "Artist profile already exists for this user");
  }

  const [existingRows] = await db.query(
    "SELECT id, status FROM artist_requests WHERE user_id = ? LIMIT 1",
    [userId]
  );

  if (existingRows[0]) {
    throw createError(409, "Artist request already exists");
  }

  const [result] = await db.query(
    `
    INSERT INTO artist_requests (user_id, artist_name, bio, avatar_url, proof_link)
    VALUES (?, ?, ?, ?, ?)
  `,
    [userId, artistName, bio || null, avatarUrl || null, proofLink || null]
  );

  return getArtistRequestById(result.insertId);
};

export const reviewArtistRequest = async (
  requestId,
  { status, reviewerId, rejectReason }
) => {
  const allowedStatuses = ["pending", "approved", "rejected"];
  if (!allowedStatuses.includes(status)) {
    throw createError(400, "Invalid status");
  }

  if (status === "rejected" && !rejectReason) {
    throw createError(400, "reject_reason is required for rejected status");
  }

  const [requests] = await db.query(
    "SELECT * FROM artist_requests WHERE id = ? LIMIT 1",
    [requestId]
  );

  const request = requests[0];
  if (!request) {
    throw createError(404, "Artist request not found");
  }

  if (status === "approved") {
    const existingArtist = await getArtistByUserIdWithDeleted(request.user_id);

    if (existingArtist?.is_deleted) {
      await restoreArtist(existingArtist.id, {
        requesterRole: ROLES.ADMIN,
        requesterId: reviewerId,
      });
    } else if (!existingArtist) {
      await createArtist({
        name: request.artist_name,
        bio: request.bio,
        avatar_url: request.avatar_url,
        user_id: request.user_id,
      });
    }
    await setUserRole(request.user_id, ROLES.ARTIST);
  }

  await db.query(
    `
    UPDATE artist_requests
    SET
      status = ?,
      reviewed_by = ?,
      reject_reason = ?,
      reviewed_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `,
    [
      status,
      reviewerId || null,
      status === "rejected" ? rejectReason || null : null,
      requestId,
    ]
  );

  return getArtistRequestById(requestId);
};

export default {
  getArtistRequestById,
  getArtistRequestByUserId,
  listArtistRequests,
  createArtistRequest,
  reviewArtistRequest,
};
