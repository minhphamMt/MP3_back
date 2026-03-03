import db from "../config/db.js";
import { buildPaginationMeta } from "../utils/pagination.js";

const escapeRegex = (value = "") =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalizeKeyword = (keyword = "") => keyword.trim().replace(/\s+/g, " ");

const tokenizeKeyword = (keyword = "") =>
  [...new Set(normalizeKeyword(keyword).toLowerCase().split(" ").filter(Boolean))];

const buildTokenFilter = (fields, tokens) => {
  if (!tokens.length) {
    return { clause: "", params: [] };
  }

  const clause = tokens
    .map(
      () =>
        `(${fields.map((field) => `LOWER(${field}) LIKE ?`).join(" OR ")})`
    )
    .join(" AND ");

  const params = tokens.flatMap((token) =>
    fields.map(() => `%${token}%`)
  );

  return { clause, params };
};

const buildTokenScore = (weightedFields, tokens) => {
  if (!tokens.length) {
    return { clause: "0", params: [] };
  }

  const parts = [];
  const params = [];

  for (const token of tokens) {
    for (const { field, weight } of weightedFields) {
      parts.push(`(LOWER(${field}) LIKE ?) * ${weight}`);
      params.push(`%${token}%`);
    }
  }

  return {
    clause: parts.join(" + "),
    params,
  };
};

