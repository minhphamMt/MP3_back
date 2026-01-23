import db from "../config/db.js";
import ROLES from "../constants/roles.js";
import { buildPaginationMeta } from "../utils/pagination.js";
import { generateZingId } from "../utils/zing-id.js";

const normalizeGenres = (genres) => {
  if (!genres) return [];
  const list = Array.isArray(genres)
    ? genres
    : String(genres)
        .split(",")
        .map((item) => item.trim());

  return [...new Set(list.filter(Boolean))];
};
const createError = (status, message) => {
  const err = new Error(message);
  err.status = status;
  return err;
};
const parseGenreString = (genreString) =>
  genreString ? genreString.split(",").filter(Boolean) : [];
  const generateUniqueZingArtistId = async () => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = generateZingId("zingArtist");
    const [rows] = await db.query(
      "SELECT id FROM artists WHERE zing_artist_id = ? LIMIT 1",
      [candidate]
    );
    if (!rows[0]) {
      return candidate;
    }
  }

  throw createError(500, "Failed to generate zing_artist_id");
};

export const listArtists = async ({
  page,
  limit,
  offset,
  genres = [],
  status,
  keyword,
  includeDeleted = false,
}) => {
  const normalizedGenres = normalizeGenres(genres);
  const normalizedKeyword = keyword?.trim();
  const filters = [];
  const params = [];

  if (!includeDeleted) {
    filters.push("ar.is_deleted = 0");
  }

  if (normalizedKeyword) {
    filters.push("ar.name LIKE ?");
    params.push(`%${normalizedKeyword}%`);
  }
  
  if (status || normalizedGenres.length > 0) {
    const songFilters = ["s.artist_id = ar.id"];
    const songParams = [];

    if (status) {
      songFilters.push("s.status = ?");
      songParams.push(status);
    }

    if (normalizedGenres.length > 0) {
      const placeholders = normalizedGenres.map(() => "?").join(",");
      songFilters.push(`g.name IN (${placeholders})`);
      songParams.push(...normalizedGenres);
    }

    filters.push(
      `EXISTS (
        SELECT 1
        FROM songs s
        LEFT JOIN song_genres sg ON sg.song_id = s.id
        LEFT JOIN genres g ON g.id = sg.genre_id
        WHERE ${songFilters.join(" AND ")}
      )`
    );
    params.push(...songParams);
  }

  const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

  const [countRows] = await db.query(
    `SELECT COUNT(*) as total FROM artists ar ${whereClause}`,
    params
  );
  const total = countRows[0]?.total || 0;

  const dataParams = [];
  if (status) {
    dataParams.push(status);
  }
  if (status) {
    dataParams.push(status);
  }
  dataParams.push(...params, limit, offset);

  const [rows] = await db.query(
    `
    SELECT
      ar.*,
      (SELECT COUNT(*) FROM albums al WHERE al.artist_id = ar.id) AS album_count,
      (SELECT COUNT(*) FROM songs s WHERE s.artist_id = ar.id ${
        status ? "AND s.status = ?" : ""
      }) AS song_count,
      (SELECT GROUP_CONCAT(DISTINCT g.name)
        FROM songs s
        JOIN song_genres sg ON sg.song_id = s.id
        JOIN genres g ON g.id = sg.genre_id
        WHERE s.artist_id = ar.id ${status ? "AND s.status = ?" : ""}) AS genres
    FROM artists ar
    ${whereClause}
    ORDER BY ar.id DESC
    LIMIT ? OFFSET ?;
  `,
    dataParams
  );

  const items = rows.map((row) => ({
    ...row,
    genres: parseGenreString(row.genres),
  }));

  return {
    items,
    meta: buildPaginationMeta(page, limit, total),
  };
};

