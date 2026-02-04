import {
  createUser,
  getAllUsers,
  getUserById,
  updateUserProfile,
  deleteUser,
  changePassword,
  setActiveStatus,
} from "../services/user.service.js";
import { getLikedSongsByUser } from "../services/song.service.js";
import { successResponse } from "../utils/response.js";
import { getLikedAlbums } from "../services/album-like.service.js";
import { uploadMediaFile } from "../services/storage.service.js";
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

export const createUserByAdmin = async (req, res, next) => {
  try {
    const user = await createUser(req.body);
    return res.status(201).json(user);
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
export const getMyLikedSongs = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const songs = await getLikedSongsByUser(userId);

    return successResponse(res, songs);
  } catch (err) {
    next(err);
  }
};
export const getMyLikedAlbums = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const albums = await getLikedAlbums(userId);
    return successResponse(res, albums);
  } catch (error) {
    next(error);
  }
};
export const uploadAvatar = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const uploadResult = await uploadMediaFile({
      folder: "uploads/user/avatar",
      file: req.file,
      prefix: "avatar",
      ownerId: req.user.id,
    });
    const avatarUrl = uploadResult.publicUrl;

    const user = await updateUserProfile(req.user.id, {
      avatar_url: avatarUrl,
    });

    return res.json({
      message: "Avatar uploaded successfully",
      avatar_url: avatarUrl,
      user,
    });
  } catch (err) {
    next(err);
  }
};
export const uploadUserAvatarByAdmin = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }
    const uploadResult = await uploadMediaFile({
      folder: "uploads/user/avatar",
      file: req.file,
      prefix: "avatar",
      ownerId: req.params.id,
    });
    const avatarUrl = uploadResult.publicUrl;

    const user = await updateUserProfile(req.params.id, {
      avatar_url: avatarUrl,
    });
    return res.json({
      message: "Avatar uploaded successfully",
      avatar_url: avatarUrl,
      user,
    });
  } catch (err) {
    next(err);
  }
};

export default {
  getCurrentUser,
  listUsers,
  createUserByAdmin,
  getUser,
  updateProfile,
  updateUser,
  removeUser,
  updatePassword,
  toggleActive,
  getMyLikedSongs,
  getMyLikedAlbums,
  uploadAvatar,
  uploadUserAvatarByAdmin
};
