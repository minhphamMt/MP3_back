import db from "../config/db.js";
import SONG_STATUS from "../constants/song-status.js";
import { getTopWeeklySongs } from "./chart.service.js";

const getCount = async (query, params = []) => {
  const [rows] = await db.query(query, params);
  return rows[0]?.count ?? 0;
};

export const getSystemOverview = async () => {
  const [
    totalUsers,
    totalArtists,
    totalSongs,
    totalAlbums,
    pendingSongs,
    approvedSongs,
    rejectedSongs,
  ] = await Promise.all([
    getCount("SELECT COUNT(*) AS count FROM users"),
    getCount("SELECT COUNT(*) AS count FROM artists"),
    getCount("SELECT COUNT(*) AS count FROM songs"),
    getCount("SELECT COUNT(*) AS count FROM albums"),
    getCount("SELECT COUNT(*) AS count FROM songs WHERE status = ?", [
      SONG_STATUS.PENDING,
    ]),
    getCount("SELECT COUNT(*) AS count FROM songs WHERE status = ?", [
      SONG_STATUS.APPROVED,
    ]),
    getCount("SELECT COUNT(*) AS count FROM songs WHERE status = ?", [
      SONG_STATUS.REJECTED,
    ]),
  ]);

  return {
    users: totalUsers,
    artists: totalArtists,
    songs: totalSongs,
    albums: totalAlbums,
    songsByStatus: {
      pending: pendingSongs,
      approved: approvedSongs,
      rejected: rejectedSongs,
    },
  };
};

export const getWeeklyTopSongs = async (limit = 5) =>
  getTopWeeklySongs(limit);

export default {
  getSystemOverview,
  getWeeklyTopSongs,
};