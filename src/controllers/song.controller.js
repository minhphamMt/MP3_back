import {
  getSongById,
  getSongStats,
  incrementPlayCount,
  likeSong,
  listSongs,
  unlikeSong,
} from "../services/song.service.js";
import { getPaginationParams } from "../utils/pagination.js";
import { errorResponse, successResponse } from "../utils/response.js";

const parseGenreQuery = (query) => query.genre || query.genres || [];

export const getSongs = async (req, res, next) => {
  try {
    const { page, limit, offset } = getPaginationParams(req.query);
    const {
      status,
      artistId,
      artist_id: artist_id_param,
      albumId,
      album_id,
    } = req.query;

    const result = await listSongs({
      page,
      limit,
      offset,
      status,
      artistId: artistId || artist_id_param,
      albumId: albumId || album_id,
      genres: parseGenreQuery(req.query),
    });

    return successResponse(res, result.items, result.meta);
  } catch (error) {
    return next(error);
  }
};

export const getSong = async (req, res, next) => {
  try {
    const song = await getSongById(req.params.id, {
      status: req.query.status,
      genres: parseGenreQuery(req.query),
    });

    if (!song) {
      return errorResponse(res, "Song not found", 404);
    }

    return successResponse(res, song);
  } catch (error) {
    return next(error);
  }
};

export const likeSongHandler = async (req, res, next) => {
  try {
    const stats = await likeSong(req.params.id, req.user.id);
    return successResponse(res, stats, null, 201);
  } catch (error) {
    return next(error);
  }
};

export const unlikeSongHandler = async (req, res, next) => {
  try {
    const stats = await unlikeSong(req.params.id, req.user.id);
    return successResponse(res, stats);
  } catch (error) {
    return next(error);
  }
};

export const recordPlay = async (req, res, next) => {
  try {
    const stats = await incrementPlayCount(req.params.id);
    return successResponse(res, stats);
  } catch (error) {
    return next(error);
  }
};

export const getSongEngagement = async (req, res, next) => {
  try {
    const stats = await getSongStats(req.params.id);
    return successResponse(res, stats);
  } catch (error) {
    return next(error);
  }
};
export default {
  getSongs,
  getSong,
  likeSongHandler,
  unlikeSongHandler,
  recordPlay,
  getSongEngagement,
};
