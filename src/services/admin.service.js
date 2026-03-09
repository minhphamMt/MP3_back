import db from "../config/db.js";
import SONG_STATUS from "../constants/song-status.js";
import { getTopWeeklySongs } from "./chart.service.js";
import { getUserListeningHistory } from "./history.service.js";
import { listSearchHistory } from "./search.service.js";

const CHARTS_CACHE_TTL_MS = 10 * 60 * 1000;
const chartsCache = new Map();
const DEFAULT_TZ = "Asia/Ho_Chi_Minh";
const SUPPORTED_INCLUDES = new Set([
  "song_status",
  "weekly_top",
  "genre_status",
  "user_distribution",
  "artist_request_trend",
  "album_by_month",
]);

let indexesEnsured = false;

const createError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const getCount = async (query, params = []) => {
  const [rows] = await db.query(query, params);
  return rows[0]?.count ?? 0;
};

const pad2 = (num) => String(num).padStart(2, "0");

const isValidIanaTimezone = (tz) => {
  try {
    Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date());
    return true;
  } catch {
    return false;
  }
};

const getDatePartsInTimeZone = (date, timeZone) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
  };
};

const getCurrentDateInTz = (tz) => {
  const parts = getDatePartsInTimeZone(new Date(), tz);
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
};

const shiftDateString = (dateStr, deltaDays) => {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + deltaDays));
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(
    date.getUTCDate()
  )}`;
};

const getMonthRange = (from, to) => {
  const [fromY, fromM] = from.split("-").map(Number);
  const [toY, toM] = to.split("-").map(Number);
  const months = [];

  let y = fromY;
  let m = fromM;
  while (y < toY || (y === toY && m <= toM)) {
    months.push(`${y}-${pad2(m)}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }

  return months;
};

const getDateRange = (from, to) => {
  const dates = [];
  let cursor = from;
  while (cursor <= to) {
    dates.push(cursor);
    cursor = shiftDateString(cursor, 1);
  }
  return dates;
};

const buildSoftDeleteCondition = async (tableName, alias) => {
  const [columns] = await db.query(
    `
      SELECT COLUMN_NAME
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
      AND table_name = ?
    `,
    [tableName]
  );

  const columnSet = new Set(columns.map((col) => col.COLUMN_NAME));
  const conditions = [];
  if (columnSet.has("is_deleted")) {
    conditions.push(`${alias}.is_deleted = 0`);
  }
  if (columnSet.has("deleted_at")) {
    conditions.push(`${alias}.deleted_at IS NULL`);
  }

  return conditions.length ? conditions.join(" AND ") : "1=1";
};

const ensureAdminReportIndexes = async () => {
  if (indexesEnsured) return;

  const statements = [
    "CREATE INDEX idx_songs_status_created_at ON songs(status, created_at)",
    "CREATE INDEX idx_songs_release_date ON songs(release_date)",
    "CREATE INDEX idx_artist_requests_created_status ON artist_requests(created_at, status)",
    "CREATE INDEX idx_users_role_is_active ON users(role, is_active)",
    "CREATE INDEX idx_albums_release_date ON albums(release_date)",
  ];

  for (const statement of statements) {
    try {
      await db.query(statement);
    } catch (error) {
      if (error?.code !== "ER_DUP_KEYNAME") {
        throw error;
      }
    }
  }

  indexesEnsured = true;
};

const normalizeInclude = (include) => {
  if (!include) {
    return [...SUPPORTED_INCLUDES];
  }

  const parsed = String(include)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value) => SUPPORTED_INCLUDES.has(value));

  return parsed.length ? [...new Set(parsed)] : [...SUPPORTED_INCLUDES];
};

const getCachedCharts = (cacheKey) => {
  const cached = chartsCache.get(cacheKey);
  if (!cached) return null;
  if (cached.expiresAt < Date.now()) {
    chartsCache.delete(cacheKey);
    return null;
  }
  return cached.data;
};

