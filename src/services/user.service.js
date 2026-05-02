import bcrypt from "bcrypt";
import db from "../config/db.js";
import ROLES from "../constants/roles.js";
import { validatePassword } from "../utils/password.util.js";
import { createArtist, getArtistByUserIdWithDeleted } from "./artist.service.js";
import { invalidateSearchIndexCache } from "./search-index.service.js";

const SALT_ROUNDS = 10;
const DEFAULT_ROLE_REVOKE_REASON = "Artist role revoked by admin";

const createError = (status, message) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

const sanitizeUser = (user) => {
  if (!user) return null;
  const { password, password_hash, ...rest } = user;
  return rest;
};

const ensureArtistProfileForUser = async ({
  userId,
  displayName,
  artistName,
  bio,
  avatarUrl,
}) => {
  if (!userId) return;

  const resolvedName = artistName || displayName;
  const hasRequestProfile =
    artistName !== undefined || bio !== undefined || avatarUrl !== undefined;

  const existingArtist = await getArtistByUserIdWithDeleted(userId);
  if (existingArtist) {
    const resolvedBio =
      bio === undefined ? existingArtist.bio ?? null : bio || null;
    const resolvedAvatarUrl =
      avatarUrl === undefined
        ? existingArtist.avatar_url ?? null
        : avatarUrl || null;

    if (existingArtist.is_deleted) {
      await db.query(
        `
        UPDATE artists
        SET is_deleted = 0,
            deleted_by = NULL,
            deleted_by_role = NULL,
            deleted_at = NULL,
            name = ?,
            bio = ?,
            avatar_url = ?
        WHERE id = ?
        `,
        [
          resolvedName,
          resolvedBio,
          resolvedAvatarUrl,
          existingArtist.id,
        ]
      );
    } else if (hasRequestProfile) {
      await db.query(
        `
        UPDATE artists
        SET name = ?,
            bio = ?,
            avatar_url = ?
        WHERE id = ?
        `,
        [
          resolvedName,
          resolvedBio,
          resolvedAvatarUrl,
          existingArtist.id,
        ]
      );
    }
    return;
  }

  const artistPayload = {
    user_id: userId,
    name: resolvedName,
  };

  if (bio !== undefined) {
    artistPayload.bio = bio || null;
  }

  if (avatarUrl !== undefined) {
    artistPayload.avatar_url = avatarUrl || null;
  }

  await createArtist(artistPayload);
};

export const getAllUsers = async () => {
  const [rows] = await db.query("SELECT * FROM users");
  return rows.map(sanitizeUser);
};

export const getUserById = async (id) => {
  const [rows] = await db.query("SELECT * FROM users WHERE id = ?", [id]);
  return sanitizeUser(rows[0]);
};

export const createUser = async ({
  display_name,
  name,
  email,
  password,
  role = ROLES.USER,
  is_active = 1,
  avatar_url,
}) => {
  const displayName = display_name ?? name;

  if (!displayName) {
    throw createError(400, "display_name is required");
  }
  if (!email) {
    throw createError(400, "email is required");
  }
  if (!password) {
    throw createError(400, "password is required");
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    throw createError(400, passwordError);
  }

  const allowedRoles = Object.values(ROLES);
  if (role && !allowedRoles.includes(role)) {
    throw createError(400, "Invalid role");
  }

  const [existing] = await db.query("SELECT id FROM users WHERE email = ?", [
    email,
  ]);
  if (existing.length > 0) {
    throw createError(409, "Email already registered");
  }

  const artistRegisterIntent = role === ROLES.ARTIST ? 1 : 0;
  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
  const [result] = await db.query(
    `INSERT INTO users (
      display_name,
      email,
      password_hash,
      role,
      is_active,
      avatar_url,
      artist_register_intent
    )
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      displayName,
      email,
      hashedPassword,
      role,
      is_active ? 1 : 0,
      avatar_url || null,
      artistRegisterIntent,
    ]
  );

  if (role === ROLES.ARTIST) {
    await ensureArtistProfileForUser({
      userId: result.insertId,
      displayName,
    });
  }

  invalidateSearchIndexCache("admin");
  return getUserById(result.insertId);
};

const revokeArtistProfileForUser = async ({ userId, revokedBy }) => {
  if (!userId) return;

  await db.query(
    `
    UPDATE artists
    SET is_deleted = 1,
        deleted_by = ?,
        deleted_by_role = ?,
        deleted_at = NOW()
    WHERE user_id = ?
      AND is_deleted = 0
    `,
    [revokedBy || null, ROLES.ADMIN, userId]
  );
};

const rejectArtistRequestsForUser = async ({
  userId,
  reviewerId,
  rejectReason,
}) => {
  if (!userId) return;

  await db.query(
    `
    UPDATE artist_requests
    SET status = 'rejected',
        reject_reason = ?,
        reviewed_by = ?,
        reviewed_at = CURRENT_TIMESTAMP
    WHERE user_id = ?
    `,
    [
      rejectReason || DEFAULT_ROLE_REVOKE_REASON,
      reviewerId || null,
      userId,
    ]
  );
};

const getArtistRequestForUser = async (userId) => {
  if (!userId) return null;

  const [rows] = await db.query(
    `
    SELECT id, artist_name, bio, avatar_url, status
    FROM artist_requests
    WHERE user_id = ?
    LIMIT 1
    `,
    [userId]
  );

  return rows[0] || null;
};

const approveArtistRequestForUser = async ({ userId, reviewerId }) => {
  if (!userId) return;

  await db.query(
    `
    UPDATE artist_requests
    SET status = 'approved',
        reject_reason = NULL,
        reviewed_by = ?,
        reviewed_at = CURRENT_TIMESTAMP
    WHERE user_id = ?
    `,
    [reviewerId || null, userId]
  );
};

export const updateUserProfile = async (id, data) => {
  const displayNameUpdate = data.display_name ?? data.name;
  const normalizedData = { ...data };

  if (displayNameUpdate !== undefined) {
    normalizedData.display_name = displayNameUpdate;
  }

  delete normalizedData.name;

  const [existingRows] = await db.query("SELECT * FROM users WHERE id = ?", [
    id,
  ]);
  const existingUser = existingRows[0];

  if (!existingUser) {
    throw createError(404, "User not found");
  }

  if (
    normalizedData.email !== undefined &&
    normalizedData.email !== existingUser.email &&
    existingUser.email !== undefined
  ) {
    const [emailRows] = await db.query(
      "SELECT id FROM users WHERE email = ? AND id <> ?",
      [normalizedData.email, id]
    );
    if (emailRows.length > 0) {
      throw createError(409, "Email already in use");
    }
  }

  const fields = [];
  const values = [];

  const immutableFields = new Set([
    "id",
    "password",
    "password_hash",
    "created_at",
    "updated_at",
  ]);

  Object.keys(existingUser).forEach((field) => {
    if (immutableFields.has(field)) return;

    if (normalizedData[field] !== undefined) {
      fields.push(`${field} = ?`);
      values.push(normalizedData[field]);
    }
  });

  if (fields.length === 0) {
    return sanitizeUser(existingUser);
  }

  values.push(id);

  await db.query(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`, values);

  invalidateSearchIndexCache("admin");
  return getUserById(id);
};

