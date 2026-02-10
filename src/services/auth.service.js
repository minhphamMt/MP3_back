import bcrypt from "bcrypt";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import db from "../config/db.js";
import { ROLES } from "../constants/roles.js";
import admin from "../config/firebase.js";
import { sendPasswordResetEmail, sendVerificationEmail } from "./email.service.js";

const SALT_ROUNDS = 10;
const EMAIL_VERIFY_EXPIRES_MINUTES = Number(
  process.env.EMAIL_VERIFY_EXPIRES_MINUTES || 30
);
const PASSWORD_RESET_EXPIRES_MINUTES = Number(
  process.env.PASSWORD_RESET_EXPIRES_MINUTES || 15
);

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

  // 2. Check existing user by email first
  const [emailRows] = await db.query(
    "SELECT * FROM users WHERE email = ? LIMIT 1",
    [email]
  );

  let user = emailRows[0];

  // 3. Existing but disabled
  if (user && !user.is_active) {
    throw createError(403, "Account is disabled");
  }

  // 4. Existing email but not a Firebase account -> block Firebase login
  if (user && user.auth_provider !== "firebase") {
    throw createError(
      409,
      "Email already exists in the system. Please use email/password login"
    );
  }

  // 5. Existing Firebase account with different UID -> block login
  if (user && user.firebase_uid && user.firebase_uid !== firebaseUid) {
    throw createError(409, "Email is linked with a different Firebase account");
  }

  // 6. New Firebase user
  if (!user) {
    const [result] = await db.query(
      `INSERT INTO users
        (email, password_hash, display_name, avatar_url, role, is_active, firebase_uid, auth_provider)
       VALUES (?, NULL, ?, ?, ?, 1, ?, 'firebase')`,
      [email, displayName, avatarUrl, ROLES.USER, firebaseUid]
    );

    const [created] = await db.query("SELECT * FROM users WHERE id = ?", [
      result.insertId,
    ]);
    user = created[0];
  }

  // 7. Issue JWT
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

  const refreshSecret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;

  const refreshToken = jwt.sign(payload, refreshSecret, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d",
  });

  return { accessToken, refreshToken };
};

const hashToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");

const createVerificationCode = () =>
  crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");

const upsertEmailVerification = async ({
  email,
  displayName,
  passwordHash,
  artistRegisterIntent,
  tokenHash,
  expiresAt,
}) => {
  await db.query(
    `INSERT INTO email_verifications
      (email, display_name, password_hash, artist_register_intent, token_hash, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
      display_name = VALUES(display_name),
      password_hash = VALUES(password_hash),
      artist_register_intent = VALUES(artist_register_intent),
      token_hash = VALUES(token_hash),
      expires_at = VALUES(expires_at),
      used_at = NULL`,
    [
      email,
      displayName,
      passwordHash,
      artistRegisterIntent ? 1 : 0,
      tokenHash,
      expiresAt,
    ]
  );
};

export const registerUser = async ({
  display_name,
  name,
  email,
  password,
  artist_register_intent = false,
}) => {
  const displayName = display_name ?? name;

  if (!displayName) {
    throw createError(400, "display_name is required");
  }

  const [existingUsers] = await db.query(
    "SELECT id FROM users WHERE email = ? LIMIT 1",
    [email]
  );

  if (existingUsers.length > 0) {
    throw createError(409, "Email already registered");
  }

  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
  const verificationCode = createVerificationCode();
  const tokenHash = hashToken(verificationCode);
  const expiresAt = new Date(
    Date.now() + EMAIL_VERIFY_EXPIRES_MINUTES * 60 * 1000
  );

  await upsertEmailVerification({
    email,
    displayName,
    passwordHash: hashedPassword,
    artistRegisterIntent: artist_register_intent,
    tokenHash,
    expiresAt,
  });

  await sendVerificationEmail({
    email,
    displayName,
    verificationCode,
  });

  return {
    message:
      "Đăng ký thành công bước 1. Vui lòng kiểm tra email để xác nhận tài khoản.",
    requires_email_verification: true,
  };
};

export const verifyEmailRegistration = async ({ email, verification_code }) => {
  if (!email || !verification_code) {
    throw createError(400, "Email và mã xác thực là bắt buộc");
  }

  const code = String(verification_code).trim();
  if (!/^\d{6}$/.test(code)) {
    throw createError(400, "Mã xác thực không hợp lệ");
  }

  const tokenHash = hashToken(code);
  const [rows] = await db.query(
    `SELECT * FROM email_verifications
      WHERE email = ?
        AND token_hash = ?
        AND used_at IS NULL
      LIMIT 1`,
    [email, tokenHash]
  );

  const verification = rows[0];
  if (!verification) {
    throw createError(400, "Token xác thực không hợp lệ hoặc đã được sử dụng");
  }

  if (new Date(verification.expires_at).getTime() < Date.now()) {
    throw createError(400, "Token xác thực đã hết hạn");
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [existingUsers] = await connection.query(
      "SELECT id FROM users WHERE email = ? LIMIT 1",
      [verification.email]
    );

    if (existingUsers.length > 0) {
      await connection.query(
        "DELETE FROM email_verifications WHERE id = ?",
        [verification.id]
      );
      await connection.commit();
      throw createError(409, "Email đã được đăng ký trước đó");
    }

    const [result] = await connection.query(
      "INSERT INTO users (display_name, email, password_hash, role, is_active, artist_register_intent) VALUES (?, ?, ?, ?, ?, ?)",
      [
        verification.display_name,
        verification.email,
        verification.password_hash,
        ROLES.USER,
        1,
        verification.artist_register_intent,
      ]
    );

    await connection.query(
      "DELETE FROM email_verifications WHERE id = ?",
      [verification.id]
    );

    await connection.commit();

    const user = {
      id: result.insertId,
      display_name: verification.display_name,
      email: verification.email,
      role: ROLES.USER,
      is_active: 1,
      artist_register_intent: verification.artist_register_intent,
    };

    const tokens = generateTokens(user);
    return {
      message: "Xác nhận email thành công",
      user: sanitizeUser(user),
      ...tokens,
    };
  } catch (error) {
    await connection.rollback();
    if (error.status) {
      throw error;
    }
    throw createError(500, "Không thể xác nhận email vào lúc này");
  } finally {
    connection.release();
  }
};

