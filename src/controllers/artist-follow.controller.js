import {
  followArtist,
  unfollowArtist,
  getFollowedArtists,
} from "../services/artist-follow.service.js";
import { successResponse } from "../utils/response.js";

export const follow = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const artistId = req.params.id;

    const result = await followArtist(userId, artistId);
    return successResponse(res, result, null, 201);
  } catch (error) {
    next(error);
  }
};

export const unfollow = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const artistId = req.params.id;

    const result = await unfollowArtist(userId, artistId);
    return successResponse(res, result);
  } catch (error) {
    next(error);
  }
};

export const getMyFollowedArtists = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const artists = await getFollowedArtists(userId);
    return successResponse(res, artists);
  } catch (error) {
    next(error);
  }
};

export default {
  follow,
  unfollow,
  getMyFollowedArtists,
};
