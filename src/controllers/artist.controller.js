import {
  createArtist,
  deleteArtist,
  getArtistById,
  getArtistByUserId,
  listArtists,
  updateArtist,
  listArtistCollections,
} from "../services/artist.service.js";
import { getPaginationParams } from "../utils/pagination.js";
import { errorResponse, successResponse } from "../utils/response.js";
import ROLES from "../constants/roles.js";

const parseGenreQuery = (query) => query.genre || query.genres || [];

export const getArtists = async (req, res, next) => {
  try {
    const { page, limit, offset } = getPaginationParams(req.query);
    const { status } = req.query;

    const result = await listArtists({
      page,
      limit,
      offset,
      status,
      genres: parseGenreQuery(req.query),
    });

    return successResponse(res, result.items, result.meta);
  } catch (error) {
    return next(error);
  }
};

export const getArtist = async (req, res, next) => {
  try {
    const artist = await getArtistById(req.params.id, {
      status: req.query.status,
      genres: parseGenreQuery(req.query),
    });

    if (!artist) {
      return errorResponse(res, "Artist not found", 404);
    }

    return successResponse(res, artist);
  } catch (error) {
    return next(error);
  }
};
export const getMyArtistProfile = async (req, res, next) => {
  try {
    const artist = await getArtistByUserId(req.user.id);

    if (!artist) {
      return errorResponse(res, "Artist profile not found", 404);
    }

    const detailed = await getArtistById(artist.id, {
      status: req.query.status,
      genres: parseGenreQuery(req.query),
    });

    return successResponse(res, detailed);
  } catch (error) {
    return next(error);
  }
};
export const createArtistHandler = async (req, res, next) => {
  try {
    if (req.body.zing_artist_id !== undefined) {
      return errorResponse(res, "zing_artist_id cannot be set manually", 400);
    }

    const payload = { ...req.body };
    if (req.file) {
      payload.avatar_url = `/uploads/images/${req.file.filename}`;
    }

    if (req.user?.role === ROLES.ARTIST) {
      const existing = await getArtistByUserId(req.user.id);
      if (existing) {
        return errorResponse(res, "Artist profile already exists", 409);
      }
      payload.user_id = req.user.id;
    }

    const artist = await createArtist(payload);
    return successResponse(res, artist, null, 201);
  } catch (error) {
    return next(error);
  }
};

export const updateArtistHandler = async (req, res, next) => {
  try {
    if (req.body.zing_artist_id !== undefined) {
      return errorResponse(res, "zing_artist_id cannot be set manually", 400);
    }

    const payload = { ...req.body };
    if (req.file) {
      payload.avatar_url = `/uploads/images/${req.file.filename}`;
    }

    if (req.user?.role === ROLES.ARTIST) {
      const artistProfile = await getArtistByUserId(req.user.id);
      if (!artistProfile || Number(req.params.id) !== artistProfile.id) {
        return errorResponse(res, "Forbidden", 403);
      }
    }

    const artist = await updateArtist(req.params.id, payload);
    return successResponse(res, artist);
  } catch (error) {
    return next(error);
  }
};

export const deleteArtistHandler = async (req, res, next) => {
  try {
    if (req.user?.role === ROLES.ARTIST) {
      const artistProfile = await getArtistByUserId(req.user.id);
      if (!artistProfile || Number(req.params.id) !== artistProfile.id) {
        return errorResponse(res, "Forbidden", 403);
      }
    }

    await deleteArtist(req.params.id);
    return successResponse(res, { message: "Artist deleted" });
  } catch (error) {
    return next(error);
  }
};
export const getArtistCollections = async (req, res, next) => {
  try {
    const limit = Number(req.query.limit) || 8;
    const data = await listArtistCollections(limit);
    return successResponse(res, data);
  } catch (err) {
    next(err);
  }
};

export const uploadArtistAvatar = async (req, res, next) => {
  try {
    if (!req.file) {
      return errorResponse(res, "No file uploaded", 400);
    }

    const artist = await getArtistByUserId(req.user.id);
    if (!artist) {
      return errorResponse(res, "Artist profile not found", 404);
    }

    const avatarUrl = `/uploads/images/${req.file.filename}`;

    const updatedArtist = await updateArtist(artist.id, {
      avatar_url: avatarUrl,
    });

    return successResponse(res, {
      avatar_url: avatarUrl,
      artist: updatedArtist,
    });
  } catch (error) {
    return next(error);
  }
};


export default {
  getArtists,
  getArtist,
  getMyArtistProfile,
  createArtistHandler,
  updateArtistHandler,
  deleteArtistHandler,
  getArtistCollections,
  uploadArtistAvatar,
};
