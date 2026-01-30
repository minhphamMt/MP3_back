import db from "../config/db.js";

/**
 * CONFIG
 */
const AUDIO_CANDIDATES = 150;
const META_CANDIDATES = 150;
const FINAL_RESULTS = 15;

// weights
const W_AUDIO = 0.6;
const W_META = 0.4;
const W_ARTIST = 0.3;
const W_ALBUM = 0.05;

/**
 * UTIL
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

  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
};

/**
 * LOAD QUERY SONG + EMBEDDINGS
 */
const getQuerySong = async (songId) => {
  const [[song]] = await db.query(
    `
    SELECT id, title, artist_id, album_id
    FROM songs
    WHERE id = ? AND status='approved' AND is_deleted=0
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
 * LOAD ALL CANDIDATES
 */
const getAllCandidates = async (songId) => {
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
      AND s.status='approved'
      AND s.is_deleted=0
    `,
    [songId]
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
 * MAIN RECOMMENDATION
 */
export const getSimilarSongs = async (songId) => {
  const query = await getQuerySong(songId);
  if (!query) {
    const err = new Error("Song not found");
    err.status = 404;
    throw err;
  }

  const candidates = await getAllCandidates(songId);

  // === AUDIO SIMILARITY ===
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

  // === METADATA SIMILARITY ===
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

  // === MERGE UNIQUE ===
  const map = new Map();
  [...audioRanked, ...metaRanked].forEach((c) => {
    if (!map.has(c.id)) {
      map.set(c.id, {
        ...c,
        audioSim: c.audioSim || 0,
        metaSim: c.metaSim || 0,
      });
    }
  });

  // === FINAL RERANK ===
  const finalRanked = Array.from(map.values())
    .map((c) => {
      let score =
        W_AUDIO * c.audioSim +
        W_META * c.metaSim;

      if (c.artistId === query.song.artist_id) score += W_ARTIST;
      if (c.albumId === query.song.album_id) score += W_ALBUM;

      return {
        songId: c.id,
        title: c.title,
        score,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, FINAL_RESULTS)
    .map((r) => ({
      ...r,
      score: Number(r.score.toFixed(6)),
    }));

  return finalRanked;
};

export default {
  getSimilarSongs,
};
