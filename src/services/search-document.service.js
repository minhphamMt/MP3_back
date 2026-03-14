import db from "../config/db.js";
import { buildAlbumReleasedCondition, buildSongPublicVisibilityCondition } from "../utils/song-visibility.js";
import { normalizeKeyword } from "../utils/search-normalize.js";

const ENABLED_VALUES = new Set(["1", "true", "yes", "on"]);

export const isSearchDocumentsEnabled = () =>
  ENABLED_VALUES.has(String(process.env.SEARCH_DOCUMENTS_ENABLED || "").toLowerCase());

const normalizeForSearchDocuments = (keyword = "") =>
  normalizeKeyword(String(keyword ?? "")).toLowerCase();

const compactSearchValue = (value = "") =>
  normalizeForSearchDocuments(value).replace(/\s+/g, "");

const buildPattern = (value = "") => `%${value}%`;

const buildPrefixPattern = (value = "") => `${value}%`;

const mapRowsById = (rows = []) =>
  new Map(rows.map((row) => [Number(row.id), row]));

const orderRowsByIds = (rows = [], rankedRows = []) => {
  const rowMap = mapRowsById(rows);

  return rankedRows
    .map((rankedRow) => {
      const row = rowMap.get(Number(rankedRow.entity_id));
      if (!row) return null;
      return {
        ...row,
        score: Number(Number(rankedRow.score || 0).toFixed(4)),
      };
    })
    .filter(Boolean);
};

