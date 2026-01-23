import { getLyricSnapshot, listLyricsBySongId } from "../services/lyrics.service.js";
import { getSongById } from "../services/song.service.js";
import { errorResponse, successResponse } from "../utils/response.js";

const parseTimeQuery = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const getSongLyrics = async (req, res, next) => {
  try {
    const songId = req.params.id;
    const song = await getSongById(songId);

    if (!song) {
      return errorResponse(res, "Song not found", 404);
    }

    const timeMs = parseTimeQuery(req.query.time ?? req.query.currentTime);

    if (timeMs !== null) {
      const snapshot = await getLyricSnapshot(songId, timeMs);
      return successResponse(res, {
        song_id: Number(songId),
        time: timeMs,
        ...snapshot,
      });
    }

    const lyrics = await listLyricsBySongId(songId);
    return successResponse(res, {
      song_id: Number(songId),
      items: lyrics,
    });
  } catch (error) {
    return next(error);
  }
};

export default {
  getSongLyrics,
};