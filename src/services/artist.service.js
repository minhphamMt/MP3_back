import db from "../config/db.js";
import { buildPaginationMeta } from "../utils/pagination.js";

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

export const listArtists = async ({
  page,
  limit,
  offset,
  genres = [],
  status,
}) => {
  const normalizedGenres = normalizeGenres(genres);
  const filters = [];
  const params = [];

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

export const getArtistById = async (id, { status, genres = [] } = {}) => {
  const [artistRows] = await db.query(
    `
    SELECT * FROM artists WHERE id = ? LIMIT 1;
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
    ORDER BY al.id DESC;
  `,
    albumParams
  );

  const songFilters = ["s.artist_id = ?"];
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
}) => {
  if (!name) {
    throw createError(400, "name is required");
  }

  const [result] = await db.query(
    `
    INSERT INTO artists (
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
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    [
      name,
      alias || null,
      bio || null,
      short_bio || null,
      avatar_url || null,
      cover_url || null,
      birthday || null,
      realname || null,
      national || null,
      zing_artist_id || null,
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
  const [existing] = await db.query("SELECT * FROM artists WHERE id = ?", [id]);
  if (!existing[0]) {
    throw createError(404, "Artist not found");
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
    zing_artist_id,
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
  const [result] = await db.query("DELETE FROM artists WHERE id = ?", [id]);
  if (!result.affectedRows) {
    throw createError(404, "Artist not found");
  }
};
export default {
  listArtists,
  getArtistById,
  createArtist,
  updateArtist,
  deleteArtist,
};
