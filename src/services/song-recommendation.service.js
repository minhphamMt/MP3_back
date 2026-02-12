import db from "../config/db.js";

/**
 * =========================
 * CONFIG
 * =========================
 */

const parsePositiveInt = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
};

const parseNonNegativeNumber = (value, fallback) => {
  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed < 0) {
    return fallback;
  }

  return parsed;
};

// candidate size
const AUDIO_CANDIDATES = parsePositiveInt(
  process.env.SIMILAR_AUDIO_CANDIDATES,
  200
);
const META_CANDIDATES = parsePositiveInt(
  process.env.SIMILAR_META_CANDIDATES,
  200
);

// final results
const FINAL_RESULTS = parsePositiveInt(process.env.SIMILAR_FINAL_RESULTS, 15);

// weight
const W_AUDIO = parseNonNegativeNumber(process.env.SIMILAR_WEIGHT_AUDIO, 0.5);
const W_META = parseNonNegativeNumber(process.env.SIMILAR_WEIGHT_META, 0.45);
const W_ARTIST_BONUS = parseNonNegativeNumber(
  process.env.SIMILAR_WEIGHT_ARTIST_BONUS,
  0.45
);
const W_ALBUM_BONUS = parseNonNegativeNumber(
  process.env.SIMILAR_WEIGHT_ALBUM_BONUS,
  0.1
);
const W_GENRE = parseNonNegativeNumber(process.env.SIMILAR_WEIGHT_GENRE, 0.35);

// diversity
const MAX_PER_ARTIST = parsePositiveInt(
  process.env.SIMILAR_MAX_PER_ARTIST,
  3
);

// history filter
const RECENT_HOURS = parsePositiveInt(process.env.SIMILAR_RECENT_HOURS, 2);
const PRESELECT_CANDIDATES = parsePositiveInt(
  process.env.SIMILAR_PRESELECT_CANDIDATES,
  1200
);
const CACHE_TTL_MS = parsePositiveInt(
  process.env.SIMILAR_CACHE_TTL_MS,
  2 * 60 * 1000
);

// quality gates
const MIN_AUDIO_SIM = parseNonNegativeNumber(process.env.SIMILAR_MIN_AUDIO_SIM, 0.2);
const MIN_META_SIM = parseNonNegativeNumber(process.env.SIMILAR_MIN_META_SIM, 0.15);
const MIN_FINAL_SCORE = parseNonNegativeNumber(
  process.env.SIMILAR_MIN_FINAL_SCORE,
  0.3
);

const WEAK_GENRE_WEIGHT = parseNonNegativeNumber(
  process.env.SIMILAR_WEAK_GENRE_WEIGHT,
  0.25
);
const STRONG_GENRE_WEIGHT = parseNonNegativeNumber(
  process.env.SIMILAR_STRONG_GENRE_WEIGHT,
  1
);
const STRONG_GENRE_OVERLAP_MIN_WEIGHT = parseNonNegativeNumber(
  process.env.SIMILAR_STRONG_GENRE_OVERLAP_MIN_WEIGHT,
  0.8
);

const STYLE_GENRE_KEYWORDS = [
  "rap",
  "hip hop",
  "hiphop",
  "r&b",
  "rb",
  "pop",
  "rock",
  "edm",
  "house",
  "techno",
  "ballad",
  "indie",
  "acoustic",
  "jazz",
  "blues",
  "bolero",
  "dance",
  "remix",
  "folk",
  "lofi",
  "metal",
  "trữ tình",
  "cải lương",
];

const BROAD_GENRE_KEYWORDS = [
  "việt nam",
  "viet nam",
  "vietnam",
  "nhạc việt",
  "nhac viet",
  "quốc tế",
  "quoc te",
  "international",
  "us-uk",
  "âu mỹ",
  "au my",
  "châu á",
  "chau a",
  "hàn quốc",
  "han quoc",
  "trung quốc",
  "trung quoc",
  "nhật bản",
  "nhat ban",
  "thái lan",
  "thai lan",
];

const similarSongsCache = new Map();

const getCachedSimilarSongs = (cacheKey) => {
  const item = similarSongsCache.get(cacheKey);
  if (!item) return null;

  if (item.expiresAt > Date.now()) {
    return item.data;
  }

  similarSongsCache.delete(cacheKey);
  return null;
};

