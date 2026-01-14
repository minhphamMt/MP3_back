import { getUserListeningHistory } from "../services/history.service.js";
import { getPaginationParams } from "../utils/pagination.js";
import { successResponse } from "../utils/response.js";

export const getMyListeningHistory = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { page, limit, offset } = getPaginationParams(req.query);

    const result = await getUserListeningHistory(userId, {
      page,
      limit,
      offset,
    });

    return successResponse(res, result.items, result.meta);
  } catch (error) {
    return next(error);
  }
};

export default {
  getMyListeningHistory,
};
