import { getColdStartRecommendations } from "../services/recommendation.service.js";
import { successResponse } from "../utils/response.js";

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
  getColdStartRecommendationsHandler,
};
