import bcrypt from "bcrypt";
import db from "../config/db.js";

const SALT_ROUNDS = 10;

const createError = (status, message) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

const sanitizeUser = (user) => {
  if (!user) return null;
  const { password, ...rest } = user;
  return rest;
};

export const getAllUsers = async () => {
  const [rows] = await db.query(
    "SELECT id, name, email, role, is_active FROM users"
  );
  return rows;
};

export const getUserById = async (id) => {
  const [rows] = await db.query(
    "SELECT id, name, email, role, is_active FROM users WHERE id = ?",
    [id]
  );
  return rows[0];
};

export const updateUserProfile = async (id, data) => {
  const [existingRows] = await db.query("SELECT * FROM users WHERE id = ?", [
    id,
  ]);
  const existingUser = existingRows[0];

  if (!existingUser) {
    throw createError(404, "User not found");
  }

  if (data.email && data.email !== existingUser.email) {
    const [emailRows] = await db.query(
      "SELECT id FROM users WHERE email = ? AND id <> ?",
      [data.email, id]
    );
    if (emailRows.length > 0) {
      throw createError(409, "Email already in use");
    }
  }

  const fields = [];
  const values = [];

  if (data.name !== undefined) {
    fields.push("name = ?");
    values.push(data.name);
  }

  if (data.email !== undefined) {
    fields.push("email = ?");
    values.push(data.email);
  }

  if (data.role !== undefined) {
    fields.push("role = ?");
    values.push(data.role);
  }

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

  const isMatch = await bcrypt.compare(oldPassword, user.password);
  if (!isMatch) {
    throw createError(400, "Old password is incorrect");
  }

  const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await db.query("UPDATE users SET password = ? WHERE id = ?", [
    hashedPassword,
    id,
  ]);

  return sanitizeUser({ ...user, password: undefined });
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

export default {
  getAllUsers,
  getUserById,
  updateUserProfile,
  deleteUser,
  changePassword,
  setActiveStatus,
};
