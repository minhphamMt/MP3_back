import db from "../config/db.js";
import { buildSongPublicVisibilityCondition } from "../utils/song-visibility.js";

const DEFAULT_LIMIT = 20;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const CACHE_STALE_MS = 30 * 60 * 1000; // 30 minutes
const COLD_START_CANDIDATE_MULTIPLIER = 2;
const COLD_START_MAX_PER_ARTIST = 2;

const coldStartCache = new Map();

const normalizeLimit = (limit) => {
  const parsed = Number(limit);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return DEFAULT_LIMIT;
  }

  return Math.min(parsed, 100);
};

const getCachedColdStart = (limit) => {
  const key = String(limit);
  const cacheEntry = coldStartCache.get(key);
  if (!cacheEntry) return null;

  const now = Date.now();
  if (cacheEntry.expiresAt > now) {
    return { data: cacheEntry.data, isStale: false };
  }

  if (cacheEntry.staleAt > now) {
    return { data: cacheEntry.data, isStale: true };
  }

  coldStartCache.delete(key);
  return null;
};

const setCachedColdStart = (limit, recommendations) => {
  const now = Date.now();
  const key = String(limit);

  coldStartCache.set(key, {
    data: recommendations,
    expiresAt: now + CACHE_TTL_MS,
    staleAt: now + Math.max(CACHE_TTL_MS, CACHE_STALE_MS),
    refreshing: false,
  });
};

const markColdStartRefreshing = (limit) => {
  const key = String(limit);
  const cacheEntry = coldStartCache.get(key);
  if (!cacheEntry || cacheEntry.refreshing) return false;

  coldStartCache.set(key, {
    ...cacheEntry,
    refreshing: true,
  });

  return true;
};

const getColdStartPopularSongs = async (limit) => {
  const [rows] = await db.query(
    `
    SELECT
      s.id,
      s.title,
      s.artist_id,
      ar.name AS artist_name,
      s.cover_url,
      s.play_count,
      s.release_date,
      'popular' AS source
    FROM songs s
    LEFT JOIN artists ar ON ar.id = s.artist_id
    WHERE ${buildSongPublicVisibilityCondition("s")}
    ORDER BY s.play_count DESC, s.release_date DESC
    LIMIT ?;
  `,
    [limit]
  );

  return rows;
};

const getColdStartFreshSongs = async (limit) => {
  const [rows] = await db.query(
    `
    SELECT
      s.id,
      s.title,
      s.artist_id,
      ar.name AS artist_name,
      s.cover_url,
      s.play_count,
      s.release_date,
      'fresh' AS source
    FROM songs s
    LEFT JOIN artists ar ON ar.id = s.artist_id
    WHERE ${buildSongPublicVisibilityCondition("s")}
    ORDER BY s.release_date DESC, s.play_count DESC
    LIMIT ?;
  `,
    [limit]
  );

  return rows;
};

const scoreColdStartItem = (song) => {
  const sourceScoreMap = {
    popular: 0.65,
    fresh: 0.5,
  };

  const popularityScore = Math.min((Number(song.play_count) || 0) / 1_000_000, 1);
  const sourceScore = sourceScoreMap[song.source] || 0;

  return popularityScore * 0.6 + sourceScore * 0.4;
};

const mapColdStartResult = (song) => ({
  songId: song.id,
  title: song.title,
  artistId: song.artist_id,
  artistName: song.artist_name,
  coverUrl: song.cover_url,
  playCount: Number(song.play_count) || 0,
  releaseDate: song.release_date,
  reason: song.source,
});

const buildColdStartRecommendations = async (normalizedLimit) => {
  const candidateLimit = normalizedLimit * COLD_START_CANDIDATE_MULTIPLIER;

  const [popularSongs, freshSongs] = await Promise.all([
    getColdStartPopularSongs(candidateLimit),
    getColdStartFreshSongs(candidateLimit),
  ]);

  const allCandidates = [...popularSongs, ...freshSongs]
    .map((song) => ({
      ...song,
      coldStartScore: scoreColdStartItem(song),
    }))
    .sort((a, b) => b.coldStartScore - a.coldStartScore);

  const seenSongIds = new Set();
  const artistCounter = new Map();
  const selected = [];

  for (const song of allCandidates) {
    if (seenSongIds.has(song.id)) {
      continue;
    }

    const currentArtistCount = artistCounter.get(song.artist_id) || 0;
    if (currentArtistCount >= COLD_START_MAX_PER_ARTIST) {
      continue;
    }

    seenSongIds.add(song.id);
    artistCounter.set(song.artist_id, currentArtistCount + 1);
    selected.push(mapColdStartResult(song));

    if (selected.length >= normalizedLimit) {
      break;
    }
  }

  return selected;
};

const refreshColdStartRecommendations = async (limit) => {
  if (!markColdStartRefreshing(limit)) {
    return;
  }

  try {
    const recommendations = await buildColdStartRecommendations(limit);
    setCachedColdStart(limit, recommendations);
  } catch {
    const key = String(limit);
    const cacheEntry = coldStartCache.get(key);
    if (cacheEntry) {
      coldStartCache.set(key, { ...cacheEntry, refreshing: false });
    }
  }
};

export const getColdStartRecommendations = async (limit = DEFAULT_LIMIT) => {
  const normalizedLimit = normalizeLimit(limit);
  const cached = getCachedColdStart(normalizedLimit);
  if (cached) {
    if (cached.isStale) {
      void refreshColdStartRecommendations(normalizedLimit);
    }
    return cached.data;
  }

  const recommendations = await buildColdStartRecommendations(normalizedLimit);
  setCachedColdStart(normalizedLimit, recommendations);

  return recommendations;
};

export default {
  getColdStartRecommendations,
};
