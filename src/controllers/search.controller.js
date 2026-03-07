import {
  listSearchHistory,
  saveSearchHistory,
  searchEntities,
} from "../services/search.service.js";
import { getPaginationParams } from "../utils/pagination.js";
import { errorResponse, successResponse } from "../utils/response.js";

export const search = async (req, res, next) => {
  try {
    const keyword = (req.query.q || req.query.keyword || "").trim();
    if (!keyword) {
      return errorResponse(res, "Keyword is required", 400);
    }

    const { page, limit, offset } = getPaginationParams(req.query);
    const userId = req.user?.id;
    const result = await searchEntities(keyword, {
      page,
      limit,
      offset,
      userId,
    });

    // Search realtime does not persist history.
    return successResponse(res, result.items, result.meta);
  } catch (error) {
    return next(error);
  }
};

export const saveHistory = async (req, res, next) => {
  try {
    const { keyword } = req.body;
    if (!keyword?.trim()) return successResponse(res);

    await saveSearchHistory(keyword.trim(), req.user.id);
    return successResponse(res);
  } catch (error) {
    next(error);
  }
};

export const getHistory = async (req, res, next) => {
  try {
    const { page, limit, offset } = getPaginationParams(req.query);
    const history = await listSearchHistory(req.user.id, {
      page,
      limit,
      offset,
    });

    return successResponse(res, history.items, history.meta);
  } catch (error) {
    return next(error);
  }
};
