import db from "../config/db.js";
import { buildPaginationMeta } from "../utils/pagination.js";
import { normalizeKeyword } from "../utils/search-normalize.js";
import {
  isSearchDocumentsEnabled,
  searchEntitiesFromDocuments,
} from "./search-document.service.js";
import { searchIndexedEntities } from "./search-index.service.js";

const SEARCH_HISTORY_LIMIT = 20;

export const searchEntities = async (keyword, options = {}) => {
  let result;

  if (isSearchDocumentsEnabled()) {
    try {
      result = await searchEntitiesFromDocuments(keyword, {
        limit: options.limit,
        offset: options.offset,
        scope: "public",
      });
    } catch (error) {
      if (error?.code !== "ER_NO_SUCH_TABLE") {
        throw error;
      }
    }
  }

  if (!result || result.total === 0) {
    result = await searchIndexedEntities(keyword, {
      limit: options.limit,
      offset: options.offset,
      scope: "public",
      userId: options.userId,
    });
  }

  return {
    items: result.items,
    meta: buildPaginationMeta(options.page, options.limit, result.total),
  };
};

export const searchAdminEntities = async (keyword, options = {}) => {
  let result;

  if (isSearchDocumentsEnabled()) {
    try {
      result = await searchEntitiesFromDocuments(keyword, {
        limit: options.limit,
        offset: options.offset,
        scope: "admin",
      });
    } catch (error) {
      if (error?.code !== "ER_NO_SUCH_TABLE") {
        throw error;
      }
    }
  }

  if (!result || result.total === 0) {
    result = await searchIndexedEntities(keyword, {
      limit: options.limit,
      offset: options.offset,
      scope: "admin",
    });
  }

  return {
    items: result.items,
    meta: buildPaginationMeta(options.page, options.limit, result.total),
  };
};

export const saveSearchHistory = async (keyword, userId) => {
  if (!keyword || !userId) return;

  const displayKeyword = normalizeKeyword(keyword);
  const normalizedKeyword = displayKeyword.toLowerCase();

  if (!normalizedKeyword) {
    return;
  }

  await db.query(
    `
    INSERT INTO search_history (user_id, keyword, keyword_norm)
    VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE
      keyword = VALUES(keyword),
      searched_at = CURRENT_TIMESTAMP
    `,
    [userId, displayKeyword, normalizedKeyword]
  );

  await db.query(
    `
    DELETE sh
    FROM search_history sh
    LEFT JOIN (
      SELECT id
      FROM search_history
      WHERE user_id = ?
      ORDER BY searched_at DESC, id DESC
      LIMIT ?
    ) keep_rows ON keep_rows.id = sh.id
    WHERE sh.user_id = ?
      AND keep_rows.id IS NULL
    `,
    [userId, SEARCH_HISTORY_LIMIT, userId]
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
    SELECT COUNT(*) AS total
    FROM search_history
    WHERE user_id = ?
    `,
    [userId]
  );

  const [rows] = await db.query(
    `
    SELECT id, keyword, searched_at
    FROM search_history
    WHERE user_id = ?
    ORDER BY searched_at DESC, id DESC
    LIMIT ? OFFSET ?
    `,
    [userId, limit, offset]
  );

  return {
    items: rows,
    meta: buildPaginationMeta(page, limit, countRow?.total || 0),
  };
};
