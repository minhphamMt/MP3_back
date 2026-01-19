import bcrypt from "bcrypt";
import db from "../config/db.js";
import ROLES from "../constants/roles.js";

const SALT_ROUNDS = 10;

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

export const getAllUsers = async () => {
  const [rows] = await db.query("SELECT * FROM users");
  return rows.map(sanitizeUser);
};

export const getUserById = async (id) => {
  const [rows] = await db.query("SELECT * FROM users WHERE id = ?", [id]);
  return sanitizeUser(rows[0]);
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

  return getUserById(id);
};

export const deleteUser = async (id) => {
  await db.query("DELETE FROM users WHERE id = ?", [id]);
};

export const changePassword = async (id, oldPassword, newPassword) => {
  const [rows] = await db.query("SELECT * FROM users WHERE id = ?", [id]);
  const user = rows[0];

  if (!user) {
    throw createError(404, "User not found");
  }

  const isMatch = await bcrypt.compare(oldPassword, user.password_hash);
  if (!isMatch) {
    throw createError(400, "Old password is incorrect");
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
  return getUserById(id);
};

export const setUserRole = async (id, role) => {
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

  await db.query("UPDATE users SET role = ? WHERE id = ?", [role, id]);
  return getUserById(id);
};

export default {
  getAllUsers,
  getUserById,
  updateUserProfile,
  deleteUser,
  changePassword,
  setActiveStatus,
  setUserRole,
};