const highlightText = (text, keyword) => {
  if (!text) return text;

  const safeKeyword = escapeRegex(keyword);
  const regex = new RegExp(`(${safeKeyword})`, "gi");
  return text.replace(regex, "<em>$1</em>");
};
const mapHighlightedFields = (row, keyword) => {
  const highlight = {};

  if (row.display_name) {
    highlight.display_name = highlightText(row.display_name, keyword);
  }

  if (row.artist_name) {
    highlight.artist_name = highlightText(row.artist_name, keyword);
  }

  if (row.album_title) {
    highlight.album_title = highlightText(row.album_title, keyword);
  }

  return {
    ...row,
    highlight,
  };
};
const searchSongs = async (keyword, { limit, offset, userId }) => {
  const normalizedKeyword = normalizeKeyword(keyword);
  const keywordTokens = tokenizeKeyword(normalizedKeyword);
  const { clause: tokenFilterClause, params: tokenFilterParams } =
    buildTokenFilter(["s.title", "a.name", "al.title"], keywordTokens);
  const { clause: tokenScoreClause, params: tokenScoreParams } =
    buildTokenScore(
      [
        { field: "s.title", weight: 3 },
        { field: "a.name", weight: 2 },
        { field: "al.title", weight: 1 },
      ],
      keywordTokens
    );

  const params = [
    normalizedKeyword,
    `${normalizedKeyword}%`,
    `%${normalizedKeyword}%`,
    `${normalizedKeyword}%`,
    `%${normalizedKeyword}%`,
    ...tokenScoreParams,
    ...tokenFilterParams,
    limit,
    offset,
  ];

  const [rows] = await db.query(
    `
    SELECT
      s.*,
      a.name AS artist_name,
      al.title AS album_title,
      (
        (LOWER(s.title) = LOWER(?)) * 18 +
        (s.title LIKE ?) * 12 +
        (s.title LIKE ?) * 8 +
        (a.name LIKE ?) * 5 +
        (a.name LIKE ?) * 3 +
        ${tokenScoreClause} +
        (s.play_count * 0.001) +
        ((SELECT COUNT(*) FROM song_likes sl WHERE sl.song_id = s.id) * 0.01)
      ) AS score
    FROM songs s
    LEFT JOIN artists a ON a.id = s.artist_id AND a.is_deleted = 0
    LEFT JOIN albums al ON al.id = s.album_id AND al.is_deleted = 0
    WHERE s.status = 'approved'
    AND s.is_deleted = 0
    AND s.release_date IS NOT NULL
      AND s.release_date <= NOW()
      ${tokenFilterClause ? `AND ${tokenFilterClause}` : ""}
    ORDER BY score DESC
    LIMIT ? OFFSET ?
    `,
    params
  );

  return rows;
};
const searchSongsAdmin = async (keyword, { limit, offset, includeDeleted }) => {
  const normalizedKeyword = normalizeKeyword(keyword);
  const keywordTokens = tokenizeKeyword(normalizedKeyword);
  const { clause: tokenFilterClause, params: tokenFilterParams } =
    buildTokenFilter(["s.title", "a.name", "al.title"], keywordTokens);
  const { clause: tokenScoreClause, params: tokenScoreParams } =
    buildTokenScore(
      [
        { field: "s.title", weight: 3 },
        { field: "a.name", weight: 2 },
        { field: "al.title", weight: 1 },
      ],
      keywordTokens
    );

  const params = [
    normalizedKeyword,
    `${normalizedKeyword}%`,
    `%${normalizedKeyword}%`,
    `${normalizedKeyword}%`,
    `%${normalizedKeyword}%`,
    ...tokenScoreParams,
    ...tokenFilterParams,
    limit,
    offset,
  ];
  const deletedFilter = includeDeleted ? "" : "AND s.is_deleted = 0";
  const [rows] = await db.query(
    `
    SELECT
      s.*,
      a.name AS artist_name,
      al.title AS album_title,
      (
        (LOWER(s.title) = LOWER(?)) * 18 +
        (s.title LIKE ?) * 12 +
        (s.title LIKE ?) * 8 +
        (a.name LIKE ?) * 5 +
        (a.name LIKE ?) * 3 +
        ${tokenScoreClause} +
        (s.play_count * 0.001) +
        ((SELECT COUNT(*) FROM song_likes sl WHERE sl.song_id = s.id) * 0.01)
      ) AS score
    FROM songs s
    LEFT JOIN artists a ON a.id = s.artist_id
    LEFT JOIN albums al ON al.id = s.album_id
    WHERE 1=1
      ${tokenFilterClause ? `AND ${tokenFilterClause}` : ""}
     ${deletedFilter}
    ORDER BY score DESC
    LIMIT ? OFFSET ?
    `,
    params
  );

  return rows;
};
const searchArtists = async (keyword, { limit, offset, includeDeleted }) => {
  const normalizedKeyword = normalizeKeyword(keyword);
  const keywordTokens = tokenizeKeyword(normalizedKeyword);
  const songVisibilityFilter = includeDeleted
    ? ""
    : "AND s.is_deleted = 0 AND s.status = 'approved' AND s.release_date IS NOT NULL AND s.release_date <= NOW()";
  const albumVisibilityFilter = includeDeleted
    ? ""
    : `AND al.is_deleted = 0 AND (
        (al.release_date IS NOT NULL AND al.release_date <= NOW())
        OR EXISTS (
          SELECT 1 FROM songs s2
          WHERE s2.album_id = al.id
            AND s2.status = 'approved'
            AND s2.is_deleted = 0
            AND s2.release_date IS NOT NULL
            AND s2.release_date <= NOW()
        )
      )`;

  const tokenFilterClause = keywordTokens.length
    ? keywordTokens
        .map(
          () => `(
            LOWER(a.name) LIKE ? OR LOWER(a.alias) LIKE ? OR LOWER(a.realname) LIKE ?
            OR EXISTS (
              SELECT 1 FROM songs s
              WHERE s.artist_id = a.id
              ${songVisibilityFilter}
              AND LOWER(s.title) LIKE ?
            )
            OR EXISTS (
              SELECT 1 FROM albums al
              WHERE al.artist_id = a.id
              ${albumVisibilityFilter}
              AND LOWER(al.title) LIKE ?
            )
            OR EXISTS (
              SELECT 1 FROM songs s
              JOIN albums al ON al.id = s.album_id
              WHERE s.artist_id = a.id
              ${songVisibilityFilter}
              ${albumVisibilityFilter}
              AND LOWER(al.title) LIKE ?
            )
          )`
        )
        .join(" AND ")
    : "";
  const tokenFilterParams = keywordTokens.flatMap((token) => [
    `%${token}%`,
    `%${token}%`,
    `%${token}%`,
    `%${token}%`,
    `%${token}%`,
    `%${token}%`,
  ]);

  const { clause: tokenScoreClause, params: tokenScoreParams } =
    buildTokenScore(
      [
        { field: "a.name", weight: 3 },
        { field: "a.alias", weight: 2 },
        { field: "a.realname", weight: 1 },
      ],
      keywordTokens
    );

  const tokenSongScoreClause = keywordTokens.length
    ? keywordTokens
        .map(
          () => `(EXISTS (
            SELECT 1 FROM songs s
            WHERE s.artist_id = a.id
            ${songVisibilityFilter}
            AND LOWER(s.title) LIKE ?
          )) * 2`
        )
        .join(" + ")
    : "0";
  const tokenAlbumScoreClause = keywordTokens.length
    ? keywordTokens
        .map(
          () => `(EXISTS (
            SELECT 1 FROM albums al
            WHERE al.artist_id = a.id
            ${albumVisibilityFilter}
            AND LOWER(al.title) LIKE ?
          )) * 2`
        )
        .join(" + ")
    : "0";
  const tokenAlbumSongScoreClause = keywordTokens.length
    ? keywordTokens
        .map(
          () => `(EXISTS (
            SELECT 1 FROM songs s
            JOIN albums al ON al.id = s.album_id
            WHERE s.artist_id = a.id
            ${songVisibilityFilter}
            ${albumVisibilityFilter}
            AND LOWER(al.title) LIKE ?
          )) * 2`
        )
        .join(" + ")
    : "0";
  const tokenSongScoreParams = keywordTokens.map((token) => `%${token}%`);
  const tokenAlbumScoreParams = keywordTokens.map((token) => `%${token}%`);
  const tokenAlbumSongScoreParams = keywordTokens.map((token) => `%${token}%`);

  const deletedFilter = includeDeleted ? "" : "AND a.is_deleted = 0";
  const songDeletedFilter = includeDeleted ? "" : "AND s.is_deleted = 0";

  const [rows] = await db.query(
    `
    SELECT
      a.id,
      ANY_VALUE(a.user_id) AS user_id,
      ANY_VALUE(a.name) AS name,
      ANY_VALUE(a.alias) AS alias,
      ANY_VALUE(a.bio) AS bio,
      ANY_VALUE(a.short_bio) AS short_bio,
      ANY_VALUE(a.avatar_url) AS avatar_url,
      ANY_VALUE(a.cover_url) AS cover_url,
      ANY_VALUE(a.birthday) AS birthday,
      ANY_VALUE(a.realname) AS realname,
      ANY_VALUE(a.national) AS national,
      ANY_VALUE(a.follow_count) AS follow_count,
      ANY_VALUE(a.zing_artist_id) AS zing_artist_id,
      ANY_VALUE(a.is_deleted) AS is_deleted,
      ANY_VALUE(a.deleted_at) AS deleted_at,
      ANY_VALUE(a.deleted_by) AS deleted_by,
      ANY_VALUE(a.deleted_by_role) AS deleted_by_role,
      ANY_VALUE(a.created_at) AS created_at,
      NULL AS updated_at,
      COUNT(s.id) AS song_count,
      (LOWER(ANY_VALUE(a.name)) = LOWER(?)) * 15 +
      (ANY_VALUE(a.name) LIKE ?) * 8 +
      (ANY_VALUE(a.alias) LIKE ?) * 6 +
      (ANY_VALUE(a.realname) LIKE ?) * 4 +
      (EXISTS (
        SELECT 1 FROM songs s
        WHERE s.artist_id = a.id
        ${songVisibilityFilter}
        AND s.title LIKE ?
      )) * 5 +
      (EXISTS (
        SELECT 1 FROM albums al
        WHERE al.artist_id = a.id
        ${albumVisibilityFilter}
        AND al.title LIKE ?
      )) * 4 +
      (EXISTS (
        SELECT 1 FROM songs s
        JOIN albums al ON al.id = s.album_id
        WHERE s.artist_id = a.id
        ${songVisibilityFilter}
        ${albumVisibilityFilter}
        AND al.title LIKE ?
      )) * 4 +
      ${tokenScoreClause} +
      ${tokenSongScoreClause} +
      ${tokenAlbumScoreClause} +
      ${tokenAlbumSongScoreClause} +
      (ANY_VALUE(a.follow_count) * 0.01) AS score
    FROM artists a
    LEFT JOIN songs s
      ON s.artist_id = a.id
      ${songDeletedFilter}
    WHERE 1=1
    ${tokenFilterClause ? `AND ${tokenFilterClause}` : ""}
    ${deletedFilter}
    GROUP BY a.id
    ORDER BY score DESC
    LIMIT ? OFFSET ?
    `,
    [
      normalizedKeyword,
      `${normalizedKeyword}%`,
      `${normalizedKeyword}%`,
      `${normalizedKeyword}%`,
      `%${normalizedKeyword}%`,
      `%${normalizedKeyword}%`,
      `%${normalizedKeyword}%`,
      ...tokenScoreParams,
      ...tokenSongScoreParams,
      ...tokenAlbumScoreParams,
      ...tokenAlbumSongScoreParams,
      ...tokenFilterParams,
      limit,
      offset,
    ]
  );

  return rows;
};