const setCachedSimilarSongs = (cacheKey, data) => {
  similarSongsCache.set(cacheKey, {
    data,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
};

/**
 * =========================
 * VECTOR UTILS
 * =========================
 */

const parseVector = (value) => {
  if (!value) return null;
  try {
    const v = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(v) ? v.map(Number) : null;
  } catch {
    return null;
  }
};

export const cosineSimilarity = (a, b) => {
  if (!a || !b || a.length !== b.length) return 0;

  let dot = 0,
    na = 0,
    nb = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }

  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
};

const normalizeGenre = (genre) =>
  String(genre || "")
    .trim()
    .toLowerCase();

const parseGenreString = (genreString) =>
  genreString
    ? String(genreString)
        .split(",")
        .map((genre) => normalizeGenre(genre))
        .filter(Boolean)
    : [];

const getGenreWeight = (genre) => {
  const normalized = normalizeGenre(genre);
  if (!normalized) return 0;

  const hasStyleKeyword = STYLE_GENRE_KEYWORDS.some((keyword) =>
    normalized.includes(keyword)
  );

  if (hasStyleKeyword) {
    return STRONG_GENRE_WEIGHT;
  }

  const isBroadGenre = BROAD_GENRE_KEYWORDS.some((keyword) =>
    normalized.includes(keyword)
  );

  if (isBroadGenre) {
    return WEAK_GENRE_WEIGHT;
  }

  return 0.7;
};

const calculateWeightedGenreSimilarity = (setA, setB) => {
  if (!setA.size || !setB.size) {
    return {
      similarity: 0,
      hasStrongOverlap: false,
    };
  }

  const union = new Set([...setA, ...setB]);
  let numerator = 0;
  let denominator = 0;
  let hasStrongOverlap = false;

  for (const genre of union) {
    const weight = getGenreWeight(genre);
    const inA = setA.has(genre);
    const inB = setB.has(genre);

    if (inA && inB) {
      numerator += weight;
      if (weight >= STRONG_GENRE_OVERLAP_MIN_WEIGHT) {
        hasStrongOverlap = true;
      }
    }

    if (inA || inB) {
      denominator += weight;
    }
  }

  if (!denominator) {
    return {
      similarity: 0,
      hasStrongOverlap,
    };
  }

  return {
    similarity: numerator / denominator,
    hasStrongOverlap,
  };
};

/**
 * =========================
 * LOAD QUERY SONG
 * =========================
 */

const getQuerySong = async (songId) => {
  const [[song]] = await db.query(
    `
    SELECT
      s.id,
      s.title,
      s.artist_id,
      s.album_id,
      GROUP_CONCAT(DISTINCT g.name) AS genres
    FROM songs s
    LEFT JOIN song_genres sg ON sg.song_id = s.id
    LEFT JOIN genres g ON g.id = sg.genre_id
    WHERE s.id = ?
      AND s.status = 'approved'
      AND s.is_deleted = 0
    GROUP BY s.id, s.title, s.artist_id, s.album_id
    LIMIT 1
    `,
    [songId]
  );

  if (!song) return null;

  const [embs] = await db.query(
    `
    SELECT type, vector
    FROM song_embeddings
    WHERE song_id = ?
    `,
    [songId]
  );

  const audio = embs.find((e) => e.type === "audio");
  const meta = embs.find((e) => e.type === "metadata");

  return {
    song,
    genreSet: new Set(parseGenreString(song.genres)),
    audioVec: audio ? parseVector(audio.vector) : null,
    metaVec: meta ? parseVector(meta.vector) : null,
  };
};

/**
 * =========================
 * LOAD CANDIDATES (FILTER RECENT)
 * =========================
 */

const getAllCandidates = async (songId, userId, querySong) => {
  const [rows] = await db.query(
    `
    SELECT
      s.id,
      s.title,
      s.artist_id,
      s.album_id,
      s.play_count,
      GROUP_CONCAT(DISTINCT g.name) AS genres,
      ae.vector AS audio_vector,
      me.vector AS meta_vector,
      CASE WHEN s.artist_id = ? THEN 1 ELSE 0 END AS same_artist,
      CASE WHEN s.album_id = ? THEN 1 ELSE 0 END AS same_album,
      CASE
        WHEN EXISTS (
          SELECT 1
          FROM song_genres source_sg
          JOIN song_genres candidate_sg ON candidate_sg.genre_id = source_sg.genre_id
          WHERE source_sg.song_id = ?
            AND candidate_sg.song_id = s.id
          LIMIT 1
        ) THEN 1 ELSE 0
      END AS shares_genre
    FROM songs s
    LEFT JOIN song_genres sg ON sg.song_id = s.id
    LEFT JOIN genres g ON g.id = sg.genre_id
    LEFT JOIN song_embeddings ae ON ae.song_id = s.id AND ae.type = 'audio'
    LEFT JOIN song_embeddings me ON me.song_id = s.id AND me.type = 'metadata'
    WHERE s.id != ?
      AND s.status = 'approved'
      AND s.is_deleted = 0
      AND (
        ? IS NULL OR s.id NOT IN (
          SELECT song_id
          FROM listening_history
          WHERE user_id = ?
            AND listened_at >= NOW() - INTERVAL ? HOUR
        )
      )
    GROUP BY s.id, s.title, s.artist_id, s.album_id, ae.vector, me.vector
    ORDER BY same_artist DESC,
      same_album DESC,
      shares_genre DESC,
      s.play_count DESC,
      s.id ASC
    LIMIT ?
    `,
    [
      querySong.artist_id || null,
      querySong.album_id || null,
      songId,
      songId,
      userId,
      userId,
      RECENT_HOURS,
      PRESELECT_CANDIDATES,
    ]
  );

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    artistId: r.artist_id,
    albumId: r.album_id,
    playCount: Number(r.play_count) || 0,
    genreSet: new Set(parseGenreString(r.genres)),
    audioVec: parseVector(r.audio_vector),
    metaVec: parseVector(r.meta_vector),
  }));
};

