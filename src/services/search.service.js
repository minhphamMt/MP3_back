import db from "../config/db.js";
import { buildPaginationMeta } from "../utils/pagination.js";

const escapeRegex = (value = "") =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const highlightText = (text, keyword) => {
  if (!text) return text;

  const safeKeyword = escapeRegex(keyword);
  const regex = new RegExp(`(${safeKeyword})`, "gi");
  return text.replace(regex, "<em>$1</em>");
};

const mapHighlightedFields = (row, keyword) => ({
  ...row,
  highlight: {
    display_name: highlightText(row.display_name, keyword),
    alias: highlightText(row.alias, keyword),
    zing_id: highlightText(row.zing_id, keyword),
    artist_name: highlightText(row.artist_name, keyword),
    album_title: highlightText(row.album_title, keyword),
  },
});

export const searchEntities = async (keyword, { page, limit, offset }) => {
  const trimmedKeyword = keyword.trim();
  const wildcard = `%${trimmedKeyword}%`;

  const [countRows] = await db.query(
    `
    SELECT COUNT(*) AS total FROM (
      SELECT s.id
      FROM songs s
      WHERE s.title LIKE ? OR s.alias LIKE ? OR s.zing_id LIKE ?
      UNION ALL
      SELECT ar.id
      FROM artists ar
      WHERE ar.name LIKE ? OR ar.alias LIKE ? OR ar.zing_id LIKE ?
      UNION ALL
      SELECT al.id
      FROM albums al
      WHERE al.title LIKE ? OR al.alias LIKE ? OR al.zing_id LIKE ?
    ) AS combined;
  `,
    [
      wildcard,
      wildcard,
      wildcard,
      wildcard,
      wildcard,
      wildcard,
      wildcard,
      wildcard,
      wildcard,
    ]
  );

  const total = countRows[0]?.total || 0;

  if (!total) {
    return {
      items: [],
      meta: buildPaginationMeta(page, limit, total),
    };
  }

  const [rows] = await db.query(
    `
    SELECT *
    FROM (
      SELECT
        s.id,
        'song' AS type,
        s.title AS display_name,
        s.alias,
        s.zing_id,
        ar.name AS artist_name,
        al.title AS album_title,
        CASE
          WHEN s.alias = ? THEN 3
          WHEN s.zing_id = ? THEN 2
          WHEN s.title LIKE ? THEN 1
          ELSE 0
        END AS relevance
      FROM songs s
      LEFT JOIN artists ar ON ar.id = s.artist_id
      LEFT JOIN albums al ON al.id = s.album_id
      WHERE s.title LIKE ? OR s.alias LIKE ? OR s.zing_id LIKE ?

      UNION ALL

      SELECT
        ar.id,
        'artist' AS type,
        ar.name AS display_name,
        ar.alias,
        ar.zing_id,
        NULL AS artist_name,
        NULL AS album_title,
        CASE
          WHEN ar.alias = ? THEN 3
          WHEN ar.zing_id = ? THEN 2
          WHEN ar.name LIKE ? THEN 1
          ELSE 0
        END AS relevance
      FROM artists ar
      WHERE ar.name LIKE ? OR ar.alias LIKE ? OR ar.zing_id LIKE ?

      UNION ALL

      SELECT
        al.id,
        'album' AS type,
        al.title AS display_name,
        al.alias,
        al.zing_id,
        NULL AS artist_name,
        NULL AS album_title,
        CASE
          WHEN al.alias = ? THEN 3
          WHEN al.zing_id = ? THEN 2
          WHEN al.title LIKE ? THEN 1
          ELSE 0
        END AS relevance
      FROM albums al
      WHERE al.title LIKE ? OR al.alias LIKE ? OR al.zing_id LIKE ?
    ) AS results
    ORDER BY relevance DESC, display_name ASC
    LIMIT ? OFFSET ?;
  `,
    [
      trimmedKeyword,
      trimmedKeyword,
      wildcard,
      wildcard,
      wildcard,
      wildcard,
      trimmedKeyword,
      trimmedKeyword,
      wildcard,
      wildcard,
      wildcard,
      trimmedKeyword,
      trimmedKeyword,
      wildcard,
      wildcard,
      wildcard,
      limit,
      offset,
    ]
  );

  return {
    items: rows.map((row) => mapHighlightedFields(row, trimmedKeyword)),
    meta: buildPaginationMeta(page, limit, total),
  };
};

export const saveSearchHistory = async (keyword, userId = null) => {
  await db.query(
    `
    INSERT INTO search_history (keyword, user_id)
    VALUES (?, ?)
  `,
    [keyword, userId]
  );
};

export const listSearchHistory = async (userId, { page, limit, offset }) => {
  if (!userId) {
    return {
      items: [],
      meta: buildPaginationMeta(page, limit, 0),
    };
  }

  const [countRows] = await db.query(
    `SELECT COUNT(*) AS total FROM search_history WHERE user_id = ?`,
    [userId]
  );

  const total = countRows[0]?.total || 0;

  const [rows] = await db.query(
    `
    SELECT *
    FROM search_history
    WHERE user_id = ?
    ORDER BY id DESC
    LIMIT ? OFFSET ?;
  `,
    [userId, limit, offset]
  );

  return {
    items: rows,
    meta: buildPaginationMeta(page, limit, total),
  };
};

export default {
  searchEntities,
  saveSearchHistory,
  listSearchHistory,
};
