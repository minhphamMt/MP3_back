import {
  getColdStartRecommendations,
  getRecommendations,
} from "../services/recommendation.service.js";
import { errorResponse, successResponse } from "../utils/response.js";

export const getRecommendationsHandler = async (req, res, next) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return errorResponse(res, "Unauthorized", 401);
    }

    const limit = Number(req.query.limit) || undefined;
    const recommendations = await getRecommendations(userId, limit);

    return successResponse(res, recommendations);
  } catch (error) {
    return next(error);
  }
};

export const getColdStartRecommendationsHandler = async (req, res, next) => {
  try {
    const limit = Number(req.query.limit) || undefined;
    const recommendations = await getColdStartRecommendations(limit);

    return successResponse(res, recommendations);
  } catch (error) {
    return next(error);
  }
};

export default {
  getRecommendationsHandler,
  getColdStartRecommendationsHandler,
};
