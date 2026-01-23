import db from "../config/db.js";
import ROLES from "../constants/roles.js";
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
  keyword,
  sort = "release_date",
  order = "desc",
  includeUnreleased = false,
  includeDeleted = false,
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
const normalizedKeyword = keyword?.trim();

if (!includeDeleted) {
  where += " AND a.is_deleted = 0";
}

if (!includeUnreleased) {
where += " AND a.release_date IS NOT NULL AND a.release_date <= NOW()";
}


if (status) {
where += " AND a.status = ?";
params.push(status);
}


if (artistId) {
where += " AND a.artist_id = ?";
params.push(artistId);
}

if (normalizedKeyword) {
  where += " AND a.title LIKE ?";
  params.push(`%${normalizedKeyword}%`);
}

const [countRows] = await db.query(
  `SELECT COUNT(*) as total FROM albums a ${where}`,
  params
);
const total = countRows[0]?.total || 0;

const dataParams = [];
if (status) {
  dataParams.push(status);
}
dataParams.push(...params);

const sql = `
  SELECT
    a.*,
    (
      SELECT COUNT(*)
      FROM songs s
      WHERE s.album_id = a.id
      ${status ? "AND s.status = ?" : ""}
    ) AS song_count
  FROM albums a
  ${where}
  ORDER BY ${sortColumn} ${sortOrder}
  LIMIT ? OFFSET ?
`;

dataParams.push(limit, offset);


const [rows] = await db.query(sql, dataParams);


return {
items: rows,
meta: buildPaginationMeta(page, limit, total),
};
};

export const getAlbumById = async (
id,
{ status, genres = [], includeSongs = true, includeUnreleased = false, includeDeleted = false } = {}
) => {
const [albumRows] = await db.query(
`
SELECT al.*, ar.name AS artist_name
FROM albums al
LEFT JOIN artists ar ON ar.id = al.artist_id
WHERE al.id = ?
${includeDeleted ? "" : "AND al.is_deleted = 0"}
${includeUnreleased ? "" : "AND al.release_date IS NOT NULL AND al.release_date <= NOW()"}
LIMIT 1;
`,
[id]
);


const album = albumRows[0];
if (!album) return null;


let songs = [];


if (includeSongs) {
const songFilters = [
  "s.album_id = ?",
  "s.is_deleted = 0",
  includeUnreleased ? "1=1" : "s.status = 'approved'",
  includeUnreleased ? "1=1" : "s.release_date IS NOT NULL",
  includeUnreleased ? "1=1" : "s.release_date <= NOW()",
];



const [songRows] = await db.query(
`
SELECT s.*, ar.name AS artist_name
FROM songs s
JOIN albums al ON al.id = s.album_id
LEFT JOIN artists ar ON ar.id = s.artist_id
WHERE ${songFilters.join(" AND ")}
ORDER BY s.id DESC;
`,
[id]
);


songs = songRows;
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
  const [albums] = await db.query(
    "SELECT id FROM albums WHERE id = ? AND is_deleted = 0",
    [albumId]
  );

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
    "SELECT * FROM albums WHERE id = ? AND is_deleted = 0",
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
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [albums] = await connection.query(
      "SELECT id FROM albums WHERE id = ?",
      [id]
    );
    if (!albums[0]) {
      throw createError(404, "Album not found");
    }

    await connection.query("DELETE FROM songs WHERE album_id = ?", [id]);
    const [result] = await connection.query(
      "DELETE FROM albums WHERE id = ?",
      [id]
    );
    if (!result.affectedRows) {
      throw createError(404, "Album not found");
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

export const softDeleteAlbum = async (id, { deletedBy, deletedByRole }) => {
  const [rows] = await db.query(
    "SELECT id, is_deleted FROM albums WHERE id = ?",
    [id]
  );
  if (!rows[0]) {
    throw createError(404, "Album not found");
  }
  if (rows[0].is_deleted) {
    throw createError(409, "Album already deleted");
  }

  await db.query(
    `
    UPDATE albums
    SET is_deleted = 1,
        deleted_by = ?,
        deleted_by_role = ?,
        deleted_at = NOW()
    WHERE id = ?
    `,
    [deletedBy || null, deletedByRole || null, id]
  );
};

export const restoreAlbum = async (
  id,
  { requesterRole, requesterId, artistId }
) => {
  const [rows] = await db.query(
    `
    SELECT id, artist_id, is_deleted, deleted_by, deleted_by_role
    FROM albums
    WHERE id = ?
    `,
    [id]
  );
  const album = rows[0];
  if (!album) {
    throw createError(404, "Album not found");
  }
  if (!album.is_deleted) {
    throw createError(400, "Album is not deleted");
  }

  if (requesterRole === ROLES.ARTIST) {
    if (!artistId || album.artist_id !== artistId) {
      throw createError(403, "Forbidden");
    }
    if (
      album.deleted_by_role !== ROLES.ARTIST ||
      album.deleted_by !== requesterId
    ) {
      throw createError(403, "Album cannot be restored");
    }
  }

  await db.query(
    `
    UPDATE albums
    SET is_deleted = 0,
        deleted_by = NULL,
        deleted_by_role = NULL,
        deleted_at = NULL
    WHERE id = ?
    `,
    [id]
  );

  return getAlbumById(id, { includeSongs: true, includeUnreleased: true, includeDeleted: true });
};

export default {
  listAlbums,
  getAlbumById,
  updateAlbumCover,
  createAlbum,
  updateAlbum,
  deleteAlbum,
  softDeleteAlbum,
  restoreAlbum,
};