const searchUsers = async (keyword, { limit, offset }) => {
  const [rows] = await db.query(
    `
    SELECT
      u.id,
      u.display_name,
      u.email,
      u.role,
      u.is_active,
      (
        (u.display_name LIKE ?) * 5 +
        (u.display_name LIKE ?) * 3 +
        (u.email LIKE ?) * 2 +
        (u.email LIKE ?) * 1
      ) AS score
    FROM users u
    WHERE u.display_name LIKE ? OR u.email LIKE ?
    ORDER BY score DESC
    LIMIT ? OFFSET ?
    `,
    [
      `${keyword}%`,
      `%${keyword}%`,
      `${keyword}%`,
      `%${keyword}%`,
      `%${keyword}%`,
      `%${keyword}%`,
      limit,
      offset,
    ]
  );

  return rows;
};

const searchAlbums = async (
  keyword,
  { limit, offset, includeDeleted, includeUnreleased }
) => {
  const normalizedKeyword = normalizeKeyword(keyword);
  const keywordTokens = tokenizeKeyword(normalizedKeyword);
  const songVisibilityFilter = includeDeleted
    ? ""
    : "AND s.is_deleted = 0 AND s.status = 'approved' AND s.release_date IS NOT NULL AND s.release_date <= NOW()";
  const tokenFilterClause = keywordTokens.length
    ? keywordTokens
        .map(
          () => `(
            LOWER(al.title) LIKE ? OR LOWER(ar.name) LIKE ?
            OR EXISTS (
              SELECT 1 FROM songs s
              WHERE s.album_id = al.id
              ${songVisibilityFilter}
              AND LOWER(s.title) LIKE ?
            )
          )`
        )
        .join(" AND ")
    : "";
  const tokenFilterParams = keywordTokens.flatMap((token) => [
    `%${token}%`,
    `%${token}%`,
    `%${token}%`,
  ]);
  const { clause: tokenScoreClause, params: tokenScoreParams } =
    buildTokenScore(
      [
        { field: "al.title", weight: 3 },
        { field: "ar.name", weight: 2 },
      ],
      keywordTokens
    );
  const tokenSongScoreClause = keywordTokens.length
    ? keywordTokens
        .map(
          () => `(EXISTS (
            SELECT 1 FROM songs s
            WHERE s.album_id = al.id
            ${songVisibilityFilter}
            AND LOWER(s.title) LIKE ?
          )) * 1`
        )
        .join(" + ")
    : "0";
  const tokenSongScoreParams = keywordTokens.map((token) => `%${token}%`);

  const deletedFilter = includeDeleted ? "" : "AND al.is_deleted = 0";
  const releaseFilter = includeUnreleased
    ? ""
    : `AND (
        (al.release_date IS NOT NULL AND al.release_date <= NOW())
        OR EXISTS (
          SELECT 1
          FROM songs s
          WHERE s.album_id = al.id
            AND s.status = 'approved'
            AND s.is_deleted = 0
            AND s.release_date IS NOT NULL
            AND s.release_date <= NOW()
        )
      )`;
  const [rows] = await db.query(
    `
    SELECT
      al.*,
      ar.name AS artist_name,
      (LOWER(al.title) = LOWER(?)) * 16 +
      (al.title LIKE ?) * 10 +
      (ar.name LIKE ?) * 4 +
      (EXISTS (
        SELECT 1 FROM songs s
        WHERE s.album_id = al.id
        ${songVisibilityFilter}
        AND s.title LIKE ?
      )) * 6 +
      ${tokenScoreClause} +
      ${tokenSongScoreClause} AS score
    FROM albums al
    LEFT JOIN artists ar ON ar.id = al.artist_id AND ar.is_deleted = 0
    WHERE 1=1
    ${tokenFilterClause ? `AND ${tokenFilterClause}` : ""}
    ${deletedFilter}
    ${releaseFilter}
    ORDER BY score DESC
    LIMIT ? OFFSET ?
    `,
    [
      normalizedKeyword,
      `${normalizedKeyword}%`,
      `${normalizedKeyword}%`,
      `%${normalizedKeyword}%`,
      ...tokenScoreParams,
      ...tokenSongScoreParams,
      ...tokenFilterParams,
      limit,
      offset,
    ]
  );

  return rows;
};


