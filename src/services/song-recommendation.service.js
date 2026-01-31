import db from "../config/db.js";

/**
 * =========================
 * CONFIG
 * =========================
 */

// candidate size
const AUDIO_CANDIDATES = 150;
const META_CANDIDATES = 150;

// final results
const FINAL_RESULTS = 15;

// weight
const W_AUDIO = 0.5;
const W_META = 0.5;
const W_ARTIST_BONUS = 0.45;
const W_ALBUM_BONUS = 0.10;

// diversity
const MAX_PER_ARTIST = 3;

// history filter
const RECENT_HOURS = 2;

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

/**
 * =========================
 * LOAD QUERY SONG
 * =========================
 */

const getQuerySong = async (songId) => {
  const [[song]] = await db.query(
    `
    SELECT id, title, artist_id, album_id
    FROM songs
    WHERE id = ?
      AND status = 'approved'
      AND is_deleted = 0
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
    audioVec: audio ? parseVector(audio.vector) : null,
    metaVec: meta ? parseVector(meta.vector) : null,
  };
};

/**
 * =========================
 * LOAD CANDIDATES (FILTER RECENT)
 * =========================
 */

const getAllCandidates = async (songId, userId) => {
  const [rows] = await db.query(
    `
    SELECT
      s.id,
      s.title,
      s.artist_id,
      s.album_id,
      ae.vector AS audio_vector,
      me.vector AS meta_vector
    FROM songs s
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
    `,
    [songId, userId, userId, RECENT_HOURS]
  );

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    artistId: r.artist_id,
    albumId: r.album_id,
    audioVec: parseVector(r.audio_vector),
    metaVec: parseVector(r.meta_vector),
  }));
};

/**
 * =========================
 * MAIN RECOMMENDATION
 * =========================
 */

export const getSimilarSongs = async (songId, userId = null) => {
  const query = await getQuerySong(songId);
  if (!query) {
    const err = new Error("Song not found");
    err.status = 404;
    throw err;
  }

  const candidates = await getAllCandidates(songId, userId);

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
        .sort((a, b) => b.audioSim - a.audioSim)
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
        .sort((a, b) => b.metaSim - a.metaSim)
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
    }
  });

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

      return {
        songId: c.id,
        title: c.title,
        artistId: c.artistId,
        albumId: c.albumId,
        score,
      };
    })
    .sort((a, b) => b.score - a.score);

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

  return finalResults;
};

export default {
  getSimilarSongs,
};