export const resendVerificationEmail = async ({ email }) => {
  const [existingUsers] = await db.query(
    "SELECT id FROM users WHERE email = ? LIMIT 1",
    [email]
  );

  if (existingUsers.length > 0) {
    return {
      message:
        "Nếu email hợp lệ, chúng tôi đã gửi lại hướng dẫn xác thực tài khoản.",
    };
  }

  const [rows] = await db.query(
    "SELECT * FROM email_verifications WHERE email = ? LIMIT 1",
    [email]
  );

  const verification = rows[0];
  if (!verification) {
    return {
      message:
        "Nếu email hợp lệ, chúng tôi đã gửi lại hướng dẫn xác thực tài khoản.",
    };
  }

  const verificationCode = createVerificationCode();
  const tokenHash = hashToken(verificationCode);
  const expiresAt = new Date(
    Date.now() + EMAIL_VERIFY_EXPIRES_MINUTES * 60 * 1000
  );

  await db.query(
    "UPDATE email_verifications SET token_hash = ?, expires_at = ?, used_at = NULL WHERE id = ?",
    [tokenHash, expiresAt, verification.id]
  );

  await sendVerificationEmail({
    email,
    displayName: verification.display_name,
    verificationCode,
  });

  return {
    message: "Nếu email hợp lệ, chúng tôi đã gửi lại hướng dẫn xác thực tài khoản.",
  };
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

export const requestPasswordReset = async ({ email }) => {
  const genericMessage =
    "Nếu email hợp lệ, chúng tôi đã gửi mã đặt lại mật khẩu.";
  const [rows] = await db.query("SELECT * FROM users WHERE email = ? LIMIT 1", [
    email,
  ]);
  const user = rows[0];

  if (!user || !user.is_active || user.auth_provider === "firebase") {
    return { message: genericMessage };
  }

  const verificationCode = createVerificationCode();
  const tokenHash = hashToken(verificationCode);
  const expiresAt = new Date(
    Date.now() + PASSWORD_RESET_EXPIRES_MINUTES * 60 * 1000
  );

  await db.query(
    `INSERT INTO password_resets
      (email, token_hash, expires_at)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE
      token_hash = VALUES(token_hash),
      expires_at = VALUES(expires_at),
      used_at = NULL`,
    [email, tokenHash, expiresAt]
  );

  await sendPasswordResetEmail({
    email,
    displayName: user.display_name || user.email,
    verificationCode,
  });

  return { message: genericMessage };
};

export const resetPassword = async ({ email, verification_code, new_password }) => {
  if (!email || !verification_code || !new_password) {
    throw createError(400, "Email, mã xác thực và mật khẩu mới là bắt buộc");
  }

  const code = String(verification_code).trim();
  if (!/^\d{6}$/.test(code)) {
    throw createError(400, "Mã xác thực không hợp lệ");
  }

  if (String(new_password).length < 6) {
    throw createError(400, "Mật khẩu mới phải có ít nhất 6 ký tự");
  }

  const tokenHash = hashToken(code);
  const [resetRows] = await db.query(
    `SELECT * FROM password_resets
      WHERE email = ?
        AND token_hash = ?
        AND used_at IS NULL
      LIMIT 1`,
    [email, tokenHash]
  );

  const resetRequest = resetRows[0];
  if (!resetRequest) {
    throw createError(400, "Mã đặt lại mật khẩu không hợp lệ hoặc đã được sử dụng");
  }

  if (new Date(resetRequest.expires_at).getTime() < Date.now()) {
    throw createError(400, "Mã đặt lại mật khẩu đã hết hạn");
  }

  const [userRows] = await db.query("SELECT * FROM users WHERE email = ? LIMIT 1", [
    email,
  ]);
  const user = userRows[0];
  if (!user) {
    throw createError(404, "Không tìm thấy người dùng");
  }

  const hashedPassword = await bcrypt.hash(new_password, SALT_ROUNDS);
  await db.query("UPDATE users SET password_hash = ? WHERE id = ?", [
    hashedPassword,
    user.id,
  ]);
  await db.query("UPDATE password_resets SET used_at = NOW() WHERE id = ?", [
    resetRequest.id,
  ]);

  return {
    message: "Đặt lại mật khẩu thành công",
  };
};

export const refreshTokens = async (refreshToken) => {
  if (!refreshToken) {
    throw createError(400, "Refresh token is required");
  }

  const refreshSecret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;

  try {
    const decoded = jwt.verify(refreshToken, refreshSecret);
    const [rows] = await db.query("SELECT * FROM users WHERE id = ?", [decoded.id]);
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
  verifyEmailRegistration,
  resendVerificationEmail,
  loginUser,
  refreshTokens,
  firebaseLoginUser,
  requestPasswordReset,
  resetPassword,
};