const attachSongArtists = async (songs = [], scope = "public") => {
  if (!songs.length) return songs;

  const songIds = songs.map((song) => song.id).filter(Boolean);
  if (!songIds.length) return songs;

  const placeholders = songIds.map(() => "?").join(",");
  const artistScopeFilter = scope === "public" ? "AND ar.is_deleted = 0" : "";
  const [artistRows] = await db.query(
    `
    SELECT
      sa.song_id,
      sa.artist_id,
      sa.artist_role,
      sa.sort_order,
      ar.name AS artist_name
    FROM song_artists sa
    JOIN artists ar ON ar.id = sa.artist_id
    WHERE sa.song_id IN (${placeholders})
      ${artistScopeFilter}
    ORDER BY sa.song_id, sa.sort_order ASC, sa.created_at ASC
    `,
    songIds
  );

  const artistMap = new Map();
  for (const row of artistRows) {
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

  return songs.map((song) => ({
    ...song,
    artists: artistMap.get(song.id) || [],
  }));
};

const searchUsersForAdmin = async (keyword, { limit, offset }) => {
  const normalizedKeyword = normalizeForSearchDocuments(keyword);
  if (!normalizedKeyword) {
    return { items: [], total: 0 };
  }

  const exactKeyword = normalizedKeyword;
  const prefixKeyword = buildPrefixPattern(normalizedKeyword);
  const containsKeyword = buildPattern(normalizedKeyword);
  const whereClause = `
    (
      LOWER(TRIM(COALESCE(u.display_name, ''))) = ?
      OR LOWER(TRIM(u.email)) = ?
      OR LOWER(TRIM(COALESCE(u.display_name, ''))) LIKE ?
      OR LOWER(TRIM(u.email)) LIKE ?
      OR LOWER(TRIM(COALESCE(u.display_name, ''))) LIKE ?
      OR LOWER(TRIM(u.email)) LIKE ?
    )
  `;
  const countParams = [
    exactKeyword,
    exactKeyword,
    prefixKeyword,
    prefixKeyword,
    containsKeyword,
    containsKeyword,
  ];

  const [[countRow]] = await db.query(
    `
    SELECT COUNT(*) AS total
    FROM users u
    WHERE ${whereClause}
    `,
    countParams
  );

  const [rows] = await db.query(
    `
    SELECT
      u.id,
      u.display_name,
      u.email,
      u.role,
      u.is_active,
      u.created_at,
      (
        CASE
          WHEN LOWER(TRIM(COALESCE(u.display_name, ''))) = ? THEN 260
          WHEN LOWER(TRIM(u.email)) = ? THEN 250
          WHEN LOWER(TRIM(COALESCE(u.display_name, ''))) LIKE ? THEN 210
          WHEN LOWER(TRIM(u.email)) LIKE ? THEN 200
          WHEN LOWER(TRIM(COALESCE(u.display_name, ''))) LIKE ? THEN 140
          WHEN LOWER(TRIM(u.email)) LIKE ? THEN 130
          ELSE 0
        END
        + CASE WHEN u.is_active = 1 THEN 5 ELSE 0 END
      ) AS score
    FROM users u
    WHERE ${whereClause}
    ORDER BY score DESC, u.is_active DESC, u.id DESC
    LIMIT ? OFFSET ?
    `,
    [
      exactKeyword,
      exactKeyword,
      prefixKeyword,
      prefixKeyword,
      containsKeyword,
      containsKeyword,
      ...countParams,
      limit,
      offset,
    ]
  );

  return {
    items: rows.map((row) => ({
      ...row,
      score: Number(Number(row.score || 0).toFixed(4)),
    })),
    total: Number(countRow?.total || 0),
  };
};

const searchEntityDocuments = async ({
  entityType,
  scope,
  keyword,
  limit,
  offset,
}) => {
  const normalizedKeyword = normalizeForSearchDocuments(keyword);
  const compactKeyword = compactSearchValue(keyword);
  if (!normalizedKeyword) {
    return { rows: [], total: 0 };
  }

  const exactKeyword = normalizedKeyword;
  const exactCompact = compactKeyword;
  const prefixKeyword = buildPrefixPattern(normalizedKeyword);
  const prefixCompact = compactKeyword ? buildPrefixPattern(compactKeyword) : "";
  const containsKeyword = buildPattern(normalizedKeyword);
  const containsCompact = compactKeyword ? buildPattern(compactKeyword) : "";
  const condition = `
    (
      primary_text_norm = ?
      OR primary_text_compact = ?
      OR primary_text_norm LIKE ?
      OR primary_text_compact LIKE ?
      OR priority_text_norm LIKE ?
      OR match_text_norm LIKE ?
      OR search_text_norm LIKE ?
      OR search_text_norm LIKE ?
    )
  `;
  const searchParams = [
    exactKeyword,
    exactCompact,
    prefixKeyword,
    prefixCompact,
    containsKeyword,
    containsKeyword,
    containsKeyword,
    containsCompact,
  ];

  const [[countRow]] = await db.query(
    `
    SELECT COUNT(*) AS total
    FROM search_documents sd
    WHERE sd.scope = ?
      AND sd.entity_type = ?
      AND sd.is_active = 1
      AND ${condition}
    `,
    [scope, entityType, ...searchParams]
  );

  const [rows] = await db.query(
    `
    SELECT
      sd.entity_id,
      (
        CASE
          WHEN sd.primary_text_norm = ? OR sd.primary_text_compact = ? THEN 320
          WHEN sd.primary_text_norm LIKE ? OR sd.primary_text_compact LIKE ? THEN 240
          WHEN sd.priority_text_norm LIKE ? THEN 180
          WHEN sd.match_text_norm LIKE ? THEN 130
          WHEN sd.search_text_norm LIKE ? OR sd.search_text_norm LIKE ? THEN 90
          ELSE 0
        END
        + COALESCE(sd.popularity_score, 0) * 10
        + COALESCE(sd.freshness_score, 0) * 4
      ) AS score
    FROM search_documents sd
    WHERE sd.scope = ?
      AND sd.entity_type = ?
      AND sd.is_active = 1
      AND ${condition}
    ORDER BY score DESC, sd.entity_id DESC
    LIMIT ? OFFSET ?
    `,
    [
      exactKeyword,
      exactCompact,
      prefixKeyword,
      prefixCompact,
      containsKeyword,
      containsKeyword,
      containsKeyword,
      containsCompact,
      scope,
      entityType,
      ...searchParams,
      limit,
      offset,
    ]
  );

  return {
    rows,
    total: Number(countRow?.total || 0),
  };
};

const getSongsByIds = async (ids = [], scope = "public") => {
  if (!ids.length) return [];

  const placeholders = ids.map(() => "?").join(",");
  const publicVisibility =
    scope === "public"
      ? `AND ${buildSongPublicVisibilityCondition("s", { albumAlias: "al" })}`
      : "";
  const artistJoin =
    scope === "public"
      ? "LEFT JOIN artists a ON a.id = s.artist_id AND a.is_deleted = 0"
      : "LEFT JOIN artists a ON a.id = s.artist_id";
  const albumJoin =
    scope === "public"
      ? "LEFT JOIN albums al ON al.id = s.album_id AND al.is_deleted = 0"
      : "LEFT JOIN albums al ON al.id = s.album_id";
  const songArtistWhere = scope === "public" ? "WHERE ar.is_deleted = 0" : "";
  const genreJoin =
    scope === "public"
      ? "JOIN genres g ON g.id = sg.genre_id AND g.is_deleted = 0"
      : "LEFT JOIN genres g ON g.id = sg.genre_id";

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
      a.name AS artist_name,
      a.alias AS artist_alias,
      a.realname AS artist_realname,
      al.title AS album_title,
      COALESCE(sa_names.artist_names, a.name, '') AS artist_names,
      COALESCE(sa_names.artist_aliases, a.alias, '') AS artist_aliases,
      COALESCE(sa_names.artist_realnames, a.realname, '') AS artist_realnames,
      COALESCE(song_like_counts.like_count, 0) AS like_count,
      COALESCE(song_genre_names.genre_names, '') AS genre_names
    FROM songs s
    ${artistJoin}
    ${albumJoin}
    LEFT JOIN (
      SELECT
        sa.song_id,
        GROUP_CONCAT(ar.name ORDER BY sa.sort_order ASC, sa.created_at ASC SEPARATOR ' ') AS artist_names,
        GROUP_CONCAT(ar.alias ORDER BY sa.sort_order ASC, sa.created_at ASC SEPARATOR ' ') AS artist_aliases,
        GROUP_CONCAT(ar.realname ORDER BY sa.sort_order ASC, sa.created_at ASC SEPARATOR ' ') AS artist_realnames
      FROM song_artists sa
      JOIN artists ar ON ar.id = sa.artist_id
      ${songArtistWhere}
      GROUP BY sa.song_id
    ) sa_names ON sa_names.song_id = s.id
    LEFT JOIN (
      SELECT song_id, COUNT(*) AS like_count
      FROM song_likes
      GROUP BY song_id
    ) song_like_counts ON song_like_counts.song_id = s.id
    LEFT JOIN (
      SELECT
        sg.song_id,
        GROUP_CONCAT(DISTINCT g.name ORDER BY g.name SEPARATOR ' ') AS genre_names
      FROM song_genres sg
      ${genreJoin}
      GROUP BY sg.song_id
    ) song_genre_names ON song_genre_names.song_id = s.id
    WHERE s.id IN (${placeholders})
      ${publicVisibility}
    `,
    ids
  );

  return attachSongArtists(rows, scope);
};

const getArtistsByIds = async (ids = [], scope = "public") => {
  if (!ids.length) return [];

  const placeholders = ids.map(() => "?").join(",");
  const publicSongCondition = buildSongPublicVisibilityCondition("s", {
    albumAlias: "al_song_visibility",
  });
  const publicAlbumCondition = buildAlbumReleasedCondition("al");

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
      ${scope === "public" ? "LEFT JOIN albums al_song_visibility ON al_song_visibility.id = s.album_id" : ""}
      ${scope === "public" ? `WHERE ${publicSongCondition}` : ""}
      GROUP BY s.artist_id
    ) song_stats ON song_stats.artist_id = a.id
    LEFT JOIN (
      SELECT
        al.artist_id,
        GROUP_CONCAT(DISTINCT al.title ORDER BY al.title SEPARATOR ' || ') AS album_titles
      FROM albums al
      ${scope === "public" ? `WHERE ${publicAlbumCondition}` : ""}
      GROUP BY al.artist_id
    ) album_stats ON album_stats.artist_id = a.id
    LEFT JOIN (
      SELECT
        s.artist_id,
        GROUP_CONCAT(DISTINCT g.name ORDER BY g.name SEPARATOR ' ') AS genre_names
      FROM songs s
      ${scope === "public" ? "LEFT JOIN albums al_song_visibility ON al_song_visibility.id = s.album_id" : ""}
      JOIN song_genres sg ON sg.song_id = s.id
      ${scope === "public"
        ? "JOIN genres g ON g.id = sg.genre_id AND g.is_deleted = 0"
        : "LEFT JOIN genres g ON g.id = sg.genre_id"}
      ${scope === "public" ? `WHERE ${publicSongCondition}` : ""}
      GROUP BY s.artist_id
    ) genre_stats ON genre_stats.artist_id = a.id
    WHERE a.id IN (${placeholders})
      ${scope === "public" ? "AND a.is_deleted = 0" : ""}
    `,
    ids
  );

  return rows;
};