const setCachedCharts = (cacheKey, data) => {
  chartsCache.set(cacheKey, {
    data,
    expiresAt: Date.now() + CHARTS_CACHE_TTL_MS,
  });
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
    getCount("SELECT COUNT(*) AS count FROM songs WHERE is_deleted = 0"),
    getCount("SELECT COUNT(*) AS count FROM albums WHERE is_deleted = 0"),
    getCount(
      "SELECT COUNT(*) AS count FROM songs WHERE is_deleted = 0 AND status = ?",
      [SONG_STATUS.PENDING]
    ),
    getCount(
      "SELECT COUNT(*) AS count FROM songs WHERE is_deleted = 0 AND status = ?",
      [SONG_STATUS.APPROVED]
    ),
    getCount(
      "SELECT COUNT(*) AS count FROM songs WHERE is_deleted = 0 AND status = ?",
      [SONG_STATUS.REJECTED]
    ),
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

export const getWeeklyTopSongs = async (limit = 5) => getTopWeeklySongs(limit);

export const getAdminUserDetail = async (
  userId,
  { listening = {}, search = {} } = {}
) => {
  const [rows] = await db.query(
    `
    SELECT
      u.id,
      u.display_name,
      u.email,
      u.role,
      u.is_active,
      u.avatar_url,
      u.firebase_uid,
      u.auth_provider,
      u.artist_register_intent,
      u.created_at,
      u.updated_at
    FROM users u
    WHERE u.id = ?
    `,
    [userId]
  );

  const user = rows[0];
  if (!user) {
    throw createError(404, "User not found");
  }

  const [listeningHistory, searchHistory] = await Promise.all([
    getUserListeningHistory(userId, listening),
    listSearchHistory(userId, search),
  ]);

  return {
    profile: user,
    listening_history: listeningHistory,
    search_history: searchHistory,
  };
};

export const getAdminCharts = async ({ from, to, tz, bucket, include, weeklyLimit = 10 } = {}) => {
  await ensureAdminReportIndexes();

  const timezone = isValidIanaTimezone(tz) ? tz : DEFAULT_TZ;
  const toDate = to || getCurrentDateInTz(timezone);
  const fromDate = from || shiftDateString(toDate, -13);
  const safeBucket = bucket === "month" ? "month" : "day";
  const includedSections = normalizeInclude(include).sort();

  const cacheKey = [fromDate, toDate, timezone, safeBucket, includedSections.join(",")].join("|");
  const cached = getCachedCharts(cacheKey);
  if (cached) return cached;

  const songsSoftDelete = await buildSoftDeleteCondition("songs", "s");
  const usersSoftDelete = await buildSoftDeleteCondition("users", "u");
  const artistRequestsSoftDelete = await buildSoftDeleteCondition("artist_requests", "ar");
  const albumsSoftDelete = await buildSoftDeleteCondition("albums", "al");

  const response = {
    meta: {
      from: fromDate,
      to: toDate,
      tz: timezone,
      bucket: safeBucket,
    },
  };

  const fromStart = `${fromDate} 00:00:00`;
  const toEnd = `${toDate} 23:59:59`;

  if (includedSections.includes("song_status")) {
    const [rows] = await db.query(
      `
      SELECT status, COUNT(*) AS value
      FROM songs s
      WHERE ${songsSoftDelete}
        AND s.created_at >= CONVERT_TZ(?, ?, '+00:00')
        AND s.created_at <= CONVERT_TZ(?, ?, '+00:00')
      GROUP BY status
      `,
      [fromStart, timezone, toEnd, timezone]
    );

    const accumulator = {
      pending: 0,
      approved: 0,
      rejected: 0,
      other: 0,
    };

    for (const row of rows) {
      const key = ["pending", "approved", "rejected"].includes(row.status)
        ? row.status
        : "other";
      accumulator[key] += Number(row.value || 0);
    }

    response.song_status = Object.entries(accumulator).map(([key, value]) => ({
      key,
      value,
    }));
  }

  if (includedSections.includes("weekly_top")) {
    const topSongs = await getWeeklyTopSongs(weeklyLimit);
    response.weekly_top = topSongs.map((row) => ({
      song_id: row.id,
      title: row.title,
      artist_name: row.artist_name || "",
      score: Number(row.score || row.play_count || 0),
    }));
  }

  if (includedSections.includes("genre_status")) {
    const [rows] = await db.query(
      `
      SELECT
        g.name AS genre,
        SUM(CASE WHEN s.status = 'pending' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN s.status = 'approved' THEN 1 ELSE 0 END) AS approved,
        SUM(CASE WHEN s.status = 'rejected' THEN 1 ELSE 0 END) AS rejected,
        COUNT(*) AS total
      FROM song_genres sg
      JOIN genres g ON g.id = sg.genre_id
      JOIN songs s ON s.id = sg.song_id
      WHERE ${songsSoftDelete}
        AND s.created_at >= CONVERT_TZ(?, ?, '+00:00')
        AND s.created_at <= CONVERT_TZ(?, ?, '+00:00')
      GROUP BY g.id, g.name
      ORDER BY total DESC, g.name ASC
      `,
      [fromStart, timezone, toEnd, timezone]
    );

    response.genre_status = rows.map((row) => ({
      genre: row.genre,
      pending: Number(row.pending || 0),
      approved: Number(row.approved || 0),
      rejected: Number(row.rejected || 0),
      total: Number(row.total || 0),
    }));
  }

  if (includedSections.includes("user_distribution")) {
    const [[roleRows], [activityRows]] = await Promise.all([
      db.query(
        `
        SELECT role, COUNT(*) AS total
        FROM users u
        WHERE ${usersSoftDelete}
        GROUP BY role
        `
      ),
      db.query(
        `
        SELECT
          SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS active,
          SUM(CASE WHEN is_active = 0 THEN 1 ELSE 0 END) AS inactive
        FROM users u
        WHERE ${usersSoftDelete}
        `
      ),
    ]);

    const roleDistribution = { USER: 0, ARTIST: 0, ADMIN: 0 };
    for (const row of roleRows) {
      if (row.role in roleDistribution) {
        roleDistribution[row.role] = Number(row.total || 0);
      }
    }

    response.user_distribution = {
      role: roleDistribution,
      activity: {
        active: Number(activityRows[0]?.active || 0),
        inactive: Number(activityRows[0]?.inactive || 0),
      },
    };
  }

  if (includedSections.includes("artist_request_trend")) {
    const trendFormat = safeBucket === "month" ? "%Y-%m" : "%Y-%m-%d";
    const trendTimeline =
      safeBucket === "month"
        ? getMonthRange(fromDate.slice(0, 7), toDate.slice(0, 7))
        : getDateRange(fromDate, toDate);

    const [rows] = await db.query(
      `
      SELECT
        DATE_FORMAT(CONVERT_TZ(ar.created_at, '+00:00', ?), '${trendFormat}') AS bucket_key,
        COUNT(*) AS count
      FROM artist_requests ar
      WHERE ${artistRequestsSoftDelete}
        AND ar.created_at >= CONVERT_TZ(?, ?, '+00:00')
        AND ar.created_at <= CONVERT_TZ(?, ?, '+00:00')
      GROUP BY bucket_key
      ORDER BY bucket_key ASC
      `,
      [timezone, fromStart, timezone, toEnd, timezone]
    );

    const map = new Map(rows.map((row) => [row.bucket_key, Number(row.count || 0)]));

    response.artist_request_trend = trendTimeline.map((date) => ({
      date,
      count: map.get(date) || 0,
    }));
  }

  if (includedSections.includes("album_by_month")) {
    const monthTimeline = getMonthRange(fromDate.slice(0, 7), toDate.slice(0, 7));

    const [rows] = await db.query(
      `
      SELECT
        DATE_FORMAT(CONVERT_TZ(al.release_date, '+00:00', ?), '%Y-%m') AS month,
        COUNT(*) AS count
      FROM albums al
      WHERE ${albumsSoftDelete}
        AND al.release_date IS NOT NULL
        AND al.release_date >= CONVERT_TZ(?, ?, '+00:00')
        AND al.release_date <= CONVERT_TZ(?, ?, '+00:00')
      GROUP BY month
      ORDER BY month ASC
      `,
      [timezone, fromStart, timezone, toEnd, timezone]
    );

    const map = new Map(rows.map((row) => [row.month, Number(row.count || 0)]));

    response.album_by_month = monthTimeline.map((month) => ({
      month,
      count: map.get(month) || 0,
    }));
  }

  setCachedCharts(cacheKey, response);
  return response;
};

