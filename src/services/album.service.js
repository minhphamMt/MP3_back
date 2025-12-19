import db from "../config/db.js";
import { buildPaginationMeta } from "../utils/pagination.js";

const createError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const normalizeGenres = (genres) => {
  if (!genres) return [];
  const list = Array.isArray(genres)
    ? genres
    : String(genres)
        .split(",")
        .map((item) => item.trim());

  return [...new Set(list.filter(Boolean))];
};

const parseGenreString = (genreString) =>
  genreString ? genreString.split(",").filter(Boolean) : [];

export const listAlbums = async ({
  page,
  limit,
  offset,
  artistId,
  genres = [],
  status,
}) => {
  const filters = [];
  const params = [];
  const normalizedGenres = normalizeGenres(genres);

  if (artistId) {
    filters.push("al.artist_id = ?");
    params.push(artistId);
  }

  if (status || normalizedGenres.length > 0) {
    const songFilters = ["s.album_id = al.id"];
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
    `SELECT COUNT(*) as total FROM albums al ${whereClause}`,
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
      al.*,
      ar.name AS artist_name,
      (SELECT COUNT(*)
        FROM songs s
        WHERE s.album_id = al.id ${
          status ? "AND s.status = ?" : ""
        }) AS song_count,
      (SELECT GROUP_CONCAT(DISTINCT g.name)
        FROM songs s
        JOIN song_genres sg ON sg.song_id = s.id
        JOIN genres g ON g.id = sg.genre_id
        WHERE s.album_id = al.id ${status ? "AND s.status = ?" : ""}) AS genres
    FROM albums al
    LEFT JOIN artists ar ON ar.id = al.artist_id
    ${whereClause}
    ORDER BY al.id DESC
    LIMIT ? OFFSET ?;
  `,
    dataParams
  );

  const items = rows.map((row) => ({
    ...row,
    artist: row.artist_id ? { id: row.artist_id, name: row.artist_name } : null,
    genres: parseGenreString(row.genres),
  }));

  return {
    items,
    meta: buildPaginationMeta(page, limit, total),
  };
};

export const getAlbumById = async (
  id,
  { status, genres = [], includeSongs = true } = {}
) => {
  const [albumRows] = await db.query(
    `
    SELECT
      al.*,
      ar.name AS artist_name
    FROM albums al
    LEFT JOIN artists ar ON ar.id = al.artist_id
    WHERE al.id = ?
    LIMIT 1;
  `,
    [id]
  );

  const album = albumRows[0];

  if (!album) {
    return null;
  }

  const normalizedGenres = normalizeGenres(genres);
  let songs = [];

  if (includeSongs) {
    const songFilters = ["s.album_id = ?"];
    const songParams = [id];

    if (status) {
      songFilters.push("s.status = ?");
      songParams.push(status);
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
        ar.name AS artist_name,
        (SELECT GROUP_CONCAT(DISTINCT g2.name)
          FROM song_genres sg2
          JOIN genres g2 ON g2.id = sg2.genre_id
          WHERE sg2.song_id = s.id) AS genres
      FROM songs s
      LEFT JOIN artists ar ON ar.id = s.artist_id
      ${songWhere}
      ORDER BY s.id DESC;
    `,
      songParams
    );

    songs = songRows.map((song) => ({
      ...song,
      genres: parseGenreString(song.genres),
      artist: song.artist_id
        ? { id: song.artist_id, name: song.artist_name }
        : null,
    }));
  }

  return {
    ...album,
    artist: album.artist_id
      ? { id: album.artist_id, name: album.artist_name }
      : null,
    songs,
  };
};

export const updateAlbumCover = async (albumId, coverUrl) => {
  const [albums] = await db.query("SELECT id FROM albums WHERE id = ?", [
    albumId,
  ]);

  if (!albums[0]) {
    throw createError(404, "Album not found");
  }

  if (!coverUrl) {
    return getAlbumById(albumId);
  }

  await db.query("UPDATE albums SET cover_url = ? WHERE id = ?", [
    coverUrl,
    albumId,
  ]);

  return getAlbumById(albumId);
};
export const createAlbum = async ({
  title,
  artist_id,
  release_date,
  cover_url,
  zing_album_id,
}) => {
  if (!title) {
    throw createError(400, "title is required");
  }

  const [result] = await db.query(
    `
    INSERT INTO albums (title, artist_id, release_date, cover_url, zing_album_id)
    VALUES (?, ?, ?, ?, ?)
  `,
    [
      title,
      artist_id || null,
      release_date || null,
      cover_url || null,
      zing_album_id || null,
    ]
  );

  return getAlbumById(result.insertId);
};

export const updateAlbum = async (
  id,
  { title, artist_id, release_date, cover_url, zing_album_id }
) => {
  const [existing] = await db.query("SELECT * FROM albums WHERE id = ?", [id]);
  if (!existing[0]) {
    throw createError(404, "Album not found");
  }

  const fields = [];
  const values = [];
  const payload = { title, artist_id, release_date, cover_url, zing_album_id };

  Object.entries(payload).forEach(([key, value]) => {
    if (value !== undefined) {
      fields.push(`${key} = ?`);
      values.push(value);
    }
  });

  if (fields.length) {
    values.push(id);
    await db.query(
      `UPDATE albums SET ${fields.join(", ")} WHERE id = ?`,
      values
    );
  }

  return getAlbumById(id);
};

export const deleteAlbum = async (id) => {
  const [result] = await db.query("DELETE FROM albums WHERE id = ?", [id]);
  if (!result.affectedRows) {
    throw createError(404, "Album not found");
  }
};

export default {
  listAlbums,
  getAlbumById,
  updateAlbumCover,
  createAlbum,
  updateAlbum,
  deleteAlbum,
};