export const searchEntities = async (keyword, options) => {
  const [songs, artists, albums] = await Promise.all([
    searchSongs(keyword, options),
    searchArtists(keyword, options),
    searchAlbums(keyword, options),
  ]);

  return {
    items: {
      songs,
      artists,
      albums,
    },
    meta: buildPaginationMeta(options.page, options.limit),
  };
};

export const searchAdminEntities = async (keyword, options) => {
  const [songs, artists, albums, users] = await Promise.all([
    searchSongsAdmin(keyword, { ...options, includeDeleted: true }),
    searchArtists(keyword, { ...options, includeDeleted: true }),
    searchAlbums(keyword, {
      ...options,
      includeDeleted: true,
      includeUnreleased: true,
    }),
    searchUsers(keyword, options),
  ]);

  return {
    items: {
      songs,
      artists,
      albums,
      users,
    },
    meta: buildPaginationMeta(options.page, options.limit),
  };
};

export const saveSearchHistory = async (keyword, userId) => {
  if (!keyword || !userId) return;

  const normalized = keyword.trim().toLowerCase();

  // 1️⃣ Xoá keyword trùng (không phân biệt hoa thường)
  await db.query(
    `
    DELETE FROM search_history
    WHERE user_id = ?
      AND LOWER(keyword) = ?
    `,
    [userId, normalized]
  );

  // 2️⃣ Insert lại keyword (searched_at mới nhất)
  await db.query(
    `
    INSERT INTO search_history (user_id, keyword)
    VALUES (?, ?)
    `,
    [userId, keyword.trim()]
  );

  // 3️⃣ Giữ tối đa 20 lịch sử gần nhất
  await db.query(
    `
    DELETE FROM search_history
    WHERE user_id = ?
      AND id NOT IN (
        SELECT id FROM (
          SELECT id
          FROM search_history
          WHERE user_id = ?
          ORDER BY searched_at DESC
          LIMIT 20
        ) t
      )
    `,
    [userId, userId]
  );
};



export const listSearchHistory = async (userId, { page, limit, offset }) => {
  if (!userId) {
    return {
      items: [],
      meta: buildPaginationMeta(page, limit, 0),
    };
  }

  const [rows] = await db.query(
    `
    SELECT sh.id, sh.keyword, sh.searched_at
    FROM search_history sh
    INNER JOIN (
      SELECT
        LOWER(keyword) AS keyword_norm,
        MAX(id) AS max_id
      FROM search_history
      WHERE user_id = ?
      GROUP BY LOWER(keyword)
    ) latest
      ON LOWER(sh.keyword) = latest.keyword_norm
     AND sh.id = latest.max_id
    ORDER BY sh.searched_at DESC
    LIMIT ? OFFSET ?
    `,
    [userId, limit, offset]
  );

  return {
    items: rows,
    meta: buildPaginationMeta(page, limit, rows.length),
  };
};


export default {
  searchEntities,
  searchAdminEntities,
  saveSearchHistory,
  listSearchHistory,
};
