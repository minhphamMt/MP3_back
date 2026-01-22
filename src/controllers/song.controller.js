import {
  createSong,
  softDeleteSong,
  restoreSong,
  getSongById,
  getSongStats,
  recordSongPlay,
  likeSong,
  listSongs,
  unlikeSong,
  updateSong,
  updateSongMedia,
  listSongsByArtist,
  getLikedSongs
} from "../services/song.service.js";
import { getPaginationParams } from "../utils/pagination.js";
import { errorResponse, successResponse } from "../utils/response.js";
import ROLES from "../constants/roles.js";
import SONG_STATUS from "../constants/song-status.js";
import { getArtistByUserId, getArtistByUserIdWithDeleted } from "../services/artist.service.js";
import { getAlbumById } from "../services/album.service.js";

const parseGenreQuery = (query) => query.genre || query.genres || [];
const resolveIncludeUnreleased = async ({ user }, { artistId, albumId }) => {
  if (!user) return false;

  if (user.role === ROLES.ADMIN) {
    return true;
  }

  if (user.role !== ROLES.ARTIST) {
    return false;
  }

  const artist = await getArtistByUserId(user.id);
  if (!artist) {
    return false;
  }

  if (artistId && Number(artistId) === artist.id) {
    return true;
  }

  if (albumId) {
    const album = await getAlbumById(albumId, {
      includeSongs: false,
      includeUnreleased: true,
    });
    return album?.artist_id === artist.id;
  }

  return false;
};

export const getSongs = async (req, res, next) => {
  try {
    const { page, limit, offset } = getPaginationParams(req.query);
    const {
      status,
      artistId,
      artist_id: artist_id_param,
      albumId,
      album_id,
    } = req.query;

    const includeUnreleased = await resolveIncludeUnreleased(req, {
      artistId: artistId || artist_id_param,
      albumId: albumId || album_id,
    });

    const result = await listSongs({
      page,
      limit,
      offset,
      status,
      artistId: artistId || artist_id_param,
      albumId: albumId || album_id,
      genres: parseGenreQuery(req.query),
      includeUnreleased,
    });

    return successResponse(res, result.items, result.meta);
  } catch (error) {
    return next(error);
  }
};

export const getSong = async (req, res, next) => {
  try {
    let includeUnreleased = false;

    if (req.user?.role === ROLES.ADMIN) {
      includeUnreleased = true;
    } else if (req.user?.role === ROLES.ARTIST) {
      const artist = await getArtistByUserId(req.user.id);
      if (artist) {
        const ownedSong = await getSongById(req.params.id, {
          includeUnreleased: true,
        });
        if (ownedSong?.artist_id === artist.id) {
          return successResponse(res, ownedSong);
        }
      }
    }

    const song = await getSongById(req.params.id, {
      status: req.query.status,
      genres: parseGenreQuery(req.query),
      includeUnreleased,
    });

    if (!song) {
      return errorResponse(res, "Song not found", 404);
    }

    return successResponse(res, song);
  } catch (error) {
    return next(error);
  }
};

export const likeSongHandler = async (req, res, next) => {
  try {
    const stats = await likeSong(req.params.id, req.user.id);
    return successResponse(res, stats, null, 201);
  } catch (error) {
    return next(error);
  }
};

export const unlikeSongHandler = async (req, res, next) => {
  try {
    const stats = await unlikeSong(req.params.id, req.user.id);
    return successResponse(res, stats);
  } catch (error) {
    return next(error);
  }
};

export const recordPlay = async (req, res, next) => {
  try {
    if (!req.user?.id) {
      return errorResponse(res, "Authentication required", 401);
    }
    

    const duration = Number(req.body?.duration);
    const normalizedDuration = Number.isFinite(duration) ? duration : null;

    const stats = await recordSongPlay(
      req.params.id,
      req.user.id,
      normalizedDuration
    );
    return successResponse(res, stats);
  } catch (error) {
    return next(error);
  }
};

export const getSongEngagement = async (req, res, next) => {
  try {
    const stats = await getSongStats(req.params.id);
    return successResponse(res, stats);
  } catch (error) {
    return next(error);
  }
};
export const createSongHandler = async (req, res, next) => {
  try {
    const payload = { ...req.body };
    const audioFile = req.files?.audio?.[0];
    const coverFile = req.files?.cover?.[0];

    if (audioFile) {
      payload.audio_path = `/uploads/music/${audioFile.filename}`;
    }
    if (coverFile) {
      payload.cover_url = `/uploads/songs/${coverFile.filename}`;
    }

    if (req.user?.role === ROLES.ARTIST) {
      const artist = await getArtistByUserId(req.user.id);
      if (!artist) {
        return errorResponse(res, "Artist profile not found", 403);
      }

      payload.artist_id = artist.id;
      payload.status = SONG_STATUS.PENDING;

      if (payload.album_id) {
        const album = await getAlbumById(payload.album_id, {
          includeSongs: false,
        });
        if (!album) {
          return errorResponse(res, "Album not found", 404);
        }
        if (album.artist_id !== artist.id) {
          return errorResponse(res, "Album does not belong to artist", 403);
        }
      }
    }

    const song = await createSong(payload);
    return successResponse(res, song, null, 201);
  } catch (error) {
    return next(error);
  }
};

