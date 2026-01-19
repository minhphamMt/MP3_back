import db from "../config/db.js";
import { buildPaginationMeta } from "../utils/pagination.js";

const createError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

export const listGenres = async ({ page, limit, offset, keyword } = {}) => {
  const params = [];
  let where = "";

  if (keyword) {
    where = "WHERE name LIKE ?";
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
  const [rows] = await db.query("SELECT id, name FROM genres WHERE id = ?", [
    id,
  ]);
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

export default {
  listGenres,
  getGenreById,
  createGenre,
  updateGenre,
  deleteGenre,
};