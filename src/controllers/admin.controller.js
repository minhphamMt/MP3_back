import { getSongById, listSongs, reviewSong, updateSong } from "../services/song.service.js";
import {
  getUserById,
  setActiveStatus,
  setUserPassword,
  setUserRole,
  updateUserProfile,
} from "../services/user.service.js";
import { logger } from "../utils/logger.js";
import { successResponse } from "../utils/response.js";
import SONG_STATUS from "../constants/song-status.js";
import {
  createGenre,
  deleteGenre,
  listGenres,
  updateGenre,
} from "../services/genre.service.js";
import { getPaginationParams } from "../utils/pagination.js";
import { searchAdminEntities } from "../services/search.service.js";
import {
  getSystemOverview,
  getWeeklyTopSongs,
} from "../services/admin.service.js";

const parseGenreQuery = (query) => query.genre || query.genres || [];

const createHttpError = (status, message) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

export const reviewSongRequest = async (req, res, next) => {
  try {
    const { status, reject_reason, rejectReason } = req.body;

    if (!status) {
      return next(createHttpError(400, "status is required"));
    }

    const song = await reviewSong(req.params.id, {
      status,
      rejectReason: reject_reason ?? rejectReason,
      reviewerId: req.user.id,
    });

    logger.info("Song reviewed", {
      songId: req.params.id,
      status,
      reviewerId: req.user.id,
    });

    return res.json({
      message: "Song review updated successfully",
      song,
    });
  } catch (error) {
    return next(error);
  }
};

export const approveSongRequest = async (req, res, next) => {
  try {
    const song = await reviewSong(req.params.id, {
      status: SONG_STATUS.APPROVED,
      reviewerId: req.user.id,
    });

    logger.info("Song approved", {
      songId: req.params.id,
      reviewerId: req.user.id,
    });

    return res.json({
      message: "Song approved successfully",
      song,
    });
  } catch (error) {
    return next(error);
  }
};

export const blockSongRequest = async (req, res, next) => {
  try {
    const rejectReason = req.body.reject_reason ?? req.body.rejectReason;

    if (!rejectReason) {
      return next(createHttpError(400, "reject_reason is required"));
    }

    const song = await reviewSong(req.params.id, {
      status: SONG_STATUS.REJECTED,
      reviewerId: req.user.id,
      rejectReason,
    });

    logger.info("Song blocked", {
      songId: req.params.id,
      reviewerId: req.user.id,
    });

    return res.json({
      message: "Song blocked successfully",
      song,
    });
  } catch (error) {
    return next(error);
  }
};

export const toggleUserActive = async (req, res, next) => {
  try {
    const isActivePayload = req.body.is_active ?? req.body.isActive;

    if (isActivePayload === undefined) {
      return next(createHttpError(400, "is_active is required"));
    }

    const user = await setActiveStatus(req.params.id, Boolean(isActivePayload));

    logger.info("User active status updated", {
      adminId: req.user.id,
      userId: req.params.id,
      isActive: Boolean(isActivePayload),
    });

    return res.json({
      message: `User ${
        Boolean(isActivePayload) ? "unlocked" : "locked"
      } successfully`,
      user,
    });
  } catch (error) {
    return next(error);
  }
};

export const updateUserRole = async (req, res, next) => {
  try {
    const { role } = req.body;
    if (!role) {
      return next(createHttpError(400, "role is required"));
    }

    const user = await setUserRole(req.params.id, role);

    logger.info("User role updated", {
      adminId: req.user.id,
      userId: req.params.id,
      role,
    });

    return res.json({
      message: "User role updated successfully",
      user,
    });
  } catch (error) {
    return next(error);
  }
};

