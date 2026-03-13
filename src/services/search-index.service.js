import Fuse from "fuse.js";

import db from "../config/db.js";
import {
  buildAlbumReleasedCondition,
  buildSongPublicVisibilityCondition,
} from "../utils/song-visibility.js";

const SEARCH_INDEX_TTL_MS = Number(process.env.SEARCH_INDEX_TTL_MS) > 0
  ? Number(process.env.SEARCH_INDEX_TTL_MS)
  : 10 * 60 * 1000;
const SEARCH_INDEX_STALE_MS = Number(process.env.SEARCH_INDEX_STALE_MS) > 0
  ? Number(process.env.SEARCH_INDEX_STALE_MS)
  : 30 * 60 * 1000;
const USER_SIGNAL_TTL_MS = Number(process.env.SEARCH_USER_SIGNAL_TTL_MS) > 0
  ? Number(process.env.SEARCH_USER_SIGNAL_TTL_MS)
  : 5 * 60 * 1000;
const SEARCH_RESULT_TTL_MS = Number(process.env.SEARCH_RESULT_TTL_MS) > 0
  ? Number(process.env.SEARCH_RESULT_TTL_MS)
  : 15 * 1000;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

const searchIndexCache = {
  public: {
    data: null,
    expiresAt: 0,
    staleAt: 0,
    promise: null,
  },
  admin: {
    data: null,
    expiresAt: 0,
    staleAt: 0,
    promise: null,
  },
};

const userSignalCache = new Map();
const searchResultCache = new Map();

const normalizeKeyword = (keyword = "") =>
  String(keyword ?? "")
    .trim()
    .replace(/\s+/g, " ");

const normalizeForSearch = (value = "") =>
  normalizeKeyword(String(value ?? ""))
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .normalize("NFD")
    .replace(/\u0111/g, "d")
    .replace(/\u0110/g, "D")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

const compactSearchValue = (value = "") => normalizeForSearch(value).replace(/\s+/g, "");

const tokenizeKeyword = (keyword = "") =>
  [...new Set(normalizeForSearch(keyword).split(" ").filter(Boolean))];

const uniqueStrings = (values = []) => [...new Set(values.filter(Boolean))];

const createFieldIndex = (values = []) => {
  const raw = uniqueStrings(values);
  const normalized = raw.map((value) => normalizeForSearch(value)).filter(Boolean);
  const compact = normalized.map((value) => value.replace(/\s+/g, ""));

  return {
    raw,
    normalized,
    compact,
  };
};

const buildSearchText = (...values) => {
  const variants = values.flatMap((value) => {
    const raw = normalizeKeyword(value);
    if (!raw) return [];

    const normalized = normalizeForSearch(raw);
    const compact = normalized.replace(/\s+/g, "");

    return uniqueStrings([raw, raw.toLowerCase(), normalized, compact]);
  });

  return uniqueStrings(variants).join(" ");
};

const logarithmicScore = (value, weight) =>
  Math.log1p(Math.max(Number(value) || 0, 0)) * weight;

const getFreshnessScore = (dateValue) => {
  if (!dateValue) return 0;

  const timestamp = new Date(dateValue).getTime();
  if (!Number.isFinite(timestamp)) return 0;

  const ageInDays = Math.max(0, (Date.now() - timestamp) / DAY_IN_MS);

  if (ageInDays <= 30) return 2.5;
  if (ageInDays <= 180) return 1.5;
  if (ageInDays <= 365) return 0.75;

  return 0;
};

const damerauLevenshteinDistance = (source = "", target = "", limit = 2) => {
  if (!source || !target) {
    return Math.max(source.length, target.length);
  }

  if (Math.abs(source.length - target.length) > limit) {
    return limit + 1;
  }

  const rows = source.length + 2;
  const cols = target.length + 2;
  const maxDistance = source.length + target.length;
  const matrix = Array.from({ length: rows }, () => Array(cols).fill(0));
  const lastSeen = new Map();

  matrix[0][0] = maxDistance;
  for (let i = 0; i <= source.length; i += 1) {
    matrix[i + 1][0] = maxDistance;
    matrix[i + 1][1] = i;
  }
  for (let j = 0; j <= target.length; j += 1) {
    matrix[0][j + 1] = maxDistance;
    matrix[1][j + 1] = j;
  }

  for (let i = 1; i <= source.length; i += 1) {
    let dbMatchColumn = 0;
    let rowMin = Number.POSITIVE_INFINITY;

    for (let j = 1; j <= target.length; j += 1) {
      const matchRow = lastSeen.get(target[j - 1]) || 0;
      const matchCol = dbMatchColumn;
      const cost = source[i - 1] === target[j - 1] ? 0 : 1;

      if (cost === 0) {
        dbMatchColumn = j;
      }

      matrix[i + 1][j + 1] = Math.min(
        matrix[i][j] + cost,
        matrix[i + 1][j] + 1,
        matrix[i][j + 1] + 1,
        matrix[matchRow][matchCol] +
          (i - matchRow - 1) +
          1 +
          (j - matchCol - 1)
      );

      rowMin = Math.min(rowMin, matrix[i + 1][j + 1]);
    }

    if (rowMin > limit) {
      return limit + 1;
    }

    lastSeen.set(source[i - 1], i);
  }

  return matrix[source.length + 1][target.length + 1];
};

const buildSongPopularityScore = (row) =>
  logarithmicScore(row.play_count, 1.6) +
  logarithmicScore(row.like_count, 2.2) +
  getFreshnessScore(row.release_date);

const buildArtistPopularityScore = (row) =>
  logarithmicScore(row.follow_count, 2.4) +
  logarithmicScore(row.song_count, 1.2);

