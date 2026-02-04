import {
  createArtist,
  deleteArtist,
  softDeleteArtist,
  restoreArtist,
  getArtistById,
  getArtistByUserId,
  getArtistByUserIdWithDeleted,
  listArtists,
  updateArtist,
  listArtistCollections,
} from "../services/artist.service.js";
import { getPaginationParams } from "../utils/pagination.js";
import { errorResponse, successResponse } from "../utils/response.js";
import ROLES from "../constants/roles.js";
import { uploadMediaFile } from "../services/storage.service.js";

const parseGenreQuery = (query) => query.genre || query.genres || [];
const resolveIncludeUnreleased = async ({ user }, artistId) => {
  if (!user) return false;

  if (user.role === ROLES.ADMIN) {
    return true;
  }

  if (user.role !== ROLES.ARTIST) {
    return false;
  }

  const artist = await getArtistByUserId(user.id);
  if (!artist) {
    return false;
  }

  return Number(artistId) === artist.id;
};

export const getArtists = async (req, res, next) => {
  try {
    const { page, limit, offset } = getPaginationParams(req.query);
    const { status } = req.query;
    const keyword = (req.query.q || req.query.keyword || "").trim();

    const result = await listArtists({
      page,
      limit,
      offset,
      status,
      keyword: keyword || undefined,
      genres: parseGenreQuery(req.query),
    });

    return successResponse(res, result.items, result.meta);
  } catch (error) {
    return next(error);
  }
};

export const getArtist = async (req, res, next) => {
  try {
    const includeUnreleased = await resolveIncludeUnreleased(req, req.params.id);
    const artist = await getArtistById(req.params.id, {
      status: req.query.status,
      genres: parseGenreQuery(req.query),
      includeUnreleased,
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
      includeUnreleased: true,
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
      const uploadResult = await uploadMediaFile({
        folder: "uploads/images",
        file: req.file,
        prefix: "artist-avatar",
        ownerId: req.user?.id,
      });
      payload.avatar_url = uploadResult.publicUrl;
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
      const uploadResult = await uploadMediaFile({
        folder: "uploads/images",
        file: req.file,
        prefix: "artist-avatar",
        ownerId: req.user?.id,
      });
      payload.avatar_url = uploadResult.publicUrl;
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
   let existingArtist = null;

    if (req.user?.role === ROLES.ARTIST) {
      const artistProfile = await getArtistByUserIdWithDeleted(req.user.id);
      if (!artistProfile || Number(req.params.id) !== artistProfile.id) {
        return errorResponse(res, "Forbidden", 403);
      }
      existingArtist = artistProfile;
    } else {
      existingArtist = await getArtistById(req.params.id, {
        includeUnreleased: true,
        includeDeleted: true,
      });
      if (!existingArtist) {
        return errorResponse(res, "Artist not found", 404);
      }
    }

    if (existingArtist.is_deleted) {
      await deleteArtist(req.params.id);
      return successResponse(res, { message: "Artist permanently deleted" });
    }

    await softDeleteArtist(req.params.id, {
      deletedBy: req.user?.id,
      deletedByRole: req.user?.role,
    });
    return successResponse(res, { message: "Artist deleted" });
  } catch (error) {
    return next(error);
  }
};

export const restoreArtistHandler = async (req, res, next) => {
  try {
    if (req.user?.role === ROLES.ARTIST) {
      const artistProfile = await getArtistByUserIdWithDeleted(req.user.id);
      if (!artistProfile || Number(req.params.id) !== artistProfile.id) {
        return errorResponse(res, "Forbidden", 403);
      }
    }

    const artist = await restoreArtist(req.params.id, {
      requesterRole: req.user?.role,
      requesterId: req.user?.id,
    });

    return successResponse(res, artist);
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

    const uploadResult = await uploadMediaFile({
      folder: "uploads/images",
      file: req.file,
      prefix: "artist-avatar",
      ownerId: req.user?.id,
    });
    const avatarUrl = uploadResult.publicUrl;

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
  restoreArtistHandler,
  deleteArtistHandler,
  getArtistCollections,
  uploadArtistAvatar,
};
