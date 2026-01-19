import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import db from "../config/db.js";
import { ROLES } from "../constants/roles.js";
import admin from "../config/firebase.js";

const SALT_ROUNDS = 10;

export const firebaseLoginUser = async ({ idToken }) => {
  if (!idToken) {
    throw createError(400, "idToken is required");
  }

  // 1. Verify Firebase ID Token
  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(idToken);
  } catch (err) {
    throw createError(401, "Invalid Firebase token");
  }

  const firebaseUid = decoded.uid;
  const email = decoded.email;

  if (!email) {
    throw createError(400, "Firebase account has no email");
  }

  const displayName =
    decoded.name || decoded.display_name || email.split("@")[0];
  const avatarUrl = decoded.picture || null;

  // 2. Find user by firebase_uid OR email
  const [rows] = await db.query(
    "SELECT * FROM users WHERE firebase_uid = ? OR email = ? LIMIT 1",
    [firebaseUid, email]
  );

  let user = rows[0];

  // 3. Existing but disabled
  if (user && !user.is_active) {
    throw createError(403, "Account is disabled");
  }

  // 4. Existing local user → link Firebase
  if (user && !user.firebase_uid) {
    await db.query(
      `UPDATE users
       SET firebase_uid = ?,
           auth_provider = 'firebase',
           password_hash = NULL,
           avatar_url = COALESCE(avatar_url, ?),
           display_name = COALESCE(display_name, ?)
       WHERE id = ?`,
      [firebaseUid, avatarUrl, displayName, user.id]
    );

    const [reload] = await db.query("SELECT * FROM users WHERE id = ?", [
      user.id,
    ]);
    user = reload[0];
  }

  // 5. New Firebase user
  if (!user) {
    const [result] = await db.query(
      `INSERT INTO users
        (email, password_hash, display_name, avatar_url, role, is_active, firebase_uid, auth_provider)
       VALUES (?, NULL, ?, ?, ?, 1, ?, 'firebase')`,
      [email, displayName, avatarUrl, ROLES.USER, firebaseUid]
    );

    const [created] = await db.query(
      "SELECT * FROM users WHERE id = ?",
      [result.insertId]
    );
    user = created[0];
  }

  // 6. Issue JWT
  const tokens = generateTokens(user);
  return { user: sanitizeUser(user), ...tokens };
};


const sanitizeUser = (user) => {
  if (!user) return null;
  const { password, password_hash, ...rest } = user;
  return rest;
};

const createError = (status, message) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

const generateTokens = (user) => {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured");
  }

  const payload = {
    id: user.id,
    email: user.email,
    role: user.role,
  };

  const accessToken = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "5h",
  });

  const refreshSecret =
    process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;

  const refreshToken = jwt.sign(payload, refreshSecret, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d",
  });

  return { accessToken, refreshToken };
};

export const registerUser = async ({ display_name, name, email, password }) => {
  const displayName = display_name ?? name;

  if (!displayName) {
    throw createError(400, "display_name is required");
  }

  const [existing] = await db.query("SELECT id FROM users WHERE email = ?", [
    email,
  ]);
  if (existing.length > 0) {
    throw createError(409, "Email already registered");
  }

  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
  const [result] = await db.query(
    "INSERT INTO users (display_name, email, password_hash, role, is_active) VALUES (?, ?, ?, ?, ?)",
    [displayName, email, hashedPassword, ROLES.USER, 1]
  );

  const user = {
    id: result.insertId,
    display_name: displayName,
    email,
    role: ROLES.USER,
    is_active: 1,
  };

  const tokens = generateTokens(user);
  return { user: sanitizeUser(user), ...tokens };
};

export const loginUser = async ({ email, password }) => {
  const [rows] = await db.query("SELECT * FROM users WHERE email = ?", [email]);
  const user = rows[0];
  if (!user) {
    throw createError(401, "Invalid credentials");
  }
  if (user.auth_provider === "firebase") {
    throw createError(400, "Use Firebase login");
  }

  if (!user.is_active) {
    throw createError(403, "Account is disabled");
  }

  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) {
    throw createError(401, "Invalid credentials");
  }

  const tokens = generateTokens(user);
  return { user: sanitizeUser(user), ...tokens };
};

export const refreshTokens = async (refreshToken) => {
  if (!refreshToken) {
    throw createError(400, "Refresh token is required");
  }

  const refreshSecret =
    process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;

  try {
    const decoded = jwt.verify(refreshToken, refreshSecret);
    const [rows] = await db.query("SELECT * FROM users WHERE id = ?", [
      decoded.id,
    ]);
    const user = rows[0];

    if (!user) {
      throw createError(404, "User not found");
    }

    if (!user.is_active) {
      throw createError(403, "Account is disabled");
    }

    const tokens = generateTokens(user);
    return { user: sanitizeUser(user), ...tokens };
  } catch (error) {
    if (error.status) throw error;
    throw createError(401, "Invalid or expired refresh token");
  }
};

export default {
  registerUser,
  loginUser,
  refreshTokens,
  firebaseLoginUser,
};
