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
  const params = [
    `${keyword}%`,
    `%${keyword}%`,
    `%${keyword}%`,
    limit,
    offset,
  ];

  const [rows] = await db.query(
    `
    SELECT
      s.*,
      (
        (s.title LIKE ?) * 5 +
        (s.title LIKE ?) * 3 +
        (s.play_count * 0.001) +
        ((SELECT COUNT(*) FROM song_likes sl WHERE sl.song_id = s.id) * 0.01)
      ) AS score
    FROM songs s
    WHERE s.status = 'approved'
    AND s.release_date IS NOT NULL
      AND s.release_date <= NOW()
      AND s.title LIKE ?
    ORDER BY score DESC
    LIMIT ? OFFSET ?
    `,
    params
  );

  return rows;
};
const searchSongsAdmin = async (keyword, { limit, offset }) => {
  const params = [
    `${keyword}%`,
    `%${keyword}%`,
    `%${keyword}%`,
    limit,
    offset,
  ];
  const [rows] = await db.query(
    `
    SELECT
      s.*,
      (
        (s.title LIKE ?) * 5 +
        (s.title LIKE ?) * 3 +
        (s.play_count * 0.001) +
        ((SELECT COUNT(*) FROM song_likes sl WHERE sl.song_id = s.id) * 0.01)
      ) AS score
    FROM songs s
    WHERE s.title LIKE ?
    ORDER BY score DESC
    LIMIT ? OFFSET ?
    `,
    params
  );

  return rows;
};
const searchArtists = async (keyword, { limit, offset }) => {
  const [rows] = await db.query(
    `
    SELECT
      a.*,
      (a.name LIKE ?) * 5 +
      (a.name LIKE ?) * 3 +
      (a.follow_count * 0.01) AS score
    FROM artists a
    WHERE a.name LIKE ?
    ORDER BY score DESC
    LIMIT ? OFFSET ?
    `,
    [
      `${keyword}%`,
      `%${keyword}%`,
      `%${keyword}%`,
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

const searchAlbums = async (keyword, { limit, offset }) => {
  const [rows] = await db.query(
    `
    SELECT
      al.*,
      (al.title LIKE ?) * 5 +
      (al.title LIKE ?) * 3 AS score
    FROM albums al
    WHERE al.title LIKE ?
    AND al.release_date IS NOT NULL
    AND al.release_date <= NOW()
    ORDER BY score DESC
    LIMIT ? OFFSET ?
    `,
    [
      `${keyword}%`,
      `%${keyword}%`,
      `%${keyword}%`,
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
    searchSongsAdmin(keyword, options),
    searchArtists(keyword, options),
    searchAlbums(keyword, options),
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
