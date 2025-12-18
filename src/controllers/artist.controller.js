import { getArtistById, listArtists } from "../services/artist.service.js";
import { getPaginationParams } from "../utils/pagination.js";
import { errorResponse, successResponse } from "../utils/response.js";

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

export default {
  getArtists,
  getArtist,
};
