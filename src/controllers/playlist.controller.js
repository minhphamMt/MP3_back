import {
  addSongToPlaylist,
  createPlaylist,
  deletePlaylist,
  getPlaylistById,
  listPlaylists,
  removeSongFromPlaylist,
  reorderSongInPlaylist,
  updatePlaylist,
} from "../services/playlist.service.js";
import { errorResponse, successResponse } from "../utils/response.js";

export const getPlaylists = async (req, res, next) => {
  try {
    const playlists = await listPlaylists(req.user.id);
    return successResponse(res, playlists);
  } catch (error) {
    return next(error);
  }
};

export const getPlaylist = async (req, res, next) => {
  try {
    const playlist = await getPlaylistById(req.params.id);

    if (!playlist) {
      return errorResponse(res, "Playlist not found", 404);
    }

    if (Number(playlist.user_id) !== Number(req.user.id)) {
      return errorResponse(res, "Forbidden", 403);
    }

    return successResponse(res, playlist);
  } catch (error) {
    return next(error);
  }
};

export const createPlaylistHandler = async (req, res, next) => {
  try {
    const { name, description, is_public, isPublic } = req.body;
    const playlist = await createPlaylist(req.user.id, {
      name,
      description,
      isPublic: is_public ?? isPublic ?? true,
    });
    return successResponse(res, playlist, null, 201);
  } catch (error) {
    return next(error);
  }
};

export const updatePlaylistHandler = async (req, res, next) => {
  try {
    const { name, description, is_public, isPublic } = req.body;
    const playlist = await updatePlaylist(req.params.id, req.user.id, {
      name,
      description,
      isPublic: is_public ?? isPublic,
    });
    return successResponse(res, playlist);
  } catch (error) {
    return next(error);
  }
};

export const deletePlaylistHandler = async (req, res, next) => {
  try {
    await deletePlaylist(req.params.id, req.user.id);
    return successResponse(res, { message: "Playlist deleted" });
  } catch (error) {
    return next(error);
  }
};

const parsePosition = (value) => {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};

export const addSong = async (req, res, next) => {
  try {
    const { songId, position } = req.body;

    if (!songId) {
      return errorResponse(res, "songId is required", 400);
    }

    const playlist = await addSongToPlaylist(
      req.params.id,
      songId,
      req.user.id,
      parsePosition(position)
    );

    return successResponse(res, playlist, null, 201);
  } catch (error) {
    return next(error);
  }
};

export const removeSong = async (req, res, next) => {
  try {
    const playlist = await removeSongFromPlaylist(
      req.params.id,
      req.params.songId,
      req.user.id
    );

    return successResponse(res, playlist);
  } catch (error) {
    return next(error);
  }
};

export const reorderSong = async (req, res, next) => {
  try {
    const { position } = req.body;
    const playlist = await reorderSongInPlaylist(
      req.params.id,
      req.params.songId,
      parsePosition(position),
      req.user.id
    );

    return successResponse(res, playlist);
  } catch (error) {
    return next(error);
  }
};

export default {
  getPlaylists,
  getPlaylist,
  createPlaylistHandler,
  updatePlaylistHandler,
  deletePlaylistHandler,
  addSong,
  removeSong,
  reorderSong,
};