export const getArtistById = async (
  id,
  { status, genres = [], includeUnreleased = false, includeDeleted = false } = {}
) => {
  const [artistRows] = await db.query(
    `
    SELECT * FROM artists WHERE id = ? ${includeDeleted ? "" : "AND is_deleted = 0"} LIMIT 1;
  `,
    [id]
  );

  const artist = artistRows[0];
  if (!artist) {
    return null;
  }

  const normalizedGenres = normalizeGenres(genres);

  const albumParams = [];
  if (status) {
    albumParams.push(status);
  }
  albumParams.push(id);

  const [albumRows] = await db.query(
    `
    SELECT
      al.*,
      (SELECT COUNT(*) FROM songs s WHERE s.album_id = al.id ${
        status ? "AND s.status = ?" : ""
      }) AS song_count
    FROM albums al
    WHERE al.artist_id = ?
    ${includeDeleted ? "" : "AND al.is_deleted = 0"}
    ${
        includeUnreleased
          ? ""
          : "AND al.release_date IS NOT NULL AND al.release_date <= NOW()"
      }
    ORDER BY al.id DESC;
  `,
    albumParams
  );

  const songFilters = ["s.artist_id = ?"];
  const songParams = [id];

  if (!includeDeleted) {
    songFilters.push("s.is_deleted = 0");
  }

  if (status) {
    songFilters.push("s.status = ?");
    songParams.push(status);
    } else if (!includeUnreleased) {
    songFilters.push("s.status = 'approved'");
  }

  if (!includeUnreleased) {
    songFilters.push("s.release_date IS NOT NULL");
    songFilters.push("s.release_date <= NOW()");
  }
  
  if (normalizedGenres.length > 0) {
    const placeholders = normalizedGenres.map(() => "?").join(",");
    songFilters.push(
      `EXISTS (
        SELECT 1
        FROM song_genres sg
        JOIN genres g ON g.id = sg.genre_id
        WHERE sg.song_id = s.id AND g.name IN (${placeholders})
      )`
    );
    songParams.push(...normalizedGenres);
  }

  const songWhere = `WHERE ${songFilters.join(" AND ")}`;

  const [songRows] = await db.query(
    `
    SELECT
      s.*,
      al.title AS album_title,
      (SELECT GROUP_CONCAT(DISTINCT g2.name)
        FROM song_genres sg2
        JOIN genres g2 ON g2.id = sg2.genre_id
        WHERE sg2.song_id = s.id) AS genres
    FROM songs s
    LEFT JOIN albums al ON al.id = s.album_id
    ${songWhere}
    ORDER BY s.id DESC;
  `,
    songParams
  );

  const songs = songRows.map((song) => ({
    ...song,
    genres: parseGenreString(song.genres),
    album: song.album_id
      ? { id: song.album_id, title: song.album_title }
      : null,
  }));

  const aggregatedGenres = [
    ...new Set(songs.flatMap((song) => song.genres)),
  ].filter(Boolean);

  return {
    ...artist,
    albums: albumRows,
    songs,
    genres: aggregatedGenres,
  };
};
export const getArtistByUserId = async (userId) => {
  if (!userId) return null;
  const [rows] = await db.query(
    `
    SELECT * FROM artists WHERE user_id = ? AND is_deleted = 0 LIMIT 1;
  `,
    [userId]
  );

  return rows[0] || null;
};
export const getArtistByUserIdWithDeleted = async (userId) => {
  if (!userId) return null;
  const [rows] = await db.query(
    `
    SELECT * FROM artists WHERE user_id = ? LIMIT 1;
  `,
    [userId]
  );

  return rows[0] || null;
};
export const createArtist = async ({
  name,
  alias,
  bio,
  short_bio,
  avatar_url,
  cover_url,
  birthday,
  realname,
  national,
  zing_artist_id,
  user_id,
}) => {
  if (!name) {
    throw createError(400, "name is required");
  }

  if (zing_artist_id) {
    throw createError(400, "zing_artist_id cannot be set manually");
  }

  if (user_id) {
    const [existingRows] = await db.query(
      "SELECT id FROM artists WHERE user_id = ? LIMIT 1",
      [user_id]
    );

    if (existingRows[0]) {
      throw createError(409, "Artist profile already exists for this user");
    }
  }

  const generatedZingArtistId = await generateUniqueZingArtistId();

  const [result] = await db.query(
    `
    INSERT INTO artists (
      user_id,
      name,
      alias,
      bio,
      short_bio,
      avatar_url,
      cover_url,
      birthday,
      realname,
      national,
      zing_artist_id
    )
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    [
      user_id || null,
      name,
      alias || null,
      bio || null,
      short_bio || null,
      avatar_url || null,
      cover_url || null,
      birthday || null,
      realname || null,
      national || null,
      generatedZingArtistId,
    ]
  );

  return getArtistById(result.insertId);
};

export const updateArtist = async (
  id,
  {
    name,
    alias,
    bio,
    short_bio,
    avatar_url,
    cover_url,
    birthday,
    realname,
    national,
    zing_artist_id,
  }
) => {
  const [existing] = await db.query(
    "SELECT * FROM artists WHERE id = ? AND is_deleted = 0",
    [id]
  );
  if (!existing[0]) {
    throw createError(404, "Artist not found");
  }

  if (zing_artist_id !== undefined) {
    throw createError(400, "zing_artist_id cannot be updated manually");
  }

  const fields = [];
  const values = [];
  const payload = {
    name,
    alias,
    bio,
    short_bio,
    avatar_url,
    cover_url,
    birthday,
    realname,
    national,
  };

  Object.entries(payload).forEach(([key, value]) => {
    if (value !== undefined) {
      fields.push(`${key} = ?`);
      values.push(value);
    }
  });

  if (fields.length) {
    values.push(id);
    await db.query(
      `UPDATE artists SET ${fields.join(", ")} WHERE id = ?`,
      values
    );
  }

  return getArtistById(id);
};

export const deleteArtist = async (id) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [artists] = await connection.query(
      "SELECT id FROM artists WHERE id = ?",
      [id]
    );
    if (!artists[0]) {
      throw createError(404, "Artist not found");
    }

    await connection.query(
      `
      DELETE FROM songs
      WHERE artist_id = ?
        OR album_id IN (SELECT id FROM albums WHERE artist_id = ?)
      `,
      [id, id]
    );
    await connection.query("DELETE FROM albums WHERE artist_id = ?", [id]);
    const [result] = await connection.query(
      "DELETE FROM artists WHERE id = ?",
      [id]
    );
    if (!result.affectedRows) {
      throw createError(404, "Artist not found");
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};
export const softDeleteArtist = async (id, { deletedBy, deletedByRole }) => {
  const [rows] = await db.query(
    "SELECT id, is_deleted FROM artists WHERE id = ?",
    [id]
  );
  if (!rows[0]) {
    throw createError(404, "Artist not found");
  }
  if (rows[0].is_deleted) {
    throw createError(409, "Artist already deleted");
  }

  await db.query(
    `
    UPDATE artists
    SET is_deleted = 1,
        deleted_by = ?,
        deleted_by_role = ?,
        deleted_at = NOW()
    WHERE id = ?
    `,
    [deletedBy || null, deletedByRole || null, id]
  );
};

export const restoreArtist = async (
  id,
  { requesterRole, requesterId }
) => {
  const [rows] = await db.query(
    `
    SELECT id, user_id, is_deleted, deleted_by, deleted_by_role
    FROM artists
    WHERE id = ?
    `,
    [id]
  );
  const artist = rows[0];
  if (!artist) {
    throw createError(404, "Artist not found");
  }
  if (!artist.is_deleted) {
    throw createError(400, "Artist is not deleted");
  }

  if (requesterRole === ROLES.ARTIST) {
    if (artist.user_id !== requesterId) {
      throw createError(403, "Forbidden");
    }
    if (
      artist.deleted_by_role !== ROLES.ARTIST ||
      artist.deleted_by !== requesterId
    ) {
      throw createError(403, "Artist cannot be restored");
    }
  }

  await db.query(
    `
    UPDATE artists
    SET is_deleted = 0,
        deleted_by = NULL,
        deleted_by_role = NULL,
        deleted_at = NULL
    WHERE id = ?
    `,
    [id]
  );

  return getArtistById(id, { includeUnreleased: true, includeDeleted: true });
};
export const listArtistCollections = async (limit = 8) => {
  const [rows] = await db.query(
    `
    SELECT
      a.id AS artist_id,
      a.name AS artist_name,
      a.avatar_url AS cover_url,
      COUNT(s.id) AS song_count
    FROM artists a
    JOIN songs s ON s.artist_id = a.id
    WHERE s.status = 'approved'
    AND s.is_deleted = 0
    AND a.is_deleted = 0
    GROUP BY a.id
    ORDER BY song_count DESC
    LIMIT ?
  `,
    [limit]
  );

  return rows;
};

export default {
  listArtists,
  getArtistById,
  getArtistByUserId,
  getArtistByUserIdWithDeleted,
  createArtist,
  updateArtist,
  deleteArtist,
  softDeleteArtist,
  restoreArtist,
  listArtistCollections,
};
