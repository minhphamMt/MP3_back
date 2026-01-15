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
  status,
  artistId,
  genres,
  sort = "release_date",
  order = "desc",
}) => {
  const allowedSort = {
    release_date: "a.release_date",
    created_at: "a.created_at",
    title: "a.title",
  };

  const sortColumn = allowedSort[sort] || allowedSort.release_date;
  const sortOrder = order.toUpperCase() === "ASC" ? "ASC" : "DESC";

  let where = "WHERE 1=1";
  const params = [];

  if (status) {
    where += " AND a.status = ?";
    params.push(status);
  }

  if (artistId) {
    where += " AND a.artist_id = ?";
    params.push(artistId);
  }

  const sql = `
    SELECT a.*
    FROM albums a
    ${where}
    ORDER BY ${sortColumn} ${sortOrder}
    LIMIT ? OFFSET ?
  `;

  params.push(limit, offset);

  const [rows] = await db.query(sql, params);

  return {
    items: rows,
    meta: { page, limit },
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
  { title, release_date }
) => {
  const [existing] = await db.query(
    "SELECT * FROM albums WHERE id = ?",
    [id]
  );

  if (!existing[0]) {
    throw createError(404, "Album not found");
  }

  const fields = [];
  const values = [];

  // ✅ CHỈ CHO PHÉP UPDATE METADATA
  if (title !== undefined) {
    fields.push("title = ?");
    values.push(title);
  }

  if (release_date !== undefined) {
    fields.push("release_date = ?");
    values.push(release_date);
  }

  if (!fields.length) {
    return getAlbumById(id);
  }

  values.push(id);

  await db.query(
    `UPDATE albums SET ${fields.join(", ")} WHERE id = ?`,
    values
  );

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
