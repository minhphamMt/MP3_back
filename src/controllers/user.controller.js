import {
  getAllUsers,
  getUserById,
  updateUserProfile,
  deleteUser,
  changePassword,
  setActiveStatus,
} from "../services/user.service.js";

export const getCurrentUser = async (req, res, next) => {
  try {
    const user = await getUserById(req.user.id);
    return res.json(user);
  } catch (error) {
    return next(error);
  }
};

export const listUsers = async (req, res, next) => {
  try {
    const users = await getAllUsers();
    return res.json(users);
  } catch (error) {
    return next(error);
  }
};

export const getUser = async (req, res, next) => {
  try {
    const user = await getUserById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    return res.json(user);
  } catch (error) {
    return next(error);
  }
};

export const updateProfile = async (req, res, next) => {
  try {
    const updated = await updateUserProfile(req.user.id, req.body);
    return res.json(updated);
  } catch (error) {
    return next(error);
  }
};

export const updateUser = async (req, res, next) => {
  try {
    const updated = await updateUserProfile(req.params.id, req.body);
    return res.json(updated);
  } catch (error) {
    return next(error);
  }
};

export const removeUser = async (req, res, next) => {
  try {
    await deleteUser(req.params.id);
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
};

export const updatePassword = async (req, res, next) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const user = await changePassword(req.user.id, oldPassword, newPassword);
    return res.json({ message: "Password updated successfully", user });
  } catch (error) {
    return next(error);
  }
};

export const toggleActive = async (req, res, next) => {
  try {
    const isActivePayload = req.body.is_active ?? req.body.isActive;

    if (isActivePayload === undefined) {
      return res.status(400).json({ message: "is_active is required" });
    }

    const isActive = Boolean(isActivePayload);
    const user = await setActiveStatus(req.params.id, isActive);
    return res.json(user);
  } catch (error) {
    return next(error);
  }
};

export default {
  getCurrentUser,
  listUsers,
  getUser,
  updateProfile,
  updateUser,
  removeUser,
  updatePassword,
  toggleActive,
};
