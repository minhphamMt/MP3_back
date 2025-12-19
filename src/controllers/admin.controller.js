import { reviewSong } from "../services/song.service.js";
import { setActiveStatus } from "../services/user.service.js";
import { logger } from "../utils/logger.js";

const createHttpError = (status, message) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

export const reviewSongRequest = async (req, res, next) => {
  try {
    const { status, reject_reason, rejectReason } = req.body;

    if (!status) {
      return next(createHttpError(400, "status is required"));
    }

    const song = await reviewSong(req.params.id, {
      status,
      rejectReason: reject_reason ?? rejectReason,
      reviewerId: req.user.id,
    });

    logger.info("Song reviewed", {
      songId: req.params.id,
      status,
      reviewerId: req.user.id,
    });

    return res.json({
      message: "Song review updated successfully",
      song,
    });
  } catch (error) {
    return next(error);
  }
};

export const toggleUserActive = async (req, res, next) => {
  try {
    const isActivePayload = req.body.is_active ?? req.body.isActive;

    if (isActivePayload === undefined) {
      return next(createHttpError(400, "is_active is required"));
    }

    const user = await setActiveStatus(req.params.id, Boolean(isActivePayload));

    logger.info("User active status updated", {
      adminId: req.user.id,
      userId: req.params.id,
      isActive: Boolean(isActivePayload),
    });

    return res.json({
      message: `User ${
        Boolean(isActivePayload) ? "unlocked" : "locked"
      } successfully`,
      user,
    });
  } catch (error) {
    return next(error);
  }
};

export default {
  reviewSongRequest,
  toggleUserActive,
};
