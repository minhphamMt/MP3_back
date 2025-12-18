import {
  loginUser,
  refreshTokens,
  registerUser,
} from "../services/auth.service.js";

export const register = async (req, res, next) => {
  try {
    const result = await registerUser(req.body);
    return res.status(201).json(result);
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
  login,
  refresh,
};
