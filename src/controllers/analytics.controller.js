import {
  getTopArtistsAnalytics,
  getTopGenresAnalytics,
  getTopSongsAnalytics,
} from "../services/analytics.service.js";
import { successResponse } from "../utils/response.js";

const extractParams = (query) => ({
  startDate: query.startDate || query.from,
  endDate: query.endDate || query.to,
  interval: query.interval,
  limit: query.limit,
});

export const getTopSongs = async (req, res, next) => {
  try {
    const data = await getTopSongsAnalytics(extractParams(req.query));
    return successResponse(res, data);
  } catch (error) {
    return next(error);
  }
};

export const getTopArtists = async (req, res, next) => {
  try {
    const data = await getTopArtistsAnalytics(extractParams(req.query));
    return successResponse(res, data);
  } catch (error) {
    return next(error);
  }
};

export const getTopGenres = async (req, res, next) => {
  try {
    const data = await getTopGenresAnalytics(extractParams(req.query));
    return successResponse(res, data);
  } catch (error) {
    return next(error);
  }
};

export default {
  getTopSongs,
  getTopArtists,
  getTopGenres,
};
