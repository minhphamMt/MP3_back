import db from "../config/db.js";

const DEFAULT_DAYS = 30;
const EVENT_TIME_FIELD = "lh.listened_at";
const SUPPORTED_INTERVALS = ["day", "week", "month"];

const createError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const formatDate = (date) => date.toISOString().split("T")[0];

const normalizeInterval = (value) =>
  SUPPORTED_INTERVALS.includes(value) ? value : "day";

const addInterval = (date, interval) => {
  const next = new Date(date);

  switch (interval) {
    case "week":
      next.setDate(next.getDate() + 7);
      break;
    case "month":
      next.setMonth(next.getMonth() + 1);
      break;
    default:
      next.setDate(next.getDate() + 1);
      break;
  }

  return next;
};

const normalizePeriodStart = (date, interval) => {
  const normalized = new Date(date);

  switch (interval) {
    case "week": {
      const day = normalized.getDay() || 7; // 1..7, Monday = 1
      normalized.setDate(normalized.getDate() - day + 1);
      normalized.setHours(0, 0, 0, 0);
      break;
    }
    case "month":
      normalized.setDate(1);
      normalized.setHours(0, 0, 0, 0);
      break;
    default:
      normalized.setHours(0, 0, 0, 0);
      break;
  }

  return formatDate(normalized);
};

const parseDateInput = (value, fieldName) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw createError(400, `Invalid ${fieldName}`);
  }
  return parsed;
};

const normalizeDateRange = (startDate, endDate) => {
  const end = parseDateInput(endDate, "endDate") || new Date();
  const start =
    parseDateInput(startDate, "startDate") ||
    new Date(end.getTime() - (DEFAULT_DAYS - 1) * 24 * 60 * 60 * 1000);

  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  if (start > end) {
    throw createError(400, "startDate must be before endDate");
  }

  return { start, end };
};

const parseLimit = (value) => {
  const numeric = Number(value);
  if (Number.isNaN(numeric) || numeric <= 0) return 10;
  return Math.min(numeric, 50);
};

const getIntervalExpression = (interval) => {
  switch (interval) {
    case "week":
      return `DATE_SUB(DATE(${EVENT_TIME_FIELD}), INTERVAL WEEKDAY(${EVENT_TIME_FIELD}) DAY)`;
    case "month":
      return `DATE_FORMAT(${EVENT_TIME_FIELD}, '%Y-%m-01')`;
    default:
      return `DATE(${EVENT_TIME_FIELD})`;
  }
};

const buildTimeBuckets = (start, end, interval) => {
  const buckets = [];
  let cursor = new Date(start);

  while (cursor <= end) {
    buckets.push(normalizePeriodStart(cursor, interval));
    cursor = addInterval(cursor, interval);
  }

  return buckets;
};

const mapSeriesRows = (rows, keyField) => {
  const seriesMap = new Map();

  rows.forEach((row) => {
    const key = row[keyField];
    const period =
      typeof row.period_start === "string"
        ? row.period_start.slice(0, 10)
        : formatDate(row.period_start);

    if (!seriesMap.has(key)) {
      seriesMap.set(key, new Map());
    }

    seriesMap.get(key).set(period, {
      plays: Number(row.plays) || 0,
      duration: Number(row.duration) || 0,
    });
  });

  return seriesMap;
};

const baseRangeResponse = (start, end, interval) => ({
  range: {
    start: formatDate(start),
    end: formatDate(end),
    interval,
  },
});