const buildAlbumPopularityScore = (row) =>
  logarithmicScore(row.like_count, 2.1) +
  logarithmicScore(row.song_count, 1) +
  getFreshnessScore(row.release_date);

const createFuse = (documents, keys) =>
  new Fuse(documents, {
    includeScore: true,
    shouldSort: true,
    threshold: 0.38,
    ignoreLocation: true,
    minMatchCharLength: 2,
    keys,
  });

const getFuseQueryTerms = (keyword) =>
  uniqueStrings([
    normalizeKeyword(keyword),
    normalizeKeyword(keyword).toLowerCase(),
    normalizeForSearch(keyword),
    compactSearchValue(keyword),
  ]);

const getMaxAcceptedFuseScore = (keyword) => {
  const compactLength = compactSearchValue(keyword).length;

  if (compactLength <= 2) return 0.03;
  if (compactLength <= 3) return 0.08;
  if (compactLength <= 4) return 0.14;
  if (compactLength <= 6) return 0.28;
  if (compactLength <= 8) return 0.34;

  return 0.38;
};

const getRequiredTokenCoverage = (tokens = []) => {
  if (tokens.length <= 1) return 1;
  if (tokens.length === 2) return 0.5;

  return 0.66;
};

const mergeFuseResults = (fuse, queryTerms, candidateLimit) => {
  const merged = new Map();

  for (const term of queryTerms) {
    if (!term) continue;

    const searchResults = fuse.search(term).slice(0, candidateLimit);
    for (const result of searchResults) {
      const existing = merged.get(result.item.ref);
      if (!existing || (result.score ?? 1) < (existing.score ?? 1)) {
        merged.set(result.item.ref, result);
      }
    }
  }

  return [...merged.values()].sort(
    (left, right) => (left.score ?? 1) - (right.score ?? 1)
  );
};

const buildFieldSignals = (fieldIndex, normalizedKeyword, compactKeyword, tokens) => {
  const normalizedValues = fieldIndex?.normalized || [];
  const compactValues = fieldIndex?.compact || [];

  const exact = normalizedValues.some(
    (value, index) => value === normalizedKeyword || compactValues[index] === compactKeyword
  );
  const prefix = normalizedValues.some(
    (value, index) =>
      (normalizedKeyword.length >= 2 && value.startsWith(normalizedKeyword)) ||
      (compactKeyword.length >= 2 && compactValues[index].startsWith(compactKeyword))
  );
  const contains = normalizedValues.some(
    (value, index) =>
      value.includes(normalizedKeyword) || compactValues[index].includes(compactKeyword)
  );
  const tokenHits = tokens.filter((token) =>
    normalizedValues.some((value) => value.includes(token))
  ).length;

  return {
    exact,
    prefix,
    contains,
    tokenHits,
  };
};

const getBestFieldDistance = (fieldIndex, compactKeyword, limit = 2) => {
  if (!compactKeyword) return Number.POSITIVE_INFINITY;

  return (fieldIndex?.compact || [])
    .filter(
      (value) =>
        value &&
        value.length <= Math.max(compactKeyword.length + 4, 24) &&
        Math.abs(value.length - compactKeyword.length) <= limit + 2
    )
    .reduce((bestDistance, value) => {
      const distance = damerauLevenshteinDistance(value, compactKeyword, limit);
      return Math.min(bestDistance, distance);
    }, Number.POSITIVE_INFINITY);
};

const getPersonalizationBonus = (document, userSignals) => {
  if (!userSignals) return 0;

  let bonus = 0;

  if (document.type === "song") {
    if (userSignals.likedSongIds.has(document.id)) bonus += 8;
    if (document.artist_id && userSignals.preferredArtistIds.has(document.artist_id)) {
      bonus += 5;
    }
    if (document.album_id && userSignals.preferredAlbumIds.has(document.album_id)) {
      bonus += 3;
    }
  }

  if (document.type === "artist") {
    if (userSignals.followedArtistIds.has(document.id)) bonus += 10;
    if (userSignals.preferredArtistIds.has(document.id)) bonus += 6;
  }

  if (document.type === "album") {
    if (userSignals.likedAlbumIds.has(document.id)) bonus += 7;
    if (document.artist_id && userSignals.preferredArtistIds.has(document.artist_id)) {
      bonus += 4;
    }
    if (userSignals.preferredAlbumIds.has(document.id)) bonus += 3;
  }

  return bonus;
};

const createSearchContext = (keyword) => {
  const normalizedKeyword = normalizeForSearch(keyword);
  const compactKeyword = normalizedKeyword.replace(/\s+/g, "");
  const tokens = normalizedKeyword.split(" ").filter(Boolean);

  return {
    keyword,
    normalizedKeyword,
    compactKeyword,
    tokens,
    compactLength: compactKeyword.length,
    queryTerms: getFuseQueryTerms(keyword),
    maxAcceptedFuseScore: getMaxAcceptedFuseScore(keyword),
    requiredTokenCoverage: getRequiredTokenCoverage(tokens),
  };
};

const getCandidateLimit = ({ compactLength }, limit, offset) => {
  const pageWindow = Math.max(offset + limit, limit, 1);

  if (compactLength <= 2) {
    return Math.max(16, pageWindow * 3);
  }

  if (compactLength <= 4) {
    return Math.max(24, pageWindow * 5);
  }

  if (compactLength <= 8) {
    return Math.max(36, pageWindow * 7);
  }

  return Math.max(48, pageWindow * 8);
};