export const updateUserRequest = async (req, res, next) => {
  try {
    const { role, password } = req.body;
    const displayName = req.body.display_name ?? req.body.name;

    if (role === undefined && displayName === undefined && password === undefined) {
      return next(createHttpError(400, "No user updates provided"));
    }

    if (displayName !== undefined) {
      await updateUserProfile(req.params.id, { display_name: displayName });
    }

    if (role !== undefined) {
      await setUserRole(req.params.id, role);
    }

    if (password !== undefined) {
      await setUserPassword(req.params.id, password);
    }

    const user = await getUserById(req.params.id);

    logger.info("User updated by admin", {
      adminId: req.user.id,
      userId: req.params.id,
      role,
      hasPasswordChange: password !== undefined,
    });

    return res.json({
      message: "User updated successfully",
      user,
    });
  } catch (error) {
    return next(error);
  }
};

export const listGenresRequest = async (req, res, next) => {
  try {
    const { page, limit, offset } = getPaginationParams(req.query);
    const keyword = req.query.keyword || req.query.q;

    const result = await listGenres({ page, limit, offset, keyword });
    return successResponse(res, result.items, result.meta);
  } catch (error) {
    return next(error);
  }
};

export const createGenreRequest = async (req, res, next) => {
  try {
    const genre = await createGenre(req.body.name);
    return successResponse(res, genre, null, 201);
  } catch (error) {
    return next(error);
  }
};

export const updateGenreRequest = async (req, res, next) => {
  try {
    const genre = await updateGenre(req.params.id, req.body.name);
    return successResponse(res, genre);
  } catch (error) {
    return next(error);
  }
};

export const deleteGenreRequest = async (req, res, next) => {
  try {
    await deleteGenre(req.params.id);
    return successResponse(res, { message: "Genre deleted" });
  } catch (error) {
    return next(error);
  }
};

export const searchAdmin = async (req, res, next) => {
  try {
    const keyword = (req.query.q || req.query.keyword || "").trim();
    if (!keyword) {
      return next(createHttpError(400, "keyword is required"));
    }

    const { page, limit, offset } = getPaginationParams(req.query);

    const result = await searchAdminEntities(keyword, {
      page,
      limit,
      offset,
    });

    return successResponse(res, result.items, result.meta);
  } catch (error) {
    return next(error);
  }
};

export const getReportOverview = async (req, res, next) => {
  try {
    const limit = Number(req.query.limit) || 5;
    const [overview, weeklyTopSongs] = await Promise.all([
      getSystemOverview(),
      getWeeklyTopSongs(limit),
    ]);

    return successResponse(res, {
      overview,
      weeklyTopSongs,
    });
  } catch (error) {
    return next(error);
  }
};

export const listSongsRequest = async (req, res, next) => {
  try {
    const { page, limit, offset } = getPaginationParams(req.query);
    const keyword = req.query.q || req.query.keyword;
    const { status, artistId, artist_id, albumId, album_id } = req.query;

    const result = await listSongs({
      page,
      limit,
      offset,
      status,
      artistId: artistId || artist_id,
      albumId: albumId || album_id,
      genres: parseGenreQuery(req.query),
      includeUnreleased: true,
      keyword,
    });

    return successResponse(res, result.items, result.meta);
  } catch (error) {
    return next(error);
  }
};

export const getSongRequest = async (req, res, next) => {
  try {
    const song = await getSongById(req.params.id, { includeUnreleased: true });
    if (!song) {
      return next(createHttpError(404, "Song not found"));
    }

    return successResponse(res, song);
  } catch (error) {
    return next(error);
  }
};

export const updateSongRequest = async (req, res, next) => {
  try {
    const song = await updateSong(req.params.id, req.body);
    return successResponse(res, song);
  } catch (error) {
    return next(error);
  }
};

export default {
  reviewSongRequest,
  approveSongRequest,
  blockSongRequest,
  toggleUserActive,
  updateUserRole,
  updateUserRequest,
  listGenresRequest,
  createGenreRequest,
  updateGenreRequest,
  deleteGenreRequest,
  searchAdmin,
  getReportOverview,
  listSongsRequest,
  getSongRequest,
  updateSongRequest,
};