export const getTopSongsAnalytics = async ({
  startDate,
  endDate,
  interval,
  limit,
}) => {
  const normalizedInterval = normalizeInterval(interval);
  const { start, end } = normalizeDateRange(startDate, endDate);
  const intervalExpr = getIntervalExpression(normalizedInterval);
  const parsedLimit = parseLimit(limit);

  const [topRows] = await db.query(
    `
    SELECT
      lh.song_id,
      ANY_VALUE(s.title) AS title,
      ANY_VALUE(s.artist_id) AS artist_id,
      ANY_VALUE(ar.name) AS artist_name,
      COUNT(*) AS total_plays,
      COALESCE(SUM(lh.duration), 0) AS total_duration
    FROM listening_history lh
    JOIN songs s ON s.id = lh.song_id
    LEFT JOIN artists ar ON ar.id = s.artist_id
    WHERE ${EVENT_TIME_FIELD} BETWEEN ? AND ?
    AND s.is_deleted = 0
    AND (ar.id IS NULL OR ar.is_deleted = 0)
    GROUP BY lh.song_id
    ORDER BY total_plays DESC
    LIMIT ?;
  `,
    [start, end, parsedLimit]
  );

  const buckets = buildTimeBuckets(start, end, normalizedInterval);

  if (!topRows.length) {
    return { ...baseRangeResponse(start, end, normalizedInterval), items: [] };
  }

  const songIds = topRows.map((row) => row.song_id);
  const placeholders = songIds.map(() => "?").join(",");

  const [seriesRows] = await db.query(
    `
    SELECT
      lh.song_id,
      ${intervalExpr} AS period_start,
      COUNT(*) AS plays,
      COALESCE(SUM(lh.duration), 0) AS duration
    FROM listening_history lh
    JOIN songs s ON s.id = lh.song_id
    WHERE ${EVENT_TIME_FIELD} BETWEEN ? AND ?
      AND lh.song_id IN (${placeholders})
      AND s.is_deleted = 0
    GROUP BY lh.song_id, period_start
    ORDER BY period_start ASC;
  `,
    [start, end, ...songIds]
  );

  const seriesMap = mapSeriesRows(seriesRows, "song_id");

  return {
    ...baseRangeResponse(start, end, normalizedInterval),
    items: topRows.map((row) => {
      const base = {
        id: row.song_id,
        totalPlays: Number(row.total_plays) || 0,
        totalDuration: Number(row.total_duration) || 0,
        song: {
          id: row.song_id,
          title: row.title,
        },
        artist: row.artist_id
          ? { id: row.artist_id, name: row.artist_name }
          : null,
      };

      return {
        ...base,
        series: buckets.map((period) => ({
          period,
          plays: seriesMap.get(base.id)?.get(period)?.plays || 0,
          duration: seriesMap.get(base.id)?.get(period)?.duration || 0,
        })),
      };
    }),
  };
};

export const getTopArtistsAnalytics = async ({
  startDate,
  endDate,
  interval,
  limit,
}) => {
  const normalizedInterval = normalizeInterval(interval);
  const { start, end } = normalizeDateRange(startDate, endDate);
  const intervalExpr = getIntervalExpression(normalizedInterval);
  const parsedLimit = parseLimit(limit);

  const [topRows] = await db.query(
    `
    SELECT
      s.artist_id,
      ANY_VALUE(ar.name) AS artist_name,
     COUNT(*) AS total_plays,
      COALESCE(SUM(lh.duration), 0) AS total_duration
    FROM listening_history lh
    JOIN songs s ON s.id = lh.song_id
    JOIN artists ar ON ar.id = s.artist_id
    WHERE ${EVENT_TIME_FIELD} BETWEEN ? AND ?
      AND s.artist_id IS NOT NULL
      AND s.is_deleted = 0
      AND ar.is_deleted = 0
    GROUP BY s.artist_id
    ORDER BY total_plays DESC
    LIMIT ?;
  `,
    [start, end, parsedLimit]
  );

  const buckets = buildTimeBuckets(start, end, normalizedInterval);

  if (!topRows.length) {
    return { ...baseRangeResponse(start, end, normalizedInterval), items: [] };
  }

  const artistIds = topRows.map((row) => row.artist_id);
  const placeholders = artistIds.map(() => "?").join(",");

  const [seriesRows] = await db.query(
    `
    SELECT
      s.artist_id,
      ${intervalExpr} AS period_start,
       COUNT(*) AS plays,
      COALESCE(SUM(lh.duration), 0) AS duration
    FROM listening_history lh
    JOIN songs s ON s.id = lh.song_id
    WHERE ${EVENT_TIME_FIELD} BETWEEN ? AND ?
      AND s.artist_id IN (${placeholders})
      AND s.is_deleted = 0
    GROUP BY s.artist_id, period_start
    ORDER BY period_start ASC;
  `,
    [start, end, ...artistIds]
  );

  const seriesMap = mapSeriesRows(seriesRows, "artist_id");

  return {
    ...baseRangeResponse(start, end, normalizedInterval),
    items: topRows.map((row) => {
      const base = {
        id: row.artist_id,
        totalPlays: Number(row.total_plays) || 0,
        totalDuration: Number(row.total_duration) || 0,
        artist: { id: row.artist_id, name: row.artist_name },
      };

      return {
        ...base,
        series: buckets.map((period) => ({
          period,
          plays: seriesMap.get(base.id)?.get(period)?.plays || 0,
          duration: seriesMap.get(base.id)?.get(period)?.duration || 0,
        })),
      };
    }),
  };
};