const rankSearchResult = (result, searchContext, userSignals) => {
  const document = result.item;
  const { normalizedKeyword, compactKeyword, tokens } = searchContext;
  const fuseScore = result.score ?? 1;

  const primaryDistance = getBestFieldDistance(
    document.primary_index,
    compactKeyword,
    2
  );
  const primarySignals = buildFieldSignals(
    document.primary_index,
    normalizedKeyword,
    compactKeyword,
    tokens
  );
  const prioritySignals = buildFieldSignals(
    document.priority_index,
    normalizedKeyword,
    compactKeyword,
    tokens
  );
  const secondarySignals = buildFieldSignals(
    document.match_index,
    normalizedKeyword,
    compactKeyword,
    tokens
  );
  const priorityDistance = getBestFieldDistance(
    document.priority_index,
    compactKeyword,
    2
  );
  const secondaryDistance = getBestFieldDistance(document.match_index, compactKeyword, 2);

  const tokenHits = Math.max(
    primarySignals.tokenHits,
    prioritySignals.tokenHits,
    secondarySignals.tokenHits
  );
  const tokenCoverage = tokens.length ? tokenHits / tokens.length : 0;
  const strongPrimaryTypo =
    compactKeyword.length >= 4 &&
    primaryDistance <= 1 &&
    Math.abs(document.primary_compact.length - compactKeyword.length) <= 1;
  const softPrimaryTypo = compactKeyword.length >= 6 && primaryDistance <= 2;
  const strongPriorityTypo = compactKeyword.length >= 4 && priorityDistance <= 1;
  const softPriorityTypo = compactKeyword.length >= 6 && priorityDistance <= 2;
  const strongSecondaryTypo = compactKeyword.length >= 4 && secondaryDistance <= 1;
  const softSecondaryTypo = compactKeyword.length >= 6 && secondaryDistance <= 2;
  const hasStrongTextMatch =
    primarySignals.exact ||
    primarySignals.prefix ||
    primarySignals.contains ||
    prioritySignals.exact ||
    prioritySignals.prefix ||
    prioritySignals.contains ||
    secondarySignals.exact ||
    secondarySignals.prefix ||
    strongPrimaryTypo ||
    strongPriorityTypo ||
    strongSecondaryTypo;

  const keep =
    hasStrongTextMatch ||
    softPrimaryTypo ||
    softPriorityTypo ||
    softSecondaryTypo ||
    (fuseScore <= searchContext.maxAcceptedFuseScore &&
      tokenCoverage >= searchContext.requiredTokenCoverage);

  if (!keep) {
    return null;
  }

  let rank = 0;

  if (primarySignals.exact) rank += 140;
  if (!primarySignals.exact && prioritySignals.exact) {
    rank += document.priority_exact_boost || 80;
  }
  if (!primarySignals.exact && !prioritySignals.exact && secondarySignals.exact) {
    rank += 44;
  }
  if (primarySignals.prefix) rank += 55;
  if (!primarySignals.prefix && prioritySignals.prefix) {
    rank += document.priority_prefix_boost || 34;
  }
  if (!primarySignals.prefix && !prioritySignals.prefix && secondarySignals.prefix) {
    rank += 14;
  }
  if (primarySignals.contains) rank += 22;
  if (!primarySignals.contains && prioritySignals.contains) {
    rank += document.priority_contains_boost || 12;
  }
  if (!primarySignals.contains && !prioritySignals.contains && secondarySignals.contains) {
    rank += 5;
  }
  if (strongPrimaryTypo) rank += 44;
  if (!strongPrimaryTypo && softPrimaryTypo) rank += 16;
  if (!strongPrimaryTypo && strongPriorityTypo) {
    rank += document.priority_typo_boost || 26;
  }
  if (!strongPrimaryTypo && !strongPriorityTypo && softPriorityTypo) {
    rank += Math.max((document.priority_typo_boost || 26) / 2, 10);
  }
  if (!strongPrimaryTypo && !strongPriorityTypo && strongSecondaryTypo) rank += 12;
  if (!strongPrimaryTypo && !strongPriorityTypo && !strongSecondaryTypo && softSecondaryTypo) {
    rank += 4;
  }

  rank += tokenCoverage * 60;
  rank += document.popularity_score * 2.5;
  rank += document.freshness_score * 1.5;
  rank += getPersonalizationBonus(document, userSignals);
  rank -= fuseScore * 100;

  return {
    rank,
    document,
  };
};

const paginateRankedResults = (rankedResults, offset, limit) =>
  rankedResults.slice(offset, offset + limit).map(({ document, rank }) => ({
    ...document.payload,
    score: Number(rank.toFixed(4)),
  }));

const buildSongDocuments = (rows, artistMap) =>
  rows.map((row) => {
    const artistNames = row.artist_names || row.artist_name || "";
    const artists = artistMap.get(row.id) || [];
    const primaryIndex = createFieldIndex([row.title]);
    const priorityIndex = createFieldIndex([
      row.artist_names,
      row.artist_name,
      row.artist_aliases,
      row.artist_alias,
      row.artist_realnames,
      row.artist_realname,
    ]);
    const matchIndex = createFieldIndex([row.album_title, row.genre_names]);

    return {
      ref: `song:${row.id}`,
      type: "song",
      id: row.id,
      artist_id: row.artist_id,
      album_id: row.album_id,
      primary_text: row.title || "",
      primary_norm: primaryIndex.normalized[0] || "",
      primary_compact: primaryIndex.compact[0] || "",
      primary_index: primaryIndex,
      priority_fields: priorityIndex.raw,
      priority_index: priorityIndex,
      match_fields: matchIndex.raw,
      match_index: matchIndex,
      priority_exact_boost: 58,
      priority_prefix_boost: 34,
      priority_contains_boost: 14,
      priority_typo_boost: 24,
      popularity_score: buildSongPopularityScore(row),
      freshness_score: getFreshnessScore(row.release_date),
      search_title: buildSearchText(row.title),
      search_artist_names: buildSearchText(
        artistNames,
        row.artist_name,
        row.artist_aliases,
        row.artist_alias,
        row.artist_realnames,
        row.artist_realname
      ),
      search_album_title: buildSearchText(row.album_title),
      search_genres: buildSearchText(row.genre_names),
      payload: {
        ...row,
        artist_name: row.artist_name || "",
        album_title: row.album_title || "",
        artists,
      },
    };
  });

