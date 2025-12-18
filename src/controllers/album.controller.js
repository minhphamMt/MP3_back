import { getAlbumById, listAlbums } from "../services/album.service.js";
import { getPaginationParams } from "../utils/pagination.js";
import { errorResponse, successResponse } from "../utils/response.js";

const parseGenreQuery = (query) => query.genre || query.genres || [];

export const getAlbums = async (req, res, next) => {
  try {
    const { page, limit, offset } = getPaginationParams(req.query);
    const { artistId, artist_id: artist_id_param, status } = req.query;

    const result = await listAlbums({
      page,
      limit,
      offset,
      status,
      artistId: artistId || artist_id_param,
      genres: parseGenreQuery(req.query),
    });

    return successResponse(res, result.items, result.meta);
  } catch (error) {
    return next(error);
  }
};

export const getAlbum = async (req, res, next) => {
  try {
    const album = await getAlbumById(req.params.id, {
      status: req.query.status,
      genres: parseGenreQuery(req.query),
    });

    if (!album) {
      return errorResponse(res, "Album not found", 404);
    }

    return successResponse(res, album);
  } catch (error) {
    return next(error);
  }
};

export default {
  getAlbums,
  getAlbum,
};