const getFallbackCandidates = async (query, excludeSongId, limit) => {
  const safeLimit = parsePositiveInt(limit, FINAL_RESULTS);
  const [rows] = await db.query(
    `
    SELECT
      s.id,
      s.title,
      s.artist_id,
      s.album_id,
      s.play_count,
      GROUP_CONCAT(DISTINCT g.name) AS genres,
      CASE WHEN s.artist_id = ? THEN 1 ELSE 0 END AS same_artist,
      CASE WHEN s.album_id = ? THEN 1 ELSE 0 END AS same_album
    FROM songs s
    LEFT JOIN song_genres sg ON sg.song_id = s.id
    LEFT JOIN genres g ON g.id = sg.genre_id
    WHERE s.id != ?
      AND s.status = 'approved'
      AND s.is_deleted = 0
    GROUP BY s.id, s.title, s.artist_id, s.album_id, s.play_count
    ORDER BY same_artist DESC, same_album DESC, s.play_count DESC, s.id ASC
    LIMIT ?;
    `,
    [
      query.song.artist_id || null,
      query.song.album_id || null,
      excludeSongId,
      safeLimit * 5,
    ]
  );

  const artistCount = {};
  const selected = [];

  const rankedRows = rows
    .map((row) => {
      const genreSignal = calculateWeightedGenreSimilarity(
        query.genreSet,
        new Set(parseGenreString(row.genres))
      );
      const fallbackScore =
        row.same_artist * W_ARTIST_BONUS +
        row.same_album * W_ALBUM_BONUS +
        genreSignal.similarity * W_GENRE;

      return {
        ...row,
        fallbackScore,
        hasStrongGenreOverlap: genreSignal.hasStrongOverlap,
      };
    })
    .sort((a, b) => {
      if (b.fallbackScore !== a.fallbackScore) {
        return b.fallbackScore - a.fallbackScore;
      }
      return b.play_count - a.play_count || a.id - b.id;
    });

  for (const row of rankedRows) {
    if (
      query.genreSet.size &&
      !row.same_artist &&
      !row.hasStrongGenreOverlap &&
      row.fallbackScore < MIN_FINAL_SCORE
    ) {
      continue;
    }

    artistCount[row.artist_id] = artistCount[row.artist_id] || 0;
    if (artistCount[row.artist_id] >= MAX_PER_ARTIST) {
      continue;
    }

    artistCount[row.artist_id]++;
    selected.push({
      songId: row.id,
      title: row.title,
      score: Number(
        row.fallbackScore.toFixed(6)
      ),
    });

    if (selected.length >= safeLimit) {
      break;
    }
  }

  return selected;
};

/**
 * =========================
 * MAIN RECOMMENDATION
 * =========================
 */