const getAlbumsByIds = async (ids = [], scope = "public") => {
  if (!ids.length) return [];

  const placeholders = ids.map(() => "?").join(",");
  const publicSongCondition = buildSongPublicVisibilityCondition("s", {
    albumAlias: "al_song_visibility",
  });
  const publicAlbumCondition = buildAlbumReleasedCondition("al");
  const artistJoin =
    scope === "public"
      ? "LEFT JOIN artists ar ON ar.id = al.artist_id AND ar.is_deleted = 0"
      : "LEFT JOIN artists ar ON ar.id = al.artist_id";

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
      ar.name AS artist_name,
      ar.alias AS artist_alias,
      ar.realname AS artist_realname,
      COALESCE(album_like_counts.like_count, 0) AS like_count,
      COALESCE(song_stats.song_count, 0) AS song_count,
      COALESCE(song_stats.song_titles, '') AS song_titles,
      COALESCE(song_stats.genre_names, '') AS genre_names
    FROM albums al
    ${artistJoin}
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
      ${scope === "public" ? "LEFT JOIN albums al_song_visibility ON al_song_visibility.id = s.album_id" : ""}
      LEFT JOIN song_genres sg ON sg.song_id = s.id
      ${scope === "public"
        ? "LEFT JOIN genres g ON g.id = sg.genre_id AND g.is_deleted = 0"
        : "LEFT JOIN genres g ON g.id = sg.genre_id"}
      ${scope === "public" ? `WHERE ${publicSongCondition}` : ""}
      GROUP BY s.album_id
    ) song_stats ON song_stats.album_id = al.id
    WHERE al.id IN (${placeholders})
      ${scope === "public" ? `AND ${publicAlbumCondition}` : ""}
    `,
    ids
  );

  return rows;
};

const hydrateRankedRows = async (rankedRows = [], entityType, scope) => {
  const ids = rankedRows.map((row) => Number(row.entity_id)).filter(Boolean);
  if (!ids.length) return [];

  if (entityType === "song") {
    const rows = await getSongsByIds(ids, scope);
    return orderRowsByIds(rows, rankedRows);
  }

  if (entityType === "artist") {
    const rows = await getArtistsByIds(ids, scope);
    return orderRowsByIds(rows, rankedRows);
  }

  if (entityType === "album") {
    const rows = await getAlbumsByIds(ids, scope);
    return orderRowsByIds(rows, rankedRows);
  }

  return [];
};

export const searchEntitiesFromDocuments = async (
  keyword,
  { limit, offset, scope = "public" } = {}
) => {
  const normalizedKeyword = normalizeForSearchDocuments(keyword);
  if (!normalizedKeyword) {
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

  const [songSearch, artistSearch, albumSearch, userSearch] = await Promise.all([
    searchEntityDocuments({
      entityType: "song",
      scope,
      keyword,
      limit,
      offset,
    }),
    searchEntityDocuments({
      entityType: "artist",
      scope,
      keyword,
      limit,
      offset,
    }),
    searchEntityDocuments({
      entityType: "album",
      scope,
      keyword,
      limit,
      offset,
    }),
    scope === "admin"
      ? searchUsersForAdmin(keyword, { limit, offset })
      : Promise.resolve({ items: [], total: 0 }),
  ]);

  const [songs, artists, albums] = await Promise.all([
    hydrateRankedRows(songSearch.rows, "song", scope),
    hydrateRankedRows(artistSearch.rows, "artist", scope),
    hydrateRankedRows(albumSearch.rows, "album", scope),
  ]);

  return {
    items: {
      songs,
      artists,
      albums,
      ...(scope === "admin" ? { users: userSearch.items } : {}),
    },
    total:
      Number(songSearch.total || 0) +
      Number(artistSearch.total || 0) +
      Number(albumSearch.total || 0) +
      Number(userSearch.total || 0),
  };
};