const buildArtistDocuments = (rows) =>
  rows.map((row) => {
    const primaryIndex = createFieldIndex([row.name]);
    const priorityIndex = createFieldIndex([row.alias, row.realname]);
    const matchIndex = createFieldIndex([
      row.song_titles,
      row.album_titles,
      row.genre_names,
      row.national,
    ]);

    return {
      ref: `artist:${row.id}`,
      type: "artist",
      id: row.id,
      artist_id: row.id,
      album_id: null,
      primary_text: row.name || "",
      primary_norm: primaryIndex.normalized[0] || "",
      primary_compact: primaryIndex.compact[0] || "",
      primary_index: primaryIndex,
      priority_fields: priorityIndex.raw,
      priority_index: priorityIndex,
      match_fields: matchIndex.raw,
      match_index: matchIndex,
      priority_exact_boost: 96,
      priority_prefix_boost: 44,
      priority_contains_boost: 18,
      priority_typo_boost: 34,
      popularity_score: buildArtistPopularityScore(row),
      freshness_score: 0,
      search_name: buildSearchText(row.name),
      search_alias: buildSearchText(row.alias),
      search_realname: buildSearchText(row.realname),
      search_song_titles: buildSearchText(row.song_titles),
      search_album_titles: buildSearchText(row.album_titles),
      search_genres: buildSearchText(row.genre_names, row.national),
      payload: row,
    };
  });

const buildAlbumDocuments = (rows) =>
  rows.map((row) => {
    const primaryIndex = createFieldIndex([row.title]);
    const priorityIndex = createFieldIndex([
      row.artist_name,
      row.artist_alias,
      row.artist_realname,
    ]);
    const matchIndex = createFieldIndex([row.song_titles, row.genre_names]);

    return {
      ref: `album:${row.id}`,
      type: "album",
      id: row.id,
      artist_id: row.artist_id,
      album_id: row.id,
      primary_text: row.title || "",
      primary_norm: primaryIndex.normalized[0] || "",
      primary_compact: primaryIndex.compact[0] || "",
      primary_index: primaryIndex,
      priority_fields: priorityIndex.raw,
      priority_index: priorityIndex,
      match_fields: matchIndex.raw,
      match_index: matchIndex,
      priority_exact_boost: 54,
      priority_prefix_boost: 30,
      priority_contains_boost: 12,
      priority_typo_boost: 22,
      popularity_score: buildAlbumPopularityScore(row),
      freshness_score: getFreshnessScore(row.release_date),
      search_title: buildSearchText(row.title),
      search_artist_name: buildSearchText(
        row.artist_name,
        row.artist_alias,
        row.artist_realname
      ),
      search_song_titles: buildSearchText(row.song_titles),
      search_genres: buildSearchText(row.genre_names),
      payload: {
        ...row,
        artist_name: row.artist_name || "",
      },
    };
  });

const buildUserDocuments = (rows) =>
  rows.map((row) => {
    const primaryIndex = createFieldIndex([row.display_name || row.email]);
    const matchIndex = createFieldIndex([row.email]);

    return {
      ref: `user:${row.id}`,
      type: "user",
      id: row.id,
      artist_id: null,
      album_id: null,
      primary_text: row.display_name || row.email || "",
      primary_norm: primaryIndex.normalized[0] || "",
      primary_compact: primaryIndex.compact[0] || "",
      primary_index: primaryIndex,
      priority_fields: [],
      priority_index: createFieldIndex([]),
      match_fields: matchIndex.raw,
      match_index: matchIndex,
      popularity_score: row.is_active ? 0.5 : 0,
      freshness_score: 0,
      search_display_name: buildSearchText(row.display_name),
      search_email: buildSearchText(row.email),
      payload: row,
    };
  });

const createSearchIndex = (documents) => ({
  documents,
  fuses: {
    songs: createFuse(documents.songs, [
      { name: "search_title", weight: 0.4 },
      { name: "search_artist_names", weight: 0.36 },
      { name: "search_album_title", weight: 0.16 },
      { name: "search_genres", weight: 0.08 },
    ]),
    artists: createFuse(documents.artists, [
      { name: "search_name", weight: 0.4 },
      { name: "search_alias", weight: 0.24 },
      { name: "search_realname", weight: 0.24 },
      { name: "search_song_titles", weight: 0.07 },
      { name: "search_album_titles", weight: 0.03 },
      { name: "search_genres", weight: 0.02 },
    ]),
    albums: createFuse(documents.albums, [
      { name: "search_title", weight: 0.44 },
      { name: "search_artist_name", weight: 0.38 },
      { name: "search_song_titles", weight: 0.1 },
      { name: "search_genres", weight: 0.08 },
    ]),
    users: createFuse(documents.users, [
      { name: "search_display_name", weight: 0.72 },
      { name: "search_email", weight: 0.28 },
    ]),
  },
});

const getCachedSearchResult = (cacheKey) => {
  const cached = searchResultCache.get(cacheKey);
  if (!cached) return null;

  if (cached.expiresAt > Date.now()) {
    return cached.data;
  }

  searchResultCache.delete(cacheKey);
  return null;
};