export const getTopGenresAnalytics = async ({
  startDate,
  endDate,
  interval,
  limit,
}) => {
  const normalizedInterval = normalizeInterval(interval);
  const { start, end } = normalizeDateRange(startDate, endDate);
  const intervalExpr = getIntervalExpression(normalizedInterval);
  const parsedLimit = parseLimit(limit);

  const [topRows] = await db.query(
    `
    SELECT
      g.id AS genre_id,
      ANY_VALUE(g.name) AS genre_name,
      COUNT(*) AS total_plays,
      COALESCE(SUM(lh.duration), 0) AS total_duration
    FROM listening_history lh
    JOIN songs s ON s.id = lh.song_id
    JOIN song_genres sg ON sg.song_id = lh.song_id
    JOIN genres g ON g.id = sg.genre_id
    WHERE ${EVENT_TIME_FIELD} BETWEEN ? AND ?
    AND s.is_deleted = 0
    AND g.is_deleted = 0
    GROUP BY g.id
    ORDER BY total_plays DESC
    LIMIT ?;
  `,
    [start, end, parsedLimit]
  );

  const buckets = buildTimeBuckets(start, end, normalizedInterval);

  if (!topRows.length) {
    return { ...baseRangeResponse(start, end, normalizedInterval), items: [] };
  }

  const genreIds = topRows.map((row) => row.genre_id);
  const placeholders = genreIds.map(() => "?").join(",");

  const [seriesRows] = await db.query(
    `
    SELECT
      g.id AS genre_id,
      ${intervalExpr} AS period_start,
       COUNT(*) AS plays,
      COALESCE(SUM(lh.duration), 0) AS duration
    FROM listening_history lh
    JOIN songs s ON s.id = lh.song_id
    JOIN song_genres sg ON sg.song_id = lh.song_id
    JOIN genres g ON g.id = sg.genre_id
    WHERE ${EVENT_TIME_FIELD} BETWEEN ? AND ?
      AND g.id IN (${placeholders})
      AND s.is_deleted = 0
      AND g.is_deleted = 0
    GROUP BY g.id, period_start
    ORDER BY period_start ASC;
  `,
    [start, end, ...genreIds]
  );

  const seriesMap = mapSeriesRows(seriesRows, "genre_id");

  return {
    ...baseRangeResponse(start, end, normalizedInterval),
    items: topRows.map((row) => {
      const base = {
        id: row.genre_id,
        totalPlays: Number(row.total_plays) || 0,
        totalDuration: Number(row.total_duration) || 0,
        genre: { id: row.genre_id, name: row.genre_name },
      };

      return {
        ...base,
        series: buckets.map((period) => ({
          period,
          plays: seriesMap.get(base.id)?.get(period)?.plays || 0,
          duration: seriesMap.get(base.id)?.get(period)?.duration || 0,
        })),
      };
    }),
  };
};

export default {
  getTopSongsAnalytics,
  getTopArtistsAnalytics,
  getTopGenresAnalytics,
};
