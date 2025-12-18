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

const parseGenreString = (genreString) =>
  genreString ? genreString.split(",").filter(Boolean) : [];

export const listSongs = async ({
  page,
  limit,
  offset,
  genres = [],
  status,
  artistId,
  albumId,
}) => {
  const filters = [];
  const params = [];
  const normalizedGenres = normalizeGenres(genres);

  if (status) {
    filters.push("s.status = ?");
    params.push(status);
  }

  if (artistId) {
    filters.push("s.artist_id = ?");
    params.push(artistId);
  }

  if (albumId) {
    filters.push("s.album_id = ?");
    params.push(albumId);
  }

  if (normalizedGenres.length > 0) {
    const placeholders = normalizedGenres.map(() => "?").join(",");
    filters.push(
      `EXISTS (
        SELECT 1
        FROM song_genres sg
        JOIN genres g ON g.id = sg.genre_id
        WHERE sg.song_id = s.id AND g.name IN (${placeholders})
      )`
    );
    params.push(...normalizedGenres);
  }

  const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

  const [countRows] = await db.query(
    `SELECT COUNT(*) as total FROM songs s ${whereClause}`,
    params
  );
  const total = countRows[0]?.total || 0;

  const [rows] = await db.query(
    `
    SELECT
      s.*,
      ar.name AS artist_name,
      al.title AS album_title,
      (SELECT GROUP_CONCAT(DISTINCT g2.name)
        FROM song_genres sg2
        JOIN genres g2 ON g2.id = sg2.genre_id
        WHERE sg2.song_id = s.id) AS genres
    FROM songs s
    LEFT JOIN artists ar ON ar.id = s.artist_id
    LEFT JOIN albums al ON al.id = s.album_id
    ${whereClause}
    ORDER BY s.id DESC
    LIMIT ? OFFSET ?;
  `,
    [...params, limit, offset]
  );

  const items = rows.map((row) => ({
    ...row,
    genres: parseGenreString(row.genres),
    artist: row.artist_id ? { id: row.artist_id, name: row.artist_name } : null,
    album: row.album_id ? { id: row.album_id, title: row.album_title } : null,
  }));

  return {
    items,
    meta: buildPaginationMeta(page, limit, total),
  };
};

export const getSongById = async (id, { status, genres = [] } = {}) => {
  const normalizedGenres = normalizeGenres(genres);
  const filters = ["s.id = ?"];
  const params = [id];

  if (status) {
    filters.push("s.status = ?");
    params.push(status);
  }

  if (normalizedGenres.length > 0) {
    const placeholders = normalizedGenres.map(() => "?").join(",");
    filters.push(
      `EXISTS (
        SELECT 1
        FROM song_genres sg
        JOIN genres g ON g.id = sg.genre_id
        WHERE sg.song_id = s.id AND g.name IN (${placeholders})
      )`
    );
    params.push(...normalizedGenres);
  }

  const whereClause = `WHERE ${filters.join(" AND ")}`;

  const [rows] = await db.query(
    `
    SELECT
      s.*,
      ar.name AS artist_name,
      al.title AS album_title,
      (SELECT GROUP_CONCAT(DISTINCT g2.name)
        FROM song_genres sg2
        JOIN genres g2 ON g2.id = sg2.genre_id
        WHERE sg2.song_id = s.id) AS genres
    FROM songs s
    LEFT JOIN artists ar ON ar.id = s.artist_id
    LEFT JOIN albums al ON al.id = s.album_id
    ${whereClause}
    LIMIT 1;
  `,
    params
  );

  const song = rows[0];

  if (!song) {
    return null;
  }

  return {
    ...song,
    genres: parseGenreString(song.genres),
    artist: song.artist_id
      ? { id: song.artist_id, name: song.artist_name }
      : null,
    album: song.album_id
      ? { id: song.album_id, title: song.album_title }
      : null,
  };
};

export default {
  listSongs,
  getSongById,
};
