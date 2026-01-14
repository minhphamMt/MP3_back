import {
  createArtist,
  deleteArtist,
  getArtistById,
  listArtists,
  updateArtist,
  listArtistCollections,
} from "../services/artist.service.js";
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
export const createArtistHandler = async (req, res, next) => {
  try {
    const artist = await createArtist(req.body);
    return successResponse(res, artist, null, 201);
  } catch (error) {
    return next(error);
  }
};

export const updateArtistHandler = async (req, res, next) => {
  try {
    const artist = await updateArtist(req.params.id, req.body);
    return successResponse(res, artist);
  } catch (error) {
    return next(error);
  }
};

export const deleteArtistHandler = async (req, res, next) => {
  try {
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

export default {
  getArtists,
  getArtist,
  createArtistHandler,
  updateArtistHandler,
  deleteArtistHandler,
  getArtistCollections,
};
