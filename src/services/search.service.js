import db from "../config/db.js";
import { buildPaginationMeta } from "../utils/pagination.js";
import { searchIndexedEntities } from "./search-index.service.js";

export const searchEntities = async (keyword, options = {}) => {
  const result = await searchIndexedEntities(keyword, {
    limit: options.limit,
    offset: options.offset,
    scope: "public",
    userId: options.userId,
  });

  return {
    items: result.items,
    meta: buildPaginationMeta(options.page, options.limit, result.total),
  };
};

export const searchAdminEntities = async (keyword, options = {}) => {
  const result = await searchIndexedEntities(keyword, {
    limit: options.limit,
    offset: options.offset,
    scope: "admin",
  });

  return {
    items: result.items,
    meta: buildPaginationMeta(options.page, options.limit, result.total),
  };
};

export const saveSearchHistory = async (keyword, userId) => {
  if (!keyword || !userId) return;

  const normalized = keyword.trim().toLowerCase();

  await db.query(
    `
    DELETE FROM search_history
    WHERE user_id = ?
      AND LOWER(keyword) = ?
    `,
    [userId, normalized]
  );

  await db.query(
    `
    INSERT INTO search_history (user_id, keyword)
    VALUES (?, ?)
    `,
    [userId, keyword.trim()]
  );

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

  const [[countRow]] = await db.query(
    `
    SELECT COUNT(DISTINCT LOWER(keyword)) AS total
    FROM search_history
    WHERE user_id = ?
    `,
    [userId]
  );

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
    meta: buildPaginationMeta(page, limit, countRow?.total || 0),
  };
};