const setCachedSearchResult = (cacheKey, data) => {
  if (searchResultCache.size >= 200) {
    const oldestKey = searchResultCache.keys().next().value;
    if (oldestKey) {
      searchResultCache.delete(oldestKey);
    }
  }

  searchResultCache.set(cacheKey, {
    data,
    expiresAt: Date.now() + SEARCH_RESULT_TTL_MS,
  });
};

const loadSongArtists = async (includeDeleted) => {
  const [rows] = await db.query(
    `
    SELECT
      sa.song_id,
      sa.artist_id,
      sa.artist_role,
      sa.sort_order,
      ar.name AS artist_name
    FROM song_artists sa
    JOIN artists ar ON ar.id = sa.artist_id
    ${includeDeleted ? "" : "WHERE ar.is_deleted = 0"}
    ORDER BY sa.song_id, sa.sort_order ASC, sa.created_at ASC
    `
  );

  const artistMap = new Map();

  for (const row of rows) {
    if (!artistMap.has(row.song_id)) {
      artistMap.set(row.song_id, []);
    }

    artistMap.get(row.song_id).push({
      id: row.artist_id,
      name: row.artist_name,
      role: row.artist_role,
      sort_order: row.sort_order,
    });
  }

  return artistMap;
};

const loadPublicSongs = async () => {
  const [rows] = await db.query(
    `
    SELECT
      s.id,
      s.zing_song_id,
      s.title,
      s.artist_id,
      s.album_id,
      s.duration,
      s.audio_path,
      s.cover_url,
      s.status,
      s.play_count,
      s.release_date,
      s.created_at,
      s.is_deleted,
      s.deleted_at,
      s.deleted_by,
      s.deleted_by_role,
      s.reject_reason,
      ANY_VALUE(a.name) AS artist_name,
      ANY_VALUE(a.alias) AS artist_alias,
      ANY_VALUE(a.realname) AS artist_realname,
      ANY_VALUE(al.title) AS album_title,
      ANY_VALUE(COALESCE(sa_names.artist_names, a.name, '')) AS artist_names,
      ANY_VALUE(COALESCE(sa_names.artist_aliases, a.alias, '')) AS artist_aliases,
      ANY_VALUE(COALESCE(sa_names.artist_realnames, a.realname, '')) AS artist_realnames,
      COALESCE(MAX(song_like_counts.like_count), 0) AS like_count,
      COALESCE(GROUP_CONCAT(DISTINCT g.name ORDER BY g.name SEPARATOR ' '), '') AS genre_names
    FROM songs s
    LEFT JOIN artists a ON a.id = s.artist_id AND a.is_deleted = 0
    LEFT JOIN albums al ON al.id = s.album_id AND al.is_deleted = 0
    LEFT JOIN (
      SELECT
        sa.song_id,
        GROUP_CONCAT(ar.name ORDER BY sa.sort_order ASC, sa.created_at ASC SEPARATOR ' ') AS artist_names,
        GROUP_CONCAT(ar.alias ORDER BY sa.sort_order ASC, sa.created_at ASC SEPARATOR ' ') AS artist_aliases,
        GROUP_CONCAT(ar.realname ORDER BY sa.sort_order ASC, sa.created_at ASC SEPARATOR ' ') AS artist_realnames
      FROM song_artists sa
      JOIN artists ar ON ar.id = sa.artist_id
      WHERE ar.is_deleted = 0
      GROUP BY sa.song_id
    ) sa_names ON sa_names.song_id = s.id
    LEFT JOIN (
      SELECT song_id, COUNT(*) AS like_count
      FROM song_likes
      GROUP BY song_id
    ) song_like_counts ON song_like_counts.song_id = s.id
    LEFT JOIN song_genres sg ON sg.song_id = s.id
    LEFT JOIN genres g ON g.id = sg.genre_id AND g.is_deleted = 0
    WHERE ${buildSongPublicVisibilityCondition("s", { albumAlias: "al" })}
    GROUP BY s.id
    `
  );

  return rows;
};

const loadAdminSongs = async () => {
  const [rows] = await db.query(
    `
    SELECT
      s.id,
      s.zing_song_id,
      s.title,
      s.artist_id,
      s.album_id,
      s.duration,
      s.audio_path,
      s.cover_url,
      s.status,
      s.play_count,
      s.release_date,
      s.created_at,
      s.is_deleted,
      s.deleted_at,
      s.deleted_by,
      s.deleted_by_role,
      s.reject_reason,
      ANY_VALUE(a.name) AS artist_name,
      ANY_VALUE(a.alias) AS artist_alias,
      ANY_VALUE(a.realname) AS artist_realname,
      ANY_VALUE(al.title) AS album_title,
      ANY_VALUE(COALESCE(sa_names.artist_names, a.name, '')) AS artist_names,
      ANY_VALUE(COALESCE(sa_names.artist_aliases, a.alias, '')) AS artist_aliases,
      ANY_VALUE(COALESCE(sa_names.artist_realnames, a.realname, '')) AS artist_realnames,
      COALESCE(MAX(song_like_counts.like_count), 0) AS like_count,
      COALESCE(GROUP_CONCAT(DISTINCT g.name ORDER BY g.name SEPARATOR ' '), '') AS genre_names
    FROM songs s
    LEFT JOIN artists a ON a.id = s.artist_id
    LEFT JOIN albums al ON al.id = s.album_id
    LEFT JOIN (
      SELECT
        sa.song_id,
        GROUP_CONCAT(ar.name ORDER BY sa.sort_order ASC, sa.created_at ASC SEPARATOR ' ') AS artist_names,
        GROUP_CONCAT(ar.alias ORDER BY sa.sort_order ASC, sa.created_at ASC SEPARATOR ' ') AS artist_aliases,
        GROUP_CONCAT(ar.realname ORDER BY sa.sort_order ASC, sa.created_at ASC SEPARATOR ' ') AS artist_realnames
      FROM song_artists sa
      JOIN artists ar ON ar.id = sa.artist_id
      GROUP BY sa.song_id
    ) sa_names ON sa_names.song_id = s.id
    LEFT JOIN (
      SELECT song_id, COUNT(*) AS like_count
      FROM song_likes
      GROUP BY song_id
    ) song_like_counts ON song_like_counts.song_id = s.id
    LEFT JOIN song_genres sg ON sg.song_id = s.id
    LEFT JOIN genres g ON g.id = sg.genre_id
    GROUP BY s.id
    `
  );

  return rows;
};

