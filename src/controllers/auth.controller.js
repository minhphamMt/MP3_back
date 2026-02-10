import {
  loginUser,
  refreshTokens,
  registerUser,
  resendVerificationEmail,
  verifyEmailRegistration,
} from "../services/auth.service.js";
import { firebaseLoginUser } from "../services/auth.service.js";

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

export const verifyEmailFromLink = async (_req, res) =>
  res.status(410).json({
    message:
      "API xác thực qua link đã ngừng hỗ trợ. Vui lòng nhập mã xác thực 6 số trên ứng dụng.",
  });

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
