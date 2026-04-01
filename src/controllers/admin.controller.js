import { listSongs, reviewSong, updateSong } from "../services/song.service.js";
import { logger } from "../utils/logger.js";
import { successResponse } from "../utils/response.js";
import SONG_STATUS from "../constants/song-status.js";
import {
  createGenre,
  deleteGenre,
  getGenreByIdWithDeleted,
  softDeleteGenre,
  restoreGenre,
  listGenres,
  updateGenre,
} from "../services/genre.service.js";
import { getPaginationParams } from "../utils/pagination.js";
import { searchAdminEntities } from "../services/search.service.js";
import {
  getSystemOverview,
  getAdminCharts,
  getWeeklyTopSongs,
  getAdminUserDetail,
} from "../services/admin.service.js";
import { uploadMediaFile } from "../services/storage.service.js";
import {
  importSongLyricsFromSource,
  validateSongLyricsSource,
} from "../services/lyrics.service.js";
import {
  listArtistRequests,
  reviewArtistRequest,
} from "../services/artist-request.service.js";

const parseGenreQuery = (query) => query.genre || query.genres || [];

const createHttpError = (status, message) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

const normalizeNullableString = (value) => {
  if (value === undefined) return undefined;
  if (value === null) return null;

  const normalized = String(value).trim();
  return normalized || null;
};

const normalizeSongUpdatePayload = (body = {}) => {
  const payload = { ...body };

  if (payload.lyrics_url && payload.lyrics_path === undefined) {
    payload.lyrics_path = payload.lyrics_url;
  }

  if (payload.lyricsPath !== undefined && payload.lyrics_path === undefined) {
    payload.lyrics_path = payload.lyricsPath;
  }

  if (payload.lyrics_path !== undefined) {
    payload.lyrics_path = normalizeNullableString(payload.lyrics_path);
  }

  return payload;
};

