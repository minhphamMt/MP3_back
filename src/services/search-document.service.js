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

const uniqueIntegerIds = (values = []) =>
  [...new Set(values.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0))];

const logarithmicScore = (value, weight) =>
  Math.log1p(Math.max(Number(value) || 0, 0)) * weight;

const getFreshnessScore = (dateValue) => {
  if (!dateValue) return 0;

  const timestamp = new Date(dateValue).getTime();
  if (!Number.isFinite(timestamp)) return 0;

  const ageInDays = Math.max(0, (Date.now() - timestamp) / (24 * 60 * 60 * 1000));

  if (ageInDays <= 30) return 2.5;
  if (ageInDays <= 180) return 1.5;
  if (ageInDays <= 365) return 0.75;

  return 0;
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

const normalizeDocumentValue = (value = "") => normalizeForSearchDocuments(value);

const compactDocumentValue = (value = "") => compactSearchValue(value).slice(0, 512);

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

const upsertSearchDocuments = async (documents = []) => {
  for (const document of documents) {
    await db.query(
      `
      INSERT INTO search_documents (
        entity_type,
        entity_id,
        scope,
        title,
        subtitle,
        primary_text,
        primary_text_norm,
        primary_text_compact,
        priority_text,
        priority_text_norm,
        match_text,
        match_text_norm,
        search_text,
        search_text_norm,
        popularity_score,
        freshness_score,
        is_active,
        source_updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        subtitle = VALUES(subtitle),
        primary_text = VALUES(primary_text),
        primary_text_norm = VALUES(primary_text_norm),
        primary_text_compact = VALUES(primary_text_compact),
        priority_text = VALUES(priority_text),
        priority_text_norm = VALUES(priority_text_norm),
        match_text = VALUES(match_text),
        match_text_norm = VALUES(match_text_norm),
        search_text = VALUES(search_text),
        search_text_norm = VALUES(search_text_norm),
        popularity_score = VALUES(popularity_score),
        freshness_score = VALUES(freshness_score),
        is_active = VALUES(is_active),
        source_updated_at = VALUES(source_updated_at),
        updated_at = CURRENT_TIMESTAMP
      `,
      [
        document.entity_type,
        document.entity_id,
        document.scope,
        document.title,
        document.subtitle,
        document.primary_text,
        document.primary_text_norm,
        document.primary_text_compact,
        document.priority_text,
        document.priority_text_norm,
        document.match_text,
        document.match_text_norm,
        document.search_text,
        document.search_text_norm,
        document.popularity_score,
        document.freshness_score,
        document.is_active,
        document.source_updated_at,
      ]
    );
  }
};

const deleteSearchDocuments = async (entityType, entityIds = [], scope = null) => {
  const normalizedIds = uniqueIntegerIds(entityIds);
  if (!normalizedIds.length) return;

  const placeholders = normalizedIds.map(() => "?").join(",");
  const scopeClause = scope ? "AND scope = ?" : "";
  await db.query(
    `
    DELETE FROM search_documents
    WHERE entity_type = ?
      ${scopeClause}
      AND entity_id IN (${placeholders})
    `,
    [entityType, ...(scope ? [scope] : []), ...normalizedIds]
  );
};

const createSearchDocumentRecord = ({
  entityType,
  entityId,
  scope,
  title,
  subtitle,
  primaryText,
  priorityText,
  matchText,
  searchText,
  popularityScore,
  freshnessScore,
  sourceUpdatedAt,
}) => ({
  entity_type: entityType,
  entity_id: entityId,
  scope,
  title: title || null,
  subtitle: subtitle || null,
  primary_text: primaryText || null,
  primary_text_norm: normalizeDocumentValue(primaryText).slice(0, 512),
  primary_text_compact: compactDocumentValue(primaryText),
  priority_text: priorityText || null,
  priority_text_norm: normalizeDocumentValue(priorityText) || null,
  match_text: matchText || null,
  match_text_norm: normalizeDocumentValue(matchText) || null,
  search_text: searchText || "",
  search_text_norm: normalizeDocumentValue(searchText),
  popularity_score: Number(popularityScore || 0),
  freshness_score: Number(freshnessScore || 0),
  is_active: 1,
  source_updated_at: sourceUpdatedAt || null,
});

const buildSongSearchDocuments = (songs = [], scope = "public") =>
  songs.map((song) => {
    const subtitle = song.artist_names || song.artist_name || "";
    const priorityText = normalizeKeyword(
      [song.artist_names, song.artist_name, song.artist_aliases, song.artist_alias, song.artist_realnames, song.artist_realname]
        .filter(Boolean)
        .join(" ")
    );
    const matchText = normalizeKeyword([song.album_title, song.genre_names].filter(Boolean).join(" "));
    const searchText = normalizeKeyword(
      [song.title, priorityText, matchText].filter(Boolean).join(" ")
    );

    return createSearchDocumentRecord({
      entityType: "song",
      entityId: song.id,
      scope,
      title: song.title,
      subtitle,
      primaryText: song.title,
      priorityText,
      matchText,
      searchText,
      popularityScore: buildSongPopularityScore(song),
      freshnessScore: getFreshnessScore(song.release_date),
      sourceUpdatedAt: song.deleted_at || song.created_at,
    });
  });

const buildArtistSearchDocuments = (artists = [], scope = "public") =>
  artists.map((artist) => {
    const subtitle = normalizeKeyword([artist.alias, artist.realname].filter(Boolean).join(" "));
    const priorityText = subtitle;
    const matchText = normalizeKeyword(
      [artist.song_titles, artist.album_titles, artist.genre_names, artist.national]
        .filter(Boolean)
        .join(" ")
    );
    const searchText = normalizeKeyword(
      [artist.name, artist.alias, artist.realname, artist.song_titles, artist.album_titles, artist.genre_names, artist.national]
        .filter(Boolean)
        .join(" ")
    );

    return createSearchDocumentRecord({
      entityType: "artist",
      entityId: artist.id,
      scope,
      title: artist.name,
      subtitle,
      primaryText: artist.name,
      priorityText,
      matchText,
      searchText,
      popularityScore: buildArtistPopularityScore(artist),
      freshnessScore: 0,
      sourceUpdatedAt: artist.deleted_at || artist.created_at,
    });
  });

const buildAlbumSearchDocuments = (albums = [], scope = "public") =>
  albums.map((album) => {
    const subtitle = album.artist_name || "";
    const priorityText = normalizeKeyword(
      [album.artist_name, album.artist_alias, album.artist_realname].filter(Boolean).join(" ")
    );
    const matchText = normalizeKeyword([album.song_titles, album.genre_names].filter(Boolean).join(" "));
    const searchText = normalizeKeyword(
      [album.title, priorityText, matchText].filter(Boolean).join(" ")
    );

    return createSearchDocumentRecord({
      entityType: "album",
      entityId: album.id,
      scope,
      title: album.title,
      subtitle,
      primaryText: album.title,
      priorityText,
      matchText,
      searchText,
      popularityScore: buildAlbumPopularityScore(album),
      freshnessScore: getFreshnessScore(album.release_date),
      sourceUpdatedAt: album.deleted_at || album.created_at,
    });
  });

const syncEntityDocuments = async ({
  entityType,
  entityIds,
  fetchPublicRows,
  fetchAdminRows,
  buildPublicDocuments,
  buildAdminDocuments,
}) => {
  const normalizedIds = uniqueIntegerIds(entityIds);
  if (!normalizedIds.length) return;

  const [publicRows, adminRows] = await Promise.all([
    fetchPublicRows(normalizedIds),
    fetchAdminRows(normalizedIds),
  ]);

  const publicIds = new Set(publicRows.map((row) => Number(row.id)));
  const adminIds = new Set(adminRows.map((row) => Number(row.id)));

  await upsertSearchDocuments(buildPublicDocuments(publicRows));
  await upsertSearchDocuments(buildAdminDocuments(adminRows));

  const missingPublicIds = normalizedIds.filter((id) => !publicIds.has(id));
  const missingAdminIds = normalizedIds.filter((id) => !adminIds.has(id));

  await deleteSearchDocuments(entityType, missingPublicIds, "public");
  await deleteSearchDocuments(entityType, missingAdminIds, "admin");
};

const syncSongDocuments = async (songIds = []) =>
  syncEntityDocuments({
    entityType: "song",
    entityIds: songIds,
    fetchPublicRows: (ids) => getSongsByIds(ids, "public"),
    fetchAdminRows: (ids) => getSongsByIds(ids, "admin"),
    buildPublicDocuments: (rows) => buildSongSearchDocuments(rows, "public"),
    buildAdminDocuments: (rows) => buildSongSearchDocuments(rows, "admin"),
  });

const syncArtistDocuments = async (artistIds = []) =>
  syncEntityDocuments({
    entityType: "artist",
    entityIds: artistIds,
    fetchPublicRows: (ids) => getArtistsByIds(ids, "public"),
    fetchAdminRows: (ids) => getArtistsByIds(ids, "admin"),
    buildPublicDocuments: (rows) => buildArtistSearchDocuments(rows, "public"),
    buildAdminDocuments: (rows) => buildArtistSearchDocuments(rows, "admin"),
  });

const syncAlbumDocuments = async (albumIds = []) =>
  syncEntityDocuments({
    entityType: "album",
    entityIds: albumIds,
    fetchPublicRows: (ids) => getAlbumsByIds(ids, "public"),
    fetchAdminRows: (ids) => getAlbumsByIds(ids, "admin"),
    buildPublicDocuments: (rows) => buildAlbumSearchDocuments(rows, "public"),
    buildAdminDocuments: (rows) => buildAlbumSearchDocuments(rows, "admin"),
  });

const getRelatedArtistsAndAlbumsForSongs = async (songIds = []) => {
  const normalizedSongIds = uniqueIntegerIds(songIds);
  if (!normalizedSongIds.length) {
    return { artistIds: [], albumIds: [] };
  }

  const placeholders = normalizedSongIds.map(() => "?").join(",");
  const [songRows] = await db.query(
    `
    SELECT artist_id, album_id
    FROM songs
    WHERE id IN (${placeholders})
    `,
    normalizedSongIds
  );
  const [songArtistRows] = await db.query(
    `
    SELECT DISTINCT artist_id
    FROM song_artists
    WHERE song_id IN (${placeholders})
    `,
    normalizedSongIds
  );

  return {
    artistIds: uniqueIntegerIds([
      ...songRows.map((row) => row.artist_id),
      ...songArtistRows.map((row) => row.artist_id),
    ]),
    albumIds: uniqueIntegerIds(songRows.map((row) => row.album_id)),
  };
};

export const getSongSearchSyncGraph = async (songId) => {
  const normalizedSongIds = uniqueIntegerIds([songId]);
  if (!normalizedSongIds.length) {
    return { songIds: [], artistIds: [], albumIds: [] };
  }

  const related = await getRelatedArtistsAndAlbumsForSongs(normalizedSongIds);
  return {
    songIds: normalizedSongIds,
    artistIds: related.artistIds,
    albumIds: related.albumIds,
  };
};

export const getArtistSearchSyncGraph = async (artistId) => {
  const normalizedArtistIds = uniqueIntegerIds([artistId]);
  if (!normalizedArtistIds.length) {
    return { songIds: [], artistIds: [], albumIds: [] };
  }

  const [songRows] = await db.query(
    `
    SELECT DISTINCT s.id
    FROM songs s
    WHERE s.artist_id = ?
    UNION
    SELECT DISTINCT s.id
    FROM songs s
    JOIN song_artists sa ON sa.song_id = s.id
    WHERE sa.artist_id = ?
    `,
    [normalizedArtistIds[0], normalizedArtistIds[0]]
  );
  const [albumRows] = await db.query(
    `
    SELECT id
    FROM albums
    WHERE artist_id = ?
    `,
    [normalizedArtistIds[0]]
  );

  return {
    songIds: uniqueIntegerIds(songRows.map((row) => row.id)),
    artistIds: normalizedArtistIds,
    albumIds: uniqueIntegerIds(albumRows.map((row) => row.id)),
  };
};

export const getAlbumSearchSyncGraph = async (albumId) => {
  const normalizedAlbumIds = uniqueIntegerIds([albumId]);
  if (!normalizedAlbumIds.length) {
    return { songIds: [], artistIds: [], albumIds: [] };
  }

  const [albumRows] = await db.query(
    `
    SELECT artist_id
    FROM albums
    WHERE id = ?
    `,
    [normalizedAlbumIds[0]]
  );
  const [songRows] = await db.query(
    `
    SELECT id
    FROM songs
    WHERE album_id = ?
    `,
    [normalizedAlbumIds[0]]
  );

  return {
    songIds: uniqueIntegerIds(songRows.map((row) => row.id)),
    artistIds: uniqueIntegerIds(albumRows.map((row) => row.artist_id)),
    albumIds: normalizedAlbumIds,
  };
};

export const getGenreSearchSyncGraph = async (genreId) => {
  const normalizedGenreIds = uniqueIntegerIds([genreId]);
  if (!normalizedGenreIds.length) {
    return { songIds: [], artistIds: [], albumIds: [] };
  }

  const [songRows] = await db.query(
    `
    SELECT DISTINCT song_id
    FROM song_genres
    WHERE genre_id = ?
    `,
    [normalizedGenreIds[0]]
  );
  const songIds = uniqueIntegerIds(songRows.map((row) => row.song_id));
  const related = await getRelatedArtistsAndAlbumsForSongs(songIds);

  return {
    songIds,
    artistIds: related.artistIds,
    albumIds: related.albumIds,
  };
};

export const mergeSearchSyncGraphs = (...graphs) => ({
  songIds: uniqueIntegerIds(graphs.flatMap((graph) => graph?.songIds || [])),
  artistIds: uniqueIntegerIds(graphs.flatMap((graph) => graph?.artistIds || [])),
  albumIds: uniqueIntegerIds(graphs.flatMap((graph) => graph?.albumIds || [])),
});

export const syncSearchDocumentsForGraph = async (graph = {}) => {
  if (!isSearchDocumentsEnabled()) {
    return;
  }

  try {
    await Promise.all([
      syncSongDocuments(graph.songIds),
      syncArtistDocuments(graph.artistIds),
      syncAlbumDocuments(graph.albumIds),
    ]);
  } catch (error) {
    if (error?.code === "ER_NO_SUCH_TABLE") {
      return;
    }

    throw error;
  }
};
