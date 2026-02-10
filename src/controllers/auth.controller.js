import {
  loginUser,
  refreshTokens,
  registerUser,
  resendVerificationEmail,
  verifyEmailRegistration,
} from "../services/auth.service.js";
import { firebaseLoginUser } from "../services/auth.service.js";

const getFrontendLoginUrl = () => {
  const frontendUrl = process.env.FRONTEND_URL;
  if (!frontendUrl) return null;
  return `${frontendUrl.replace(/\/$/, "")}/login`;
};

const renderVerificationHtml = ({ success, title, message }) => {
  const loginUrl = getFrontendLoginUrl();
  const color = success ? "#16a34a" : "#dc2626";
  const actionButton = success && loginUrl
    ? `<a href="${loginUrl}" style="display:inline-block;margin-top:16px;padding:10px 18px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">Đăng nhập ngay</a>`
    : "";

  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="font-family:Arial,sans-serif;background:#f6f7fb;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;padding:24px;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,.08);text-align:center;">
    <h2 style="margin-top:0;color:${color};">${title}</h2>
    <p style="color:#374151;line-height:1.6;">${message}</p>
    ${actionButton}
  </div>
</body>
</html>`;
};

export const register = async (req, res, next) => {
  try {
    const result = await registerUser(req.body);
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
};

export const registerArtist = async (req, res, next) => {
  try {
    const result = await registerUser({
      ...req.body,
      artist_register_intent: true,
    });
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
};

export const verifyEmail = async (req, res, next) => {
  try {
    const result = await verifyEmailRegistration(req.body);
    return res.status(201).json(result);
  } catch (error) {
    return next(error);
  }
};

export const verifyEmailFromLink = async (req, res) => {
  const token = req.query?.token;

  if (!token || typeof token !== "string") {
    return res
      .status(400)
      .type("html")
      .send(
        renderVerificationHtml({
          success: false,
          title: "Xác nhận thất bại",
          message: "Liên kết xác nhận không hợp lệ hoặc đã thiếu token.",
        })
      );
  }

  try {
    await verifyEmailRegistration({ token });
    return res
      .status(200)
      .type("html")
      .send(
        renderVerificationHtml({
          success: true,
          title: "Xác nhận thành công",
          message: "Tài khoản của bạn đã được kích hoạt. Bạn có thể đăng nhập ngay bây giờ.",
        })
      );
  } catch (error) {
    return res
      .status(error.status || 400)
      .type("html")
      .send(
        renderVerificationHtml({
          success: false,
          title: "Xác nhận thất bại",
          message: error.message || "Không thể xác nhận email vào lúc này.",
        })
      );
  }
};

export const resendVerification = async (req, res, next) => {
  try {
    const result = await resendVerificationEmail(req.body);
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
};

export const firebaseLogin = async (req, res, next) => {
  try {
    const result = await firebaseLoginUser(req.body);
    return res.json(result);
  } catch (error) {
    return next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const result = await loginUser(req.body);
    return res.json(result);
  } catch (error) {
    return next(error);
  }
};

export const loginArtist = async (req, res, next) => {
  try {
    const result = await loginUser(req.body);
    return res.json(result);
  } catch (error) {
    return next(error);
  }
};

export const refresh = async (req, res, next) => {
  try {
    const result = await refreshTokens(req.body.refreshToken);
    return res.json(result);
  } catch (error) {
    return next(error);
  }
};

export default {
  register,
  verifyEmail,
  verifyEmailFromLink,
  resendVerification,
  login,
  refresh,
};
