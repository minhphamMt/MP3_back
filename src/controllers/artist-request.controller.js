import { successResponse } from "../utils/response.js";
import {
  createArtistRequest,
  getArtistRequestByUserId,
} from "../services/artist-request.service.js";

export const createArtistRequestHandler = async (req, res, next) => {
  try {
    const payload = {
      userId: req.user?.id,
      artistName: req.body.artist_name ?? req.body.artistName,
      bio: req.body.bio,
      avatarUrl: req.body.avatar_url ?? req.body.avatarUrl,
      proofLink: req.body.proof_link ?? req.body.proofLink,
    };

    const request = await createArtistRequest(payload);
    return successResponse(res, request, null, 201);
  } catch (error) {
    return next(error);
  }
};

export const getMyArtistRequest = async (req, res, next) => {
  try {
    const request = await getArtistRequestByUserId(req.user?.id);
    if (!request) {
      return successResponse(res, null);
    }

    return successResponse(res, request);
  } catch (error) {
    return next(error);
  }
};

export default {
  createArtistRequestHandler,
  getMyArtistRequest,
};