export const deleteUser = async (id) => {
  await db.query("DELETE FROM users WHERE id = ?", [id]);
  invalidateSearchIndexCache("admin");
};

export const changePassword = async (id, oldPassword, newPassword) => {
  if (!oldPassword || !newPassword) {
    throw createError(400, "Old password and new password are required");
  }

  const [rows] = await db.query("SELECT * FROM users WHERE id = ?", [id]);
  const user = rows[0];

  if (!user) {
    throw createError(404, "User not found");
  }

  const isMatch = await bcrypt.compare(oldPassword, user.password_hash);
  if (!isMatch) {
    throw createError(400, "Old password is incorrect");
  }

  const passwordError = validatePassword(newPassword, {
    fieldName: "Mat khau moi",
  });
  if (passwordError) {
    throw createError(400, passwordError);
  }

  const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await db.query("UPDATE users SET password_hash = ? WHERE id = ?", [
    hashedPassword,
    id,
  ]);

  return sanitizeUser({ ...user, password_hash: undefined });
};

export const setActiveStatus = async (id, isActive) => {
  const [rows] = await db.query("SELECT id FROM users WHERE id = ?", [id]);
  const user = rows[0];

  if (!user) {
    throw createError(404, "User not found");
  }

  await db.query("UPDATE users SET is_active = ? WHERE id = ?", [
    isActive ? 1 : 0,
    id,
  ]);
  invalidateSearchIndexCache("admin");
  return getUserById(id);
};

export const setUserRole = async (
  id,
  role,
  { reviewerId, rejectReason, syncArtistRequest = true } = {}
) => {
  if (!role) {
    throw createError(400, "role is required");
  }

  const allowedRoles = Object.values(ROLES);
  if (!allowedRoles.includes(role)) {
    throw createError(400, "Invalid role");
  }

  const [rows] = await db.query("SELECT id FROM users WHERE id = ?", [id]);
  const user = rows[0];

  if (!user) {
    throw createError(404, "User not found");
  }

  await db.query(
    `UPDATE users
     SET role = ?,
         artist_register_intent = CASE
           WHEN ? = ? THEN 1
           WHEN ? = ? THEN 0
           ELSE artist_register_intent
         END
     WHERE id = ?`,
    [role, role, ROLES.ARTIST, role, ROLES.USER, id]
  );

  if (role === ROLES.ARTIST) {
    const fullUser = await getUserById(id);
    const artistRequest = syncArtistRequest
      ? await getArtistRequestForUser(id)
      : null;

    await ensureArtistProfileForUser({
      userId: id,
      displayName: fullUser?.display_name || `Artist ${id}`,
      artistName: artistRequest?.artist_name,
      bio: artistRequest?.bio,
      avatarUrl: artistRequest?.avatar_url,
    });

    if (syncArtistRequest && artistRequest) {
      await approveArtistRequestForUser({
        userId: id,
        reviewerId,
      });
    }
  }

  if (role === ROLES.USER) {
    await revokeArtistProfileForUser({
      userId: id,
      revokedBy: reviewerId,
    });

    if (syncArtistRequest) {
      await rejectArtistRequestsForUser({
        userId: id,
        reviewerId,
        rejectReason,
      });
    }
  }

  invalidateSearchIndexCache(role === ROLES.USER ? null : "admin");
  return getUserById(id);
};
