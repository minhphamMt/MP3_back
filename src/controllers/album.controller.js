import {
  createAlbum,
  deleteAlbum,
  softDeleteAlbum,
  restoreAlbum,
  getAlbumById,
  listAlbums,
  updateAlbum,
  updateAlbumCover,
} from "../services/album.service.js";
import { getPaginationParams } from "../utils/pagination.js";
import { errorResponse, successResponse } from "../utils/response.js";
import {
  likeAlbum,
  unlikeAlbum,
} from "../services/album-like.service.js";
import ROLES from "../constants/roles.js";
import { getArtistByUserId, getArtistByUserIdWithDeleted } from "../services/artist.service.js";
const parseGenreQuery = (query) => query.genre || query.genres || [];
const resolveIncludeUnreleased = async ({ user }, { artistId, albumId } = {}) => {
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

  if (artistId && Number(artistId) === artist.id) {
    return true;
  }

  if (albumId) {
    const album = await getAlbumById(albumId, {
      includeSongs: false,
      includeUnreleased: true,
    });
    return album?.artist_id === artist.id;
  }

  return false;
};

export const getAlbums = async (req, res, next) => {
  try {
    const { page, limit, offset } = getPaginationParams(req.query);

    const {
      artistId,
      artist_id: artist_id_param,
      status,
      sort = "release_date",
      order = "desc",
    } = req.query;
    const keyword = (req.query.q || req.query.keyword || "").trim();

    const includeUnreleased = await resolveIncludeUnreleased(req, {
      artistId: artistId || artist_id_param,
    });

    const result = await listAlbums({
      page,
      limit,
      offset,
      status,
      artistId: artistId || artist_id_param,
      genres: parseGenreQuery(req.query),
      keyword: keyword || undefined,
      includeUnreleased,

      // 🔴 THÊM 2 DÒNG NÀY
      sort,
      order,
    });

    return successResponse(res, result.items, result.meta);
  } catch (error) {
    return next(error);
  }
};

export const getAlbum = async (req, res, next) => {
  try {
    const includeUnreleased = await resolveIncludeUnreleased(req, {
      albumId: req.params.id,
    });
    const album = await getAlbumById(req.params.id, {
      status: req.query.status,
      genres: parseGenreQuery(req.query),
      includeUnreleased,
    });

    if (!album) {
      return errorResponse(res, "Album not found", 404);
    }

    return successResponse(res, album);
  } catch (error) {
    return next(error);
  }
};
export const createAlbumHandler = async (req, res, next) => {
  try {
     const payload = { ...req.body };

    if (req.file) {
      payload.cover_url = `/uploads/albums/${req.file.filename}`;
    }

    if (req.user?.role === ROLES.ADMIN && !payload.artist_id) {
      return errorResponse(res, "artist_id is required for admin", 400);
    }
    
    if (req.user?.role === ROLES.ARTIST) {
      const artist = await getArtistByUserId(req.user.id);
      if (!artist) {
        return errorResponse(res, "Artist profile not found", 403);
      }

      payload.artist_id = artist.id;
    }

    const album = await createAlbum(payload);
    return successResponse(res, album, null, 201);
  } catch (error) {
    return next(error);
  }
};

export const updateAlbumHandler = async (req, res, next) => {
  try {
    const payload = { ...req.body };
    const coverUrl = req.file
      ? `/uploads/albums/${req.file.filename}`
      : null;

    if (req.user?.role === ROLES.ARTIST) {
      const artist = await getArtistByUserId(req.user.id);
      if (!artist) {
        return errorResponse(res, "Artist profile not found", 403);
      }

      const existingAlbum = await getAlbumById(req.params.id, {
        includeSongs: false,
        includeUnreleased: true,
      });
      if (!existingAlbum) {
        return errorResponse(res, "Album not found", 404);
      }
      if (existingAlbum.artist_id !== artist.id) {
        return errorResponse(res, "Forbidden", 403);
      }

      delete payload.artist_id;
    }

    let album = await updateAlbum(req.params.id, payload);
    if (coverUrl) {
      album = await updateAlbumCover(req.params.id, coverUrl);
    }
    return successResponse(res, album);
  } catch (error) {
    return next(error);
  }
};

export const deleteAlbumHandler = async (req, res, next) => {
  try {
    const existingAlbum = await getAlbumById(req.params.id, {
      includeSongs: false,
      includeUnreleased: true,
      includeDeleted: true,
    });
    if (!existingAlbum) {
      return errorResponse(res, "Album not found", 404);
    }
    if (req.user?.role === ROLES.ARTIST) {
      const artist = await getArtistByUserId(req.user.id);
      if (!artist) {
        return errorResponse(res, "Artist profile not found", 403);
      }

      if (existingAlbum.artist_id !== artist.id) {
        return errorResponse(res, "Forbidden", 403);
      }
    }

     if (existingAlbum.is_deleted) {
      await deleteAlbum(req.params.id);
      return successResponse(res, { message: "Album permanently deleted" });
    }
    
    await softDeleteAlbum(req.params.id, {
      deletedBy: req.user?.id,
      deletedByRole: req.user?.role,
    });
    return successResponse(res, { message: "Album deleted" });
  } catch (error) {
    return next(error);
  }
};

export const restoreAlbumHandler = async (req, res, next) => {
  try {
    let artistId = null;

    if (req.user?.role === ROLES.ARTIST) {
      const artist = await getArtistByUserIdWithDeleted(req.user.id);
      if (!artist) {
        return errorResponse(res, "Artist profile not found", 403);
      }
      artistId = artist.id;
    }

    const album = await restoreAlbum(req.params.id, {
      requesterRole: req.user?.role,
      requesterId: req.user?.id,
      artistId,
    });

    return successResponse(res, album);
  } catch (error) {
    return next(error);
  }
};

export const likeAlbumHandler = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const albumId = req.params.id;

    const result = await likeAlbum(userId, albumId);
    return successResponse(res, result, null, 201);
  } catch (error) {
    next(error);
  }
};

export const unlikeAlbumHandler = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const albumId = req.params.id;

    const result = await unlikeAlbum(userId, albumId);
    return successResponse(res, result);
  } catch (error) {
    next(error);
  }
};
export const uploadAlbumCoverHandler = async (req, res, next) => {
   try {
    if (!req.file) {
      return errorResponse(res, "No file uploaded", 400);
    }

    const album = await getAlbumById(req.params.id, {
      includeSongs: false,
      includeUnreleased: true,
    });
    if (!album) {
      return errorResponse(res, "Album not found", 404);
    }

    if (req.user.role === ROLES.ARTIST) {
      const artist = await getArtistByUserId(req.user.id);
      if (!artist || album.artist_id !== artist.id) {
        return errorResponse(res, "Forbidden", 403);
      }
    }

    const coverUrl = `/uploads/albums/${req.file.filename}`;
    const updatedAlbum = await updateAlbumCover(album.id, coverUrl);

    return successResponse(res, {
      cover_url: coverUrl,
      album: updatedAlbum,
    });
  } catch (error) {
    return next(error);
  }
};

export default {
  getAlbums,
  getAlbum,
  createAlbumHandler,
  updateAlbumHandler,
  deleteAlbumHandler,
  restoreAlbumHandler,
  likeAlbumHandler,
  unlikeAlbumHandler,
  uploadAlbumCoverHandler
};