const loadPublicArtists = async () => {
  const publicSongCondition = buildSongPublicVisibilityCondition("s", {
    albumAlias: "al_song_visibility",
  });

  const [rows] = await db.query(
    `
    SELECT
      a.id,
      a.user_id,
      a.name,
      a.alias,
      a.bio,
      a.short_bio,
      a.avatar_url,
      a.cover_url,
      a.birthday,
      a.realname,
      a.national,
      a.follow_count,
      a.zing_artist_id,
      a.is_deleted,
      a.deleted_at,
      a.deleted_by,
      a.deleted_by_role,
      a.created_at,
      NULL AS updated_at,
      COALESCE(song_stats.song_count, 0) AS song_count,
      COALESCE(song_stats.song_titles, '') AS song_titles,
      COALESCE(album_stats.album_titles, '') AS album_titles,
      COALESCE(genre_stats.genre_names, '') AS genre_names
    FROM artists a
    LEFT JOIN (
      SELECT
        s.artist_id,
        COUNT(DISTINCT s.id) AS song_count,
        GROUP_CONCAT(DISTINCT s.title ORDER BY s.title SEPARATOR ' || ') AS song_titles
      FROM songs s
      LEFT JOIN albums al_song_visibility ON al_song_visibility.id = s.album_id
      WHERE ${publicSongCondition}
      GROUP BY s.artist_id
    ) song_stats ON song_stats.artist_id = a.id
    LEFT JOIN (
      SELECT
        al.artist_id,
        GROUP_CONCAT(DISTINCT al.title ORDER BY al.title SEPARATOR ' || ') AS album_titles
      FROM albums al
      WHERE ${buildAlbumReleasedCondition("al")}
      GROUP BY al.artist_id
    ) album_stats ON album_stats.artist_id = a.id
    LEFT JOIN (
      SELECT
        s.artist_id,
        GROUP_CONCAT(DISTINCT g.name ORDER BY g.name SEPARATOR ' ') AS genre_names
      FROM songs s
      LEFT JOIN albums al_song_visibility ON al_song_visibility.id = s.album_id
      JOIN song_genres sg ON sg.song_id = s.id
      JOIN genres g ON g.id = sg.genre_id AND g.is_deleted = 0
      WHERE ${publicSongCondition}
      GROUP BY s.artist_id
    ) genre_stats ON genre_stats.artist_id = a.id
    WHERE a.is_deleted = 0
    `
  );

  return rows;
};

const loadAdminArtists = async () => {
  const [rows] = await db.query(
    `
    SELECT
      a.id,
      a.user_id,
      a.name,
      a.alias,
      a.bio,
      a.short_bio,
      a.avatar_url,
      a.cover_url,
      a.birthday,
      a.realname,
      a.national,
      a.follow_count,
      a.zing_artist_id,
      a.is_deleted,
      a.deleted_at,
      a.deleted_by,
      a.deleted_by_role,
      a.created_at,
      NULL AS updated_at,
      COALESCE(song_stats.song_count, 0) AS song_count,
      COALESCE(song_stats.song_titles, '') AS song_titles,
      COALESCE(album_stats.album_titles, '') AS album_titles,
      COALESCE(genre_stats.genre_names, '') AS genre_names
    FROM artists a
    LEFT JOIN (
      SELECT
        s.artist_id,
        COUNT(DISTINCT s.id) AS song_count,
        GROUP_CONCAT(DISTINCT s.title ORDER BY s.title SEPARATOR ' || ') AS song_titles
      FROM songs s
      GROUP BY s.artist_id
    ) song_stats ON song_stats.artist_id = a.id
    LEFT JOIN (
      SELECT
        al.artist_id,
        GROUP_CONCAT(DISTINCT al.title ORDER BY al.title SEPARATOR ' || ') AS album_titles
      FROM albums al
      GROUP BY al.artist_id
    ) album_stats ON album_stats.artist_id = a.id
    LEFT JOIN (
      SELECT
        s.artist_id,
        GROUP_CONCAT(DISTINCT g.name ORDER BY g.name SEPARATOR ' ') AS genre_names
      FROM songs s
      JOIN song_genres sg ON sg.song_id = s.id
      LEFT JOIN genres g ON g.id = sg.genre_id
      GROUP BY s.artist_id
    ) genre_stats ON genre_stats.artist_id = a.id
    `
  );

  return rows;
};

