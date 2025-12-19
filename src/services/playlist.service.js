import db from "../config/db.js";

const createError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const sanitizePlaylist = (playlist) => {
  if (!playlist) return null;
  const normalized = { ...playlist };

  if (playlist.is_system !== undefined) {
    normalized.is_system = Boolean(playlist.is_system);
  }

  return normalized;
};

const ensurePlaylistOwner = async (playlistId, userId) => {
  const [playlistRows] = await db.query(
    "SELECT * FROM playlists WHERE id = ?",
    [playlistId]
  );
  const playlist = playlistRows[0];

  if (!playlist) {
    throw createError(404, "Playlist not found");
  }
  if (playlist.is_system) {
    throw createError(403, "System playlists cannot be modified");
  }
  if (Number(playlist.user_id) !== Number(userId)) {
    throw createError(
      403,
      "You do not have permission to modify this playlist"
    );
  }

  return playlist;
};

const mapPlaylistSong = (row) => ({
  id: row.song_id,
  position: row.position,
  title: row.title,
  artist_id: row.artist_id,
  album_id: row.album_id,
});

export const listPlaylists = async (userId) => {
  const [rows] = await db.query(
    `
    SELECT *
    FROM playlists
    WHERE user_id = ? OR is_system = 1
    ORDER BY id DESC
  `,
    [userId]
  );
  return rows.map(sanitizePlaylist);
};

export const getPlaylistById = async (id) => {
  const [playlistRows] = await db.query(
    "SELECT * FROM playlists WHERE id = ?",
    [id]
  );
  const playlist = playlistRows[0];

  if (!playlist) {
    return null;
  }

  const [songRows] = await db.query(
    `
    SELECT
      ps.song_id,
      ps.position,
      s.title,
      s.artist_id,
      s.album_id
    FROM playlist_songs ps
    LEFT JOIN songs s ON s.id = ps.song_id
    WHERE ps.playlist_id = ?
    ORDER BY ps.position ASC
  `,
    [id]
  );

  return {
    ...sanitizePlaylist(playlist),
    songs: songRows.map(mapPlaylistSong),
  };
};

export const createPlaylist = async (userId, { name }) => {
  if (!name) {
    throw createError(400, "Playlist name is required");
  }

  const [result] = await db.query(
    `
   INSERT INTO playlists (name, user_id, is_system)
    VALUES (?, ?, ?)
  `,
    [name, userId, 0]
  );

  return getPlaylistById(result.insertId);
};

export const updatePlaylist = async (playlistId, userId, { name }) => {
  await ensurePlaylistOwner(playlistId, userId);

  const fields = [];
  const values = [];

  if (name !== undefined) {
    fields.push("name = ?");
    values.push(name);
  }

  if (fields.length === 0) {
    return getPlaylistById(playlistId);
  }

  values.push(playlistId);

  await db.query(
    `UPDATE playlists SET ${fields.join(", ")} WHERE id = ?`,
    values
  );

  return getPlaylistById(playlistId);
};

export const deletePlaylist = async (playlistId, userId) => {
  await ensurePlaylistOwner(playlistId, userId);
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();
    await connection.query("DELETE FROM playlist_songs WHERE playlist_id = ?", [
      playlistId,
    ]);
    await connection.query("DELETE FROM playlists WHERE id = ?", [playlistId]);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

export const addSongToPlaylist = async (
  playlistId,
  songId,
  userId,
  position
) => {
  await ensurePlaylistOwner(playlistId, userId);

  const [songRows] = await db.query("SELECT id FROM songs WHERE id = ?", [
    songId,
  ]);
  if (!songRows[0]) {
    throw createError(404, "Song not found");
  }

  const [existingRows] = await db.query(
    "SELECT 1 FROM playlist_songs WHERE playlist_id = ? AND song_id = ? LIMIT 1",
    [playlistId, songId]
  );
  if (existingRows[0]) {
    throw createError(409, "Song already exists in playlist");
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [countRows] = await connection.query(
      "SELECT COUNT(*) AS count FROM playlist_songs WHERE playlist_id = ?",
      [playlistId]
    );
    const total = countRows[0]?.count || 0;
    const targetPosition =
      position && Number.isInteger(position) && position > 0
        ? Math.min(position, total + 1)
        : total + 1;

    await connection.query(
      `
      UPDATE playlist_songs
      SET position = position + 1
      WHERE playlist_id = ? AND position >= ?
    `,
      [playlistId, targetPosition]
    );

    await connection.query(
      `
      INSERT INTO playlist_songs (playlist_id, song_id, position)
      VALUES (?, ?, ?)
    `,
      [playlistId, songId, targetPosition]
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  return getPlaylistById(playlistId);
};

export const removeSongFromPlaylist = async (playlistId, songId, userId) => {
  await ensurePlaylistOwner(playlistId, userId);
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [songRows] = await connection.query(
      `
      SELECT position
      FROM playlist_songs
      WHERE playlist_id = ? AND song_id = ?
      LIMIT 1
    `,
      [playlistId, songId]
    );

    const playlistSong = songRows[0];

    if (!playlistSong) {
      throw createError(404, "Song not found in playlist");
    }

    await connection.query(
      "DELETE FROM playlist_songs WHERE playlist_id = ? AND song_id = ?",
      [playlistId, songId]
    );

    await connection.query(
      `
      UPDATE playlist_songs
      SET position = position - 1
      WHERE playlist_id = ? AND position > ?
    `,
      [playlistId, playlistSong.position]
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  return getPlaylistById(playlistId);
};

export const reorderSongInPlaylist = async (
  playlistId,
  songId,
  newPosition,
  userId
) => {
  await ensurePlaylistOwner(playlistId, userId);
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [songRows] = await connection.query(
      `
      SELECT position
      FROM playlist_songs
      WHERE playlist_id = ? AND song_id = ?
      LIMIT 1
    `,
      [playlistId, songId]
    );

    const playlistSong = songRows[0];

    if (!playlistSong) {
      throw createError(404, "Song not found in playlist");
    }

    const [countRows] = await connection.query(
      "SELECT COUNT(*) AS count FROM playlist_songs WHERE playlist_id = ?",
      [playlistId]
    );
    const total = countRows[0]?.count || 0;
    const targetPosition =
      newPosition && Number.isInteger(newPosition) && newPosition > 0
        ? Math.min(newPosition, total)
        : playlistSong.position;

    if (targetPosition !== playlistSong.position) {
      if (targetPosition < playlistSong.position) {
        await connection.query(
          `
          UPDATE playlist_songs
          SET position = position + 1
          WHERE playlist_id = ? AND position >= ? AND position < ?
        `,
          [playlistId, targetPosition, playlistSong.position]
        );
      } else {
        await connection.query(
          `
          UPDATE playlist_songs
          SET position = position - 1
          WHERE playlist_id = ? AND position <= ? AND position > ?
        `,
          [playlistId, targetPosition, playlistSong.position]
        );
      }

      await connection.query(
        `
        UPDATE playlist_songs
        SET position = ?
        WHERE playlist_id = ? AND song_id = ?
      `,
        [targetPosition, playlistId, songId]
      );
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  return getPlaylistById(playlistId);
};

export default {
  listPlaylists,
  getPlaylistById,
  createPlaylist,
  updatePlaylist,
  deletePlaylist,
  addSongToPlaylist,
  removeSongFromPlaylist,
  reorderSongInPlaylist,
};
