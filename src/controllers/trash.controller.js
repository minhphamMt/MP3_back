import { listDeletedItems } from "../services/trash.service.js";
import { getArtistByUserIdWithDeleted } from "../services/artist.service.js";
import ROLES from "../constants/roles.js";
import { errorResponse, successResponse } from "../utils/response.js";

export const getDeletedItems = async (req, res, next) => {
  try {
    let artistId = null;

    if (req.user?.role === ROLES.ARTIST) {
      const artist = await getArtistByUserIdWithDeleted(req.user.id);
      if (!artist) {
        return errorResponse(res, "Artist profile not found", 403);
      }
      artistId = artist.id;
    }

    const items = await listDeletedItems({
      role: req.user?.role,
      artistId,
    });

    return successResponse(res, items);
  } catch (error) {
    return next(error);
  }
};

export default {
  getDeletedItems,
};