const loadPublicAlbums = async () => {
  const publicSongCondition = buildSongPublicVisibilityCondition("s", {
    albumAlias: "al_song_visibility",
  });

  const [rows] = await db.query(
    `
    SELECT
      al.id,
      al.zing_album_id,
      al.title,
      al.artist_id,
      al.cover_url,
      al.release_date,
      al.created_at,
      al.is_deleted,
      al.deleted_at,
      al.deleted_by,
      al.deleted_by_role,
      ANY_VALUE(ar.name) AS artist_name,
      ANY_VALUE(ar.alias) AS artist_alias,
      ANY_VALUE(ar.realname) AS artist_realname,
      COALESCE(MAX(album_like_counts.like_count), 0) AS like_count,
      COALESCE(MAX(song_stats.song_count), 0) AS song_count,
      COALESCE(MAX(song_stats.song_titles), '') AS song_titles,
      COALESCE(MAX(song_stats.genre_names), '') AS genre_names
    FROM albums al
    LEFT JOIN artists ar ON ar.id = al.artist_id AND ar.is_deleted = 0
    LEFT JOIN (
      SELECT album_id, COUNT(*) AS like_count
      FROM album_likes
      GROUP BY album_id
    ) album_like_counts ON album_like_counts.album_id = al.id
    LEFT JOIN (
      SELECT
        s.album_id,
        COUNT(DISTINCT s.id) AS song_count,
        GROUP_CONCAT(DISTINCT s.title ORDER BY s.title SEPARATOR ' || ') AS song_titles,
        GROUP_CONCAT(DISTINCT g.name ORDER BY g.name SEPARATOR ' ') AS genre_names
      FROM songs s
      LEFT JOIN albums al_song_visibility ON al_song_visibility.id = s.album_id
      LEFT JOIN song_genres sg ON sg.song_id = s.id
      LEFT JOIN genres g ON g.id = sg.genre_id AND g.is_deleted = 0
      WHERE ${publicSongCondition}
      GROUP BY s.album_id
    ) song_stats ON song_stats.album_id = al.id
    WHERE al.is_deleted = 0
      AND ${buildAlbumReleasedCondition("al")}
    GROUP BY al.id
    `
  );

  return rows;
};

const loadAdminAlbums = async () => {
  const [rows] = await db.query(
    `
    SELECT
      al.id,
      al.zing_album_id,
      al.title,
      al.artist_id,
      al.cover_url,
      al.release_date,
      al.created_at,
      al.is_deleted,
      al.deleted_at,
      al.deleted_by,
      al.deleted_by_role,
      ANY_VALUE(ar.name) AS artist_name,
      ANY_VALUE(ar.alias) AS artist_alias,
      ANY_VALUE(ar.realname) AS artist_realname,
      COALESCE(MAX(album_like_counts.like_count), 0) AS like_count,
      COALESCE(MAX(song_stats.song_count), 0) AS song_count,
      COALESCE(MAX(song_stats.song_titles), '') AS song_titles,
      COALESCE(MAX(song_stats.genre_names), '') AS genre_names
    FROM albums al
    LEFT JOIN artists ar ON ar.id = al.artist_id
    LEFT JOIN (
      SELECT album_id, COUNT(*) AS like_count
      FROM album_likes
      GROUP BY album_id
    ) album_like_counts ON album_like_counts.album_id = al.id
    LEFT JOIN (
      SELECT
        s.album_id,
        COUNT(DISTINCT s.id) AS song_count,
        GROUP_CONCAT(DISTINCT s.title ORDER BY s.title SEPARATOR ' || ') AS song_titles,
        GROUP_CONCAT(DISTINCT g.name ORDER BY g.name SEPARATOR ' ') AS genre_names
      FROM songs s
      LEFT JOIN song_genres sg ON sg.song_id = s.id
      LEFT JOIN genres g ON g.id = sg.genre_id
      GROUP BY s.album_id
    ) song_stats ON song_stats.album_id = al.id
    GROUP BY al.id
    `
  );

  return rows;
};

const loadAdminUsers = async () => {
  const [rows] = await db.query(
    `
    SELECT
      u.id,
      u.display_name,
      u.email,
      u.role,
      u.is_active,
      u.created_at
    FROM users u
    `
  );

  return rows;
};

const buildSearchIndexData = async (scope) => {
  const isAdminScope = scope === "admin";
  const [songs, artists, albums, artistMap, users] = await Promise.all([
    isAdminScope ? loadAdminSongs() : loadPublicSongs(),
    isAdminScope ? loadAdminArtists() : loadPublicArtists(),
    isAdminScope ? loadAdminAlbums() : loadPublicAlbums(),
    loadSongArtists(isAdminScope),
    isAdminScope ? loadAdminUsers() : Promise.resolve([]),
  ]);

  return createSearchIndex({
    songs: buildSongDocuments(songs, artistMap),
    artists: buildArtistDocuments(artists),
    albums: buildAlbumDocuments(albums),
    users: buildUserDocuments(users),
  });
};

const getCachedUserSignals = (userId) => {
  const cached = userSignalCache.get(userId);
  if (!cached) return null;

  if (cached.expiresAt > Date.now()) {
    return cached;
  }

  userSignalCache.delete(userId);
  return null;
};

const loadUserSearchSignals = async (userId) => {
  if (!userId) return null;

  const cached = getCachedUserSignals(userId);
  if (cached?.data) {
    return cached.data;
  }

  if (cached?.promise) {
    return cached.promise;
  }

  const promise = Promise.all([
    db.query(
      `
      SELECT artist_id
      FROM artist_follows
      WHERE user_id = ?
      `,
      [userId]
    ),
    db.query(
      `
      SELECT song_id
      FROM song_likes
      WHERE user_id = ?
      `,
      [userId]
    ),
    db.query(
      `
      SELECT album_id
      FROM album_likes
      WHERE user_id = ?
      `,
      [userId]
    ),
    db.query(
      `
      SELECT
        s.artist_id,
        s.album_id,
        COUNT(*) AS listen_count
      FROM listening_history lh
      JOIN songs s ON s.id = lh.song_id
      WHERE lh.user_id = ?
      GROUP BY s.artist_id, s.album_id
      ORDER BY listen_count DESC
      LIMIT 30
      `,
      [userId]
    ),
  ])
    .then(([[followRows], [likedSongRows], [likedAlbumRows], [historyRows]]) => {
      const preferredArtistIds = new Set();
      const preferredAlbumIds = new Set();

      for (const row of historyRows) {
        if (row.artist_id) preferredArtistIds.add(row.artist_id);
        if (row.album_id) preferredAlbumIds.add(row.album_id);
      }

      return {
        followedArtistIds: new Set(
          followRows.map((row) => row.artist_id).filter(Boolean)
        ),
        likedSongIds: new Set(
          likedSongRows.map((row) => row.song_id).filter(Boolean)
        ),
        likedAlbumIds: new Set(
          likedAlbumRows.map((row) => row.album_id).filter(Boolean)
        ),
        preferredArtistIds,
        preferredAlbumIds,
      };
    })
    .finally(() => {
      const current = userSignalCache.get(userId);
      if (current?.promise) {
        userSignalCache.set(userId, {
          data: current.data || null,
          expiresAt: current.expiresAt || 0,
        });
      }
    });

  userSignalCache.set(userId, {
    data: null,
    expiresAt: 0,
    promise,
  });

  const data = await promise;
  userSignalCache.set(userId, {
    data,
    expiresAt: Date.now() + USER_SIGNAL_TTL_MS,
  });

  return data;
};