const getScopedPaginationParams = (query = {}, prefix) => {
  const page = Math.max(
    parseInt(query[`${prefix}_page`] ?? query[`${prefix}Page`] ?? query.page, 10) || 1,
    1
  );
  const limitInput = parseInt(
    query[`${prefix}_limit`] ??
      query[`${prefix}Limit`] ??
      query.limit ??
      query.pageSize,
    10
  );
  const limit = Math.min(Math.max(limitInput || 10, 1), 100);

  return {
    page,
    limit,
    offset: (page - 1) * limit,
  };
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

export const approveSongRequest = async (req, res, next) => {
  try {
    const song = await reviewSong(req.params.id, {
      status: SONG_STATUS.APPROVED,
      reviewerId: req.user.id,
    });

    logger.info("Song approved", {
      songId: req.params.id,
      reviewerId: req.user.id,
    });

    return res.json({
      message: "Song approved successfully",
      song,
    });
  } catch (error) {
    return next(error);
  }
};

export const blockSongRequest = async (req, res, next) => {
  try {
    const rejectReason = req.body.reject_reason ?? req.body.rejectReason;

    if (!rejectReason) {
      return next(createHttpError(400, "reject_reason is required"));
    }

    const song = await reviewSong(req.params.id, {
      status: SONG_STATUS.REJECTED,
      reviewerId: req.user.id,
      rejectReason,
    });

    logger.info("Song blocked", {
      songId: req.params.id,
      reviewerId: req.user.id,
    });

    return res.json({
      message: "Song blocked successfully",
      song,
    });
  } catch (error) {
    return next(error);
  }
};

export const listArtistRequestsRequest = async (req, res, next) => {
  try {
    const { page, limit, offset } = getPaginationParams(req.query);
    const { status } = req.query;
    const keyword = req.query.q || req.query.keyword;

    const result = await listArtistRequests({
      page,
      limit,
      offset,
      status,
      keyword,
    });

    return successResponse(res, result.items, result.meta);
  } catch (error) {
    return next(error);
  }
};

export const reviewArtistRequestHandler = async (req, res, next) => {
  try {
    const { status, reject_reason, rejectReason } = req.body;

    if (!status) {
      return next(createHttpError(400, "status is required"));
    }

    const request = await reviewArtistRequest(req.params.id, {
      status,
      rejectReason: reject_reason ?? rejectReason,
      reviewerId: req.user.id,
    });

    logger.info("Artist request reviewed", {
      requestId: req.params.id,
      status,
      reviewerId: req.user.id,
    });

    return res.json({
      message: "Artist request reviewed successfully",
      request,
    });
  } catch (error) {
    return next(error);
  }
};

export const approveArtistRequest = async (req, res, next) => {
  try {
    const request = await reviewArtistRequest(req.params.id, {
      status: "approved",
      reviewerId: req.user.id,
    });

    logger.info("Artist request approved", {
      requestId: req.params.id,
      reviewerId: req.user.id,
    });

    return res.json({
      message: "Artist request approved successfully",
      request,
    });
  } catch (error) {
    return next(error);
  }
};

export const rejectArtistRequest = async (req, res, next) => {
  try {
    const rejectReason = req.body.reject_reason ?? req.body.rejectReason;

    if (!rejectReason) {
      return next(createHttpError(400, "reject_reason is required"));
    }

    const request = await reviewArtistRequest(req.params.id, {
      status: "rejected",
      reviewerId: req.user.id,
      rejectReason,
    });

    logger.info("Artist request rejected", {
      requestId: req.params.id,
      reviewerId: req.user.id,
    });

    return res.json({
      message: "Artist request rejected successfully",
      request,
    });
  } catch (error) {
    return next(error);
  }
};

export const listGenresRequest = async (req, res, next) => {
  try {
    const { page, limit, offset } = getPaginationParams(req.query);
    const keyword = req.query.keyword || req.query.q;

    const result = await listGenres({ page, limit, offset, keyword });
    return successResponse(res, result.items, result.meta);
  } catch (error) {
    return next(error);
  }
};

export const createGenreRequest = async (req, res, next) => {
  try {
    const genre = await createGenre(req.body.name);
    return successResponse(res, genre, null, 201);
  } catch (error) {
    return next(error);
  }
};

export const updateGenreRequest = async (req, res, next) => {
  try {
    const genre = await updateGenre(req.params.id, req.body.name);
    return successResponse(res, genre);
  } catch (error) {
    return next(error);
  }
};

export const deleteGenreRequest = async (req, res, next) => {
  try {
    const genre = await getGenreByIdWithDeleted(req.params.id);
    if (!genre) {
      return next(createHttpError(404, "Genre not found"));
    }

    if (genre.is_deleted) {
      await deleteGenre(req.params.id);
      return successResponse(res, { message: "Genre permanently deleted" });
    }
    await softDeleteGenre(req.params.id, {
      deletedBy: req.user?.id,
      deletedByRole: req.user?.role,
    });
    return successResponse(res, { message: "Genre deleted" });
  } catch (error) {
    return next(error);
  }
};

export const restoreGenreRequest = async (req, res, next) => {
  try {
    const genre = await restoreGenre(req.params.id, {
      requesterRole: req.user?.role,
    });
    return successResponse(res, genre);
  } catch (error) {
    return next(error);
  }
};

export const searchAdmin = async (req, res, next) => {
  try {
    const keyword = (req.query.q || req.query.keyword || "").trim();
    if (!keyword) {
      return next(createHttpError(400, "keyword is required"));
    }

    const { page, limit, offset } = getPaginationParams(req.query);

    const result = await searchAdminEntities(keyword, {
      page,
      limit,
      offset,
    });

    return successResponse(res, result.items, result.meta);
  } catch (error) {
    return next(error);
  }
};

export const getReportOverview = async (req, res, next) => {
  try {
    const limit = Number(req.query.limit) || 5;
    const [overview, weeklyTopSongs] = await Promise.all([
      getSystemOverview(),
      getWeeklyTopSongs(limit),
    ]);

    return successResponse(res, {
      overview,
      weeklyTopSongs,
    });
  } catch (error) {
    return next(error);
  }
};

export const getReportCharts = async (req, res, next) => {
  try {
    const charts = await getAdminCharts({
      from: req.query.from,
      to: req.query.to,
      tz: req.query.tz,
      bucket: req.query.bucket,
      include: req.query.include,
    });

    return successResponse(res, charts);
  } catch (error) {
    return next(error);
  }
};

export const getUserDetailRequest = async (req, res, next) => {
  try {
    const result = await getAdminUserDetail(req.params.id, {
      listening: getScopedPaginationParams(req.query, "listening"),
      search: getScopedPaginationParams(req.query, "search"),
    });

    return successResponse(res, result);
  } catch (error) {
    return next(error);
  }
};

export const listSongsRequest = async (req, res, next) => {
  try {
    const { page, limit, offset } = getPaginationParams(req.query);
    const keyword = req.query.q || req.query.keyword;
    const { status, artistId, artist_id, albumId, album_id } = req.query;

    const result = await listSongs({
      page,
      limit,
      offset,
      status,
      artistId: artistId || artist_id,
      albumId: albumId || album_id,
      genres: parseGenreQuery(req.query),
      includeUnreleased: true,
      keyword,
    });

    return successResponse(res, result.items, result.meta);
  } catch (error) {
    return next(error);
  }
};

export const updateSongRequest = async (req, res, next) => {
  try {
    const payload = normalizeSongUpdatePayload(req.body);
    const audioFile = req.files?.audio?.[0];
    const coverFile = req.files?.cover?.[0];

    if (audioFile) {
      const audioUpload = await uploadMediaFile({
        folder: "uploads/music",
        file: audioFile,
        prefix: "song-audio",
        ownerId: req.user?.id,
      });
      payload.audio_path = audioUpload.publicUrl;
    }

    if (coverFile) {
      const coverUpload = await uploadMediaFile({
        folder: "uploads/songs",
        file: coverFile,
        prefix: "song-cover",
        ownerId: req.user?.id,
      });
      payload.cover_url = coverUpload.publicUrl;
    }

    const song = await updateSong(req.params.id, payload);
    return successResponse(res, song);
  } catch (error) {
    return next(error);
  }
};

export const validateSongLyricsRequest = async (req, res, next) => {
  try {
    const result = await validateSongLyricsSource(req.params.id);

    logger.info("Song lyrics source validated", {
      songId: req.params.id,
      reviewerId: req.user.id,
      lineCount: result.line_count,
    });

    return successResponse(res, result);
  } catch (error) {
    return next(error);
  }
};

export const importSongLyricsRequest = async (req, res, next) => {
  try {
    const result = await importSongLyricsFromSource(req.params.id, {
      importedBy: req.user.id,
    });

    logger.info("Song lyrics imported", {
      songId: req.params.id,
      reviewerId: req.user.id,
      importedCount: result.imported_count,
    });

    return successResponse(res, result);
  } catch (error) {
    return next(error);
  }
};
