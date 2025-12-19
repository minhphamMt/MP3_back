import db from "../config/db.js";
import env from "../config/env.js";

const DEFAULT_LIMIT = 20;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_HISTORY_ROWS = 100;

const recommendationCache = new Map();

const createError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const buildPlaceholders = (items) => items.map(() => "?").join(", ");

const toNumericIds = (ids = []) =>
  ids
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0);

const mergeUnique = (...lists) => {
  const uniqueIds = new Set();
  const combined = [];

  lists.flat().forEach((id) => {
    const numericId = Number(id);
    if (
      Number.isInteger(numericId) &&
      numericId > 0 &&
      !uniqueIds.has(numericId)
    ) {
      uniqueIds.add(numericId);
      combined.push(numericId);
    }
  });

  return combined;
};

const normalizeLimit = (limit) => {
  const parsed = Number(limit);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return DEFAULT_LIMIT;
  }

  return Math.min(parsed, 100);
};

const getCachedRecommendations = (userId) => {
  const cacheEntry = recommendationCache.get(userId);
  if (!cacheEntry) return null;

  if (cacheEntry.expiresAt > Date.now()) {
    return cacheEntry.data;
  }

  recommendationCache.delete(userId);
  return null;
};

const setCachedRecommendations = (userId, recommendations) => {
  recommendationCache.set(userId, {
    data: recommendations,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
};

const getListeningHistoryWithMetadata = async (
  userId,
  limit = MAX_HISTORY_ROWS
) => {
  const [rows] = await db.query(
    `
    SELECT
      lh.song_id,
      s.artist_id,
      GROUP_CONCAT(DISTINCT g.name) AS genres,
      COUNT(*) AS play_count
    FROM listening_history lh
    JOIN songs s ON s.id = lh.song_id
    LEFT JOIN song_genres sg ON sg.song_id = s.id
    LEFT JOIN genres g ON g.id = sg.genre_id
    WHERE lh.user_id = ?
    GROUP BY lh.song_id, s.artist_id
    ORDER BY play_count DESC
    LIMIT ?;
  `,
    [userId, limit]
  );

  return rows;
};

const getTopPreferences = (historyRows) => {
  const artistScores = new Map();
  const genreScores = new Map();

  historyRows.forEach((row) => {
    const weight = Number(row.play_count) || 1;

    if (row.artist_id) {
      artistScores.set(
        row.artist_id,
        (artistScores.get(row.artist_id) || 0) + weight
      );
    }

    if (row.genres) {
      row.genres
        .split(",")
        .map((genre) => genre.trim())
        .filter(Boolean)
        .forEach((genre) => {
          genreScores.set(genre, (genreScores.get(genre) || 0) + weight);
        });
    }
  });

  const sortScores = (scores) =>
    [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([key]) => key);

  return {
    artists: sortScores(artistScores).slice(0, 5),
    genres: sortScores(genreScores).slice(0, 5),
  };
};

const querySongsByPreference = async (artists, genres, excludeIds, limit) => {
  if (!artists.length && !genres.length) {
    return [];
  }

  const params = [];
  const preferenceConditions = [];

  if (artists.length) {
    preferenceConditions.push(`s.artist_id IN (${buildPlaceholders(artists)})`);
    params.push(...artists);
  }

  if (genres.length) {
    preferenceConditions.push(`g.name IN (${buildPlaceholders(genres)})`);
    params.push(...genres);
  }

  const filters = [];
  if (preferenceConditions.length) {
    filters.push(`(${preferenceConditions.join(" OR ")})`);
  }

  if (excludeIds.length) {
    filters.push(`s.id NOT IN (${buildPlaceholders(excludeIds)})`);
    params.push(...excludeIds);
  }

  if (!filters.length) {
    return [];
  }

  params.push(limit);

  const [rows] = await db.query(
    `
    SELECT s.id
    FROM songs s
    LEFT JOIN song_genres sg ON sg.song_id = s.id
    LEFT JOIN genres g ON g.id = sg.genre_id
    WHERE ${filters.join(" AND ")}
    GROUP BY s.id
    ORDER BY s.play_count DESC
    LIMIT ?;
  `,
    params
  );

  return rows.map((row) => row.id);
};

const getPopularSongs = async (limit, excludeIds = []) => {
  if (limit <= 0) return [];

  const params = [];
  const filters = [];

  if (excludeIds.length) {
    filters.push(`s.id NOT IN (${buildPlaceholders(excludeIds)})`);
    params.push(...excludeIds);
  }

  params.push(limit);

  const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

  const [rows] = await db.query(
    `
    SELECT s.id
    FROM songs s
    ${whereClause}
    ORDER BY s.play_count DESC
    LIMIT ?;
  `,
    params
  );

  return rows.map((row) => row.id);
};

const buildFallbackRecommendations = async (
  userId,
  limit,
  excludeIds,
  historyRows
) => {
  const history =
    historyRows || (await getListeningHistoryWithMetadata(userId));
  const exclusions = mergeUnique(excludeIds);

  if (!history.length) {
    return getPopularSongs(limit, exclusions);
  }

  const { artists, genres } = getTopPreferences(history);
  const preferenceMatches = await querySongsByPreference(
    artists,
    genres,
    exclusions,
    limit
  );

  const updatedExclusions = mergeUnique(exclusions, preferenceMatches);
  const remaining = limit - preferenceMatches.length;

  if (remaining <= 0) {
    return mergeUnique(preferenceMatches).slice(0, limit);
  }

  const popularFallback = await getPopularSongs(remaining, updatedExclusions);
  return mergeUnique(preferenceMatches, popularFallback).slice(0, limit);
};

const callEmbeddingService = async (userId, historyRows, limit) => {
  if (!env.embeddingServiceUrl) {
    return [];
  }

  const fetchFn = globalThis.fetch;
  if (typeof fetchFn !== "function") {
    return [];
  }

  try {
    const response = await fetchFn(`${env.embeddingServiceUrl}/recommend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        history: historyRows?.map((item) => item.song_id) || [],
        limit,
      }),
    });

    if (!response.ok) {
      return [];
    }

    const payload = await response.json();
    const suggestions =
      payload?.song_ids ||
      payload?.songs ||
      payload?.data?.song_ids ||
      payload?.data;

    if (!Array.isArray(suggestions)) {
      return [];
    }

    return toNumericIds(suggestions).slice(0, limit);
  } catch (error) {
    return [];
  }
};

export const getRecommendations = async (userId, limit = DEFAULT_LIMIT) => {
  if (!userId) {
    throw createError(400, "User id is required for recommendations");
  }

  const normalizedLimit = normalizeLimit(limit);
  const cached = getCachedRecommendations(userId);
  if (cached && cached.length >= normalizedLimit) {
    return cached.slice(0, normalizedLimit);
  }

  const historyRows = await getListeningHistoryWithMetadata(userId);
  const modelRecommendations = await callEmbeddingService(
    userId,
    historyRows,
    normalizedLimit
  );

  let recommendations = mergeUnique(modelRecommendations);

  if (recommendations.length < normalizedLimit) {
    const fallback = await buildFallbackRecommendations(
      userId,
      normalizedLimit,
      recommendations,
      historyRows
    );
    recommendations = mergeUnique(recommendations, fallback);
  }

  if (!recommendations.length) {
    recommendations = await getPopularSongs(normalizedLimit);
  }

  const finalList = recommendations.slice(0, normalizedLimit);
  setCachedRecommendations(userId, finalList);

  return finalList;
};

export default {
  getRecommendations,
};