const refreshSearchIndex = (scope) => {
  const cacheEntry = searchIndexCache[scope];
  if (!cacheEntry) {
    throw new Error(`Unsupported search scope: ${scope}`);
  }

  if (cacheEntry.promise) {
    return cacheEntry.promise;
  }

  cacheEntry.promise = buildSearchIndexData(scope)
    .then((data) => {
      cacheEntry.data = data;
      cacheEntry.expiresAt = Date.now() + SEARCH_INDEX_TTL_MS;
      cacheEntry.staleAt = Date.now() + SEARCH_INDEX_STALE_MS;
      return data;
    })
    .finally(() => {
      cacheEntry.promise = null;
    });

  return cacheEntry.promise;
};

const getSearchIndex = async (scope) => {
  const cacheEntry = searchIndexCache[scope];
  if (!cacheEntry) {
    throw new Error(`Unsupported search scope: ${scope}`);
  }

  const now = Date.now();

  if (cacheEntry.data && cacheEntry.expiresAt > now) {
    return cacheEntry.data;
  }

  if (cacheEntry.data && cacheEntry.staleAt > now) {
    void refreshSearchIndex(scope);
    return cacheEntry.data;
  }

  return refreshSearchIndex(scope);
};

const searchTypedDocuments = async (
  searchContext,
  { documents, fuse, limit, offset, userSignals }
) => {
  if (!documents.length) {
    return {
      items: [],
      total: 0,
    };
  }

  if (!searchContext.normalizedKeyword) {
    return {
      items: [],
      total: 0,
    };
  }

  const candidateLimit = getCandidateLimit(searchContext, limit, offset);

  const rankedResults = mergeFuseResults(
    fuse,
    searchContext.queryTerms,
    candidateLimit
  )
    .map((result) => rankSearchResult(result, searchContext, userSignals))
    .filter(Boolean)
    .sort(
      (left, right) =>
        right.rank - left.rank ||
        String(left.document.primary_text).localeCompare(
          String(right.document.primary_text)
        )
    );

  return {
    items: paginateRankedResults(rankedResults, offset, limit),
    total: rankedResults.length,
  };
};

export const searchIndexedEntities = async (
  keyword,
  { limit, offset, scope = "public", userId } = {}
) => {
  const searchContext = createSearchContext(keyword);
  if (!searchContext.normalizedKeyword) {
    return {
      items: {
        songs: [],
        artists: [],
        albums: [],
        ...(scope === "admin" ? { users: [] } : {}),
      },
      total: 0,
    };
  }

  const cacheKey = [
    scope,
    userId || 0,
    limit,
    offset,
    searchContext.normalizedKeyword,
  ].join(":");
  const cachedResult = getCachedSearchResult(cacheKey);
  if (cachedResult) {
    return cachedResult;
  }

  const searchIndex = await getSearchIndex(scope);
  const userSignals =
    scope === "public" && userId && searchContext.compactLength >= 3
      ? await loadUserSearchSignals(userId)
      : null;

  const [songs, artists, albums, users] = await Promise.all([
    searchTypedDocuments(searchContext, {
      documents: searchIndex.documents.songs,
      fuse: searchIndex.fuses.songs,
      limit,
      offset,
      userSignals,
    }),
    searchTypedDocuments(searchContext, {
      documents: searchIndex.documents.artists,
      fuse: searchIndex.fuses.artists,
      limit,
      offset,
      userSignals,
    }),
    searchTypedDocuments(searchContext, {
      documents: searchIndex.documents.albums,
      fuse: searchIndex.fuses.albums,
      limit,
      offset,
      userSignals,
    }),
    scope === "admin"
      ? searchTypedDocuments(searchContext, {
          documents: searchIndex.documents.users,
          fuse: searchIndex.fuses.users,
          limit,
          offset,
          userSignals: null,
        })
      : Promise.resolve({ items: [], total: 0 }),
  ]);

  const result = {
    items: {
      songs: songs.items,
      artists: artists.items,
      albums: albums.items,
      ...(scope === "admin" ? { users: users.items } : {}),
    },
    total: songs.total + artists.total + albums.total + users.total,
  };

  setCachedSearchResult(cacheKey, result);

  return result;
};

export const invalidateSearchIndexCache = (scope = null) => {
  const scopes = scope ? [scope] : Object.keys(searchIndexCache);

  for (const key of scopes) {
    if (!searchIndexCache[key]) continue;
    searchIndexCache[key] = {
      data: null,
      expiresAt: 0,
      staleAt: 0,
      promise: null,
    };
  }

  searchResultCache.clear();
};
