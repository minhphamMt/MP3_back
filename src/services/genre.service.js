import db from "../config/db.js";
import ROLES from "../constants/roles.js";
import { buildPaginationMeta } from "../utils/pagination.js";

const createError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

export const listGenres = async ({ page, limit, offset, keyword } = {}) => {
  const params = [];
  let where = "WHERE is_deleted = 0";

  if (keyword) {
    where += " AND name LIKE ?";
    params.push(`%${keyword}%`);
  }

  const [rows] = await db.query(
    `
    SELECT id, name
    FROM genres
    ${where}
    ORDER BY name ASC
    LIMIT ? OFFSET ?
    `,
    [...params, limit, offset]
  );

  return {
    items: rows,
    meta: buildPaginationMeta(page, limit, rows.length),
  };
};

export const getGenreById = async (id) => {
  const [rows] = await db.query(
    "SELECT id, name FROM genres WHERE id = ? AND is_deleted = 0",
    [id]
  );
  return rows[0];
};

export const createGenre = async (name) => {
  const normalized = String(name || "").trim();
  if (!normalized) {
    throw createError(400, "name is required");
  }

  const [existing] = await db.query("SELECT id FROM genres WHERE name = ?", [
    normalized,
  ]);
  if (existing.length) {
    throw createError(409, "Genre already exists");
  }

  const [result] = await db.query("INSERT INTO genres (name) VALUES (?)", [
    normalized,
  ]);

  return getGenreById(result.insertId);
};

export const updateGenre = async (id, name) => {
  const normalized = String(name || "").trim();
  if (!normalized) {
    throw createError(400, "name is required");
  }

  const genre = await getGenreById(id);
  if (!genre) {
    throw createError(404, "Genre not found");
  }

  if (normalized !== genre.name) {
    const [existing] = await db.query(
      "SELECT id FROM genres WHERE name = ?",
      [normalized]
    );
    if (existing.length) {
      throw createError(409, "Genre already exists");
    }
  }

  await db.query("UPDATE genres SET name = ? WHERE id = ?", [
    normalized,
    id,
  ]);
  return getGenreById(id);
};

export const deleteGenre = async (id) => {
  const [result] = await db.query("DELETE FROM genres WHERE id = ?", [id]);
  if (!result.affectedRows) {
    throw createError(404, "Genre not found");
  }
};

export const softDeleteGenre = async (id, { deletedBy, deletedByRole }) => {
  if (deletedByRole && deletedByRole !== ROLES.ADMIN) {
    throw createError(403, "Forbidden");
  }

  const [rows] = await db.query(
    "SELECT id, is_deleted FROM genres WHERE id = ?",
    [id]
  );
  if (!rows[0]) {
    throw createError(404, "Genre not found");
  }
  if (rows[0].is_deleted) {
    throw createError(409, "Genre already deleted");
  }

  await db.query(
    `
    UPDATE genres
    SET is_deleted = 1,
        deleted_by = ?,
        deleted_by_role = ?,
        deleted_at = NOW()
    WHERE id = ?
    `,
    [deletedBy || null, deletedByRole || null, id]
  );
};

export const restoreGenre = async (
  id,
  { requesterRole }
) => {
  if (requesterRole && requesterRole !== ROLES.ADMIN) {
    throw createError(403, "Forbidden");
  }

  const [rows] = await db.query(
    `
    SELECT id, is_deleted
    FROM genres
    WHERE id = ?
    `,
    [id]
  );
  const genre = rows[0];
  if (!genre) {
    throw createError(404, "Genre not found");
  }
  if (!genre.is_deleted) {
    throw createError(400, "Genre is not deleted");
  }

  await db.query(
    `
    UPDATE genres
    SET is_deleted = 0,
        deleted_by = NULL,
        deleted_by_role = NULL,
        deleted_at = NULL
    WHERE id = ?
    `,
    [id]
  );

  return getGenreById(id);
};

export default {
  listGenres,
  getGenreById,
  createGenre,
  updateGenre,
  deleteGenre,
  softDeleteGenre,
  restoreGenre,
};