export const getSimilarSongs = async (songId, userId = null) => {
  const cacheKey = `${songId}:${userId || "anon"}`;
  const cached = getCachedSimilarSongs(cacheKey);
  if (cached) {
    return cached;
  }

  const query = await getQuerySong(songId);
  if (!query) {
    const err = new Error("Song not found");
    err.status = 404;
    throw err;
  }

  const candidates = await getAllCandidates(songId, userId, query.song);

  /**
   * === STAGE 1: AUDIO RANKING
   */
  const audioRanked = query.audioVec
    ? candidates
        .map((c) => ({
          ...c,
          audioSim: c.audioVec
            ? cosineSimilarity(query.audioVec, c.audioVec)
            : 0,
        }))
        .filter((c) => c.audioSim >= MIN_AUDIO_SIM)
        .sort((a, b) => b.audioSim - a.audioSim || a.id - b.id)
        .slice(0, AUDIO_CANDIDATES)
    : [];

  /**
   * === STAGE 2: METADATA RANKING
   */
  const metaRanked = query.metaVec
    ? candidates
        .map((c) => ({
          ...c,
          metaSim: c.metaVec
            ? cosineSimilarity(query.metaVec, c.metaVec)
            : 0,
        }))
        .filter((c) => c.metaSim >= MIN_META_SIM)
        .sort((a, b) => b.metaSim - a.metaSim || a.id - b.id)
        .slice(0, META_CANDIDATES)
    : [];

  /**
   * === MERGE UNIQUE CANDIDATES
   */
  const mergedMap = new Map();

  [...audioRanked, ...metaRanked].forEach((c) => {
    if (!mergedMap.has(c.id)) {
      mergedMap.set(c.id, {
        ...c,
        audioSim: c.audioSim || 0,
        metaSim: c.metaSim || 0,
      });
      return;
    }

    const existing = mergedMap.get(c.id);
    mergedMap.set(c.id, {
      ...existing,
      audioSim: Math.max(existing.audioSim || 0, c.audioSim || 0),
      metaSim: Math.max(existing.metaSim || 0, c.metaSim || 0),
    });
  });

  if (!mergedMap.size) {
    const fallbackOnly = await getFallbackCandidates(query, songId, FINAL_RESULTS);
    setCachedSimilarSongs(cacheKey, fallbackOnly);
    return fallbackOnly;
  }

  /**
   * === FINAL RERANK
   */
  const reranked = Array.from(mergedMap.values())
    .map((c) => {
      let score =
        W_AUDIO * c.audioSim +
        W_META * c.metaSim;

      if (c.artistId === query.song.artist_id) {
        score += W_ARTIST_BONUS;
      }

      if (c.albumId === query.song.album_id) {
        score += W_ALBUM_BONUS;
      }

      const genreSignal = calculateWeightedGenreSimilarity(
        query.genreSet,
        c.genreSet
      );
      score += genreSignal.similarity * W_GENRE;

      return {
        songId: c.id,
        title: c.title,
        artistId: c.artistId,
        albumId: c.albumId,
        genreSim: genreSignal.similarity,
        hasStrongGenreOverlap: genreSignal.hasStrongOverlap,
        score,
      };
    })
    .filter(
      (item) =>
        item.score >= MIN_FINAL_SCORE ||
        item.hasStrongGenreOverlap ||
        item.artistId === query.song.artist_id
    )
    .sort((a, b) => b.score - a.score || a.songId - b.songId);

  /**
   * === DIVERSITY FILTER (LIMIT PER ARTIST)
   */
  const artistCount = {};
  const finalResults = [];

  for (const r of reranked) {
    artistCount[r.artistId] = artistCount[r.artistId] || 0;
    if (artistCount[r.artistId] >= MAX_PER_ARTIST) continue;

    artistCount[r.artistId]++;
    finalResults.push({
      songId: r.songId,
      title: r.title,
      score: Number(r.score.toFixed(6)),
    });

    if (finalResults.length >= FINAL_RESULTS) break;
  }

  if (!finalResults.length) {
    const fallbackOnly = await getFallbackCandidates(query, songId, FINAL_RESULTS);
    setCachedSimilarSongs(cacheKey, fallbackOnly);
    return fallbackOnly;
  }

  setCachedSimilarSongs(cacheKey, finalResults);

  return finalResults;
};

export default {
  getSimilarSongs,
};
