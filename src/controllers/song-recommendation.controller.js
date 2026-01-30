import { getSimilarSongs } from "../services/song-recommendation.service.js";
import { successResponse, errorResponse } from "../utils/response.js";

export const getSimilarSongsHandler = async (req, res, next) => {
  try {
    const songId = Number(req.params.songId);

    if (!Number.isInteger(songId) || songId <= 0) {
      return errorResponse(res, "Invalid songId", 400);
    }

    const results = await getSimilarSongs(songId);
    return successResponse(res, results);
  } catch (err) {
    if (err.status) {
      return errorResponse(res, err.message, err.status);
    }
    return next(err);
  }
};

export default {
  getSimilarSongsHandler,
};
