import db from "../config/db.js";
import ROLES from "../constants/roles.js";

export const listDeletedItems = async ({ role, artistId }) => {
  const songsFilters = ["s.is_deleted = 1"];
  const songsParams = [];

  if (role === ROLES.ARTIST) {
    if (!artistId) {
      return { songs: [], albums: [], artists: [], genres: [] };
    }
    songsFilters.push("s.artist_id = ?");
    songsParams.push(artistId);
  }

  const [songs] = await db.query(
    `
    SELECT
      s.*, 
      ar.name AS artist_name,
      al.title AS album_title
    FROM songs s
    LEFT JOIN artists ar ON ar.id = s.artist_id
    LEFT JOIN albums al ON al.id = s.album_id
    WHERE ${songsFilters.join(" AND ")}
    ORDER BY s.deleted_at DESC
    `,
    songsParams
  );

  const albumFilters = ["al.is_deleted = 1"];
  const albumParams = [];

  if (role === ROLES.ARTIST) {
    albumFilters.push("al.artist_id = ?");
    albumParams.push(artistId);
  }

  const [albums] = await db.query(
    `
    SELECT
      al.*,
      ar.name AS artist_name
    FROM albums al
    LEFT JOIN artists ar ON ar.id = al.artist_id
    WHERE ${albumFilters.join(" AND ")}
    ORDER BY al.deleted_at DESC
    `,
    albumParams
  );

  const artistFilters = ["a.is_deleted = 1"];
  const artistParams = [];

  if (role === ROLES.ARTIST) {
    artistFilters.push("a.id = ?");
    artistParams.push(artistId);
  }

  const [artists] = await db.query(
    `
    SELECT a.*
    FROM artists a
    WHERE ${artistFilters.join(" AND ")}
    ORDER BY a.deleted_at DESC
    `,
    artistParams
  );

  let genres = [];
  if (role === ROLES.ADMIN) {
    const [genreRows] = await db.query(
      `
      SELECT g.*
      FROM genres g
      WHERE g.is_deleted = 1
      ORDER BY g.deleted_at DESC
      `
    );
    genres = genreRows;
  }

  return {
    songs,
    albums,
    artists,
    genres,
  };
};

export default {
  listDeletedItems,
};