export const updateSongHandler = async (req, res, next) => {
  try {
    const payload = { ...req.body };
    const audioFile = req.files?.audio?.[0];
    const coverFile = req.files?.cover?.[0];

    if (audioFile) {
      payload.audio_path = `/uploads/music/${audioFile.filename}`;
    }
    if (coverFile) {
      payload.cover_url = `/uploads/songs/${coverFile.filename}`;
    }

    if (req.user?.role === ROLES.ARTIST) {
      const artist = await getArtistByUserId(req.user.id);
      if (!artist) {
        return errorResponse(res, "Artist profile not found", 403);
      }

      const existingSong = await getSongById(req.params.id, {
        includeUnreleased: true,
      });
      if (!existingSong) {
        return errorResponse(res, "Song not found", 404);
      }
      if (existingSong.artist_id !== artist.id) {
        return errorResponse(res, "Forbidden", 403);
      }

      delete payload.status;
      delete payload.artist_id;

      if (payload.album_id) {
       const album = await getAlbumById(payload.album_id, {
          includeSongs: false,
          includeUnreleased: true, 
});

        if (!album) {
          return errorResponse(res, "Album not found", 404);
        }
        if (album.artist_id !== artist.id) {
          return errorResponse(res, "Album does not belong to artist", 403);
        }
      }
    }

    const song = await updateSong(req.params.id, payload);
    return successResponse(res, song);
  } catch (error) {
    return next(error);
  }
};

export const uploadSongAudio = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    if (req.user?.role === ROLES.ARTIST) {
      const artist = await getArtistByUserId(req.user.id);
      if (!artist) {
        return errorResponse(res, "Artist profile not found", 403);
      }

      const existingSong = await getSongById(req.params.id, {
        includeUnreleased: true,
      });
      if (!existingSong) {
        return errorResponse(res, "Song not found", 404);
      }
      if (existingSong.artist_id !== artist.id) {
        return errorResponse(res, "Forbidden", 403);
      }
    }

    const audioPath = `/uploads/music/${req.file.filename}`;
    const song = await updateSongMedia(req.params.id, { audioPath });

    return res.json({
      message: "Song audio uploaded successfully",
      audio_path: audioPath,
      song,
    });
  } catch (error) {
    return next(error);
  }
};

export const uploadSongCover = async (req, res, next) => {
  try {
    if (!req.file) {
      return errorResponse(res, "No file uploaded", 400);
    }

    const existingSong = await getSongById(req.params.id, {
      includeUnreleased: true,
    });
    if (!existingSong) {
      return errorResponse(res, "Song not found", 404);
    }

    if (req.user?.role === ROLES.ARTIST) {
      const artist = await getArtistByUserId(req.user.id);
      if (!artist) {
        return errorResponse(res, "Artist profile not found", 403);
      }
      if (existingSong.artist_id !== artist.id) {
        return errorResponse(res, "Forbidden", 403);
      }
    }

    const coverUrl = `/uploads/songs/${req.file.filename}`;
    const song = await updateSongMedia(req.params.id, { coverUrl });

    return successResponse(res, {
      cover_url: coverUrl,
      song,
    });
  } catch (error) {
    return next(error);
  }
};

export const deleteSongHandler = async (req, res, next) => {
  try {
    if (req.user?.role === ROLES.ARTIST) {
      const artist = await getArtistByUserId(req.user.id);
      if (!artist) {
        return errorResponse(res, "Artist profile not found", 403);
      }

      const existingSong = await getSongById(req.params.id, {
        includeUnreleased: true,
        includeDeleted: true,
      });
      if (!existingSong) {
        return errorResponse(res, "Song not found", 404);
      }
      if (existingSong.artist_id !== artist.id) {
        return errorResponse(res, "Forbidden", 403);
      }
    }

    await softDeleteSong(req.params.id, {
      deletedBy: req.user?.id,
      deletedByRole: req.user?.role,
    });
    return successResponse(res, { message: "Song deleted" });
  } catch (error) {
    return next(error);
  }
};

export const restoreSongHandler = async (req, res, next) => {
  try {
    let artistId = null;

    if (req.user?.role === ROLES.ARTIST) {
      const artist = await getArtistByUserIdWithDeleted(req.user.id);
      if (!artist) {
        return errorResponse(res, "Artist profile not found", 403);
      }
      artistId = artist.id;
    }

    const song = await restoreSong(req.params.id, {
      requesterRole: req.user?.role,
      requesterId: req.user?.id,
      artistId,
    });

    return successResponse(res, song);
  } catch (error) {
    return next(error);
  }
};

export const getSongsByArtist = async (req, res, next) => {
  try {
    const { artistId, artist_id: artist_id_param } = req.query;
    let resolvedArtistId = artistId || artist_id_param;

    if (!resolvedArtistId && req.user?.role === ROLES.ARTIST) {
      const artist = await getArtistByUserId(req.user.id);
      if (artist) {
        resolvedArtistId = artist.id;
      }
    }

    if (!resolvedArtistId) {
      return res.status(400).json({
        success: false,
        message: "artist_id is required",
      });
    }

    const includeUnreleased = await resolveIncludeUnreleased(req, {
      artistId: resolvedArtistId,
    });

    const songs = await listSongsByArtist(resolvedArtistId, {
      includeUnreleased,
    });

    return successResponse(res, songs);
  } catch (err) {
    next(err);
  }
};


export const getLikedSongss = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const songs = await getLikedSongs(userId);
    return successResponse(res, songs);
  } catch (err) {
    next(err);
  }
};

export default {
  getSongs,
  getSong,
  likeSongHandler,
  unlikeSongHandler,
  recordPlay,
  getSongEngagement,
  createSongHandler,
  updateSongHandler,
  uploadSongAudio,
  uploadSongCover,
  restoreSongHandler,
  deleteSongHandler,
  getSongsByArtist,
  getLikedSongss
};
