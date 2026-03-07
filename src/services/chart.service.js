import db from "../config/db.js";
import { REGION_GENRES } from "../constants/region-map.js";
import { buildSongPublicVisibilityCondition } from "../utils/song-visibility.js";

const TOP50_BY_GENRE_CACHE_TTL_MS = 60 * 1000;
const ZING_CHART_PERIODS = new Set(["day", "week", "total"]);
const MAX_ZING_CHART_LIMIT = 100;
let top50ByGenreCache = null;

const getCachedTop50ByGenre = () => {
  if (!top50ByGenreCache) return null;

  if (top50ByGenreCache.expiresAt > Date.now()) {
    return top50ByGenreCache.data;
  }

  top50ByGenreCache = null;
  return null;
};

const setCachedTop50ByGenre = (data) => {
  top50ByGenreCache = {
    data,
    expiresAt: Date.now() + TOP50_BY_GENRE_CACHE_TTL_MS,
  };
};

const normalizeZingChartLimit = (limit = 10) =>
  Math.min(MAX_ZING_CHART_LIMIT, Math.max(1, Number(limit) || 10));

const normalizeZingChartPeriod = (period = "day") =>
  ZING_CHART_PERIODS.has(period) ? period : "day";

const mapChartSongRow = (row, index, period) => ({
  rank: index + 1,
  song: {
    id: row.id,
    title: row.title,
    cover_url: row.cover_url,
    duration: row.duration,
  },
  artist: row.artist_id
    ? { id: row.artist_id, name: row.artist_name }
    : null,
  playCount: Number(row.total_play_count ?? row.play_count ?? 0),
  periodPlayCount: Number(row.period_play_count ?? row.play_count ?? 0),
  period,
});

const getTopSongsByTotalPlayCount = async (limit, excludeIds = []) => {
  const normalizedExcludeIds = excludeIds
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0);

  const exclusionClause = normalizedExcludeIds.length
    ? ` AND s.id NOT IN (${normalizedExcludeIds.map(() => "?").join(",")})`
    : "";

  const [rows] = await db.query(
    `
    SELECT
      s.id,
      s.title,
      s.cover_url,
      s.duration,
      s.play_count AS total_play_count,
      ar.id AS artist_id,
      ar.name AS artist_name,
      0 AS period_play_count
    FROM songs s
    LEFT JOIN artists ar ON ar.id = s.artist_id
    WHERE ${buildSongPublicVisibilityCondition("s")}
      AND (ar.id IS NULL OR ar.is_deleted = 0)
      ${exclusionClause}
    ORDER BY s.play_count DESC, s.id DESC
    LIMIT ?
    `,
    [...normalizedExcludeIds, limit]
  );

  return rows;
};
/**
 * Zing Chart – Top 10 bài theo lượt nghe trong ngày
 */
export const getZingChart = async ({ limit = 10, period = "day" } = {}) => {
  const normalizedLimit = normalizeZingChartLimit(limit);
  const normalizedPeriod = normalizeZingChartPeriod(period);

  if (normalizedPeriod === "total") {
    const rows = await getTopSongsByTotalPlayCount(normalizedLimit);
    return rows.map((row, index) =>
      mapChartSongRow(row, index, normalizedPeriod)
    );
  }

  const periodStartExpression =
    normalizedPeriod === "week"
      ? "DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY)"
      : "CURDATE()";

  const [rows] = await db.query(
    `
    SELECT
      s.id,
      s.title,
      s.cover_url,
      s.duration,
      s.play_count AS total_play_count,
      sp.play_count AS period_play_count,
      ar.id AS artist_id,
      ar.name AS artist_name
    FROM song_play_stats sp
    JOIN songs s ON s.id = sp.song_id
    LEFT JOIN artists ar ON ar.id = s.artist_id
    WHERE sp.period_type = ?
      AND sp.period_start = ${periodStartExpression}
      AND ${buildSongPublicVisibilityCondition("s")}
      AND (ar.id IS NULL OR ar.is_deleted = 0)
    ORDER BY sp.play_count DESC, s.play_count DESC, s.id DESC
    LIMIT ?
    `,
    [normalizedPeriod, normalizedLimit]
  );

  if (rows.length >= normalizedLimit) {
    return rows.map((row, index) =>
      mapChartSongRow(row, index, normalizedPeriod)
    );
  }

  const supplementalRows = await getTopSongsByTotalPlayCount(
    normalizedLimit - rows.length,
    rows.map((row) => row.id)
  );

  return [...rows, ...supplementalRows].map((row, index) =>
    mapChartSongRow(row, index, normalizedPeriod)
  );
};

/**
 * New Release Chart – Bài mới phát hành
 */
export const getNewReleaseChart = async ({ page = 1, limit = 20 } = {}) => {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 20));
  const offset = (safePage - 1) * safeLimit;

  const [rows] = await db.query(`
    SELECT
      s.id,
      s.title,
      s.cover_url,
      s.duration,
      s.release_date,

      s.album_id,
      al.title AS album_title,

      ar.id AS artist_id,
      ar.name AS artist_name
    FROM songs s
    LEFT JOIN artists ar ON ar.id = s.artist_id
    LEFT JOIN albums al ON al.id = s.album_id
    WHERE ${buildSongPublicVisibilityCondition("s", { albumAlias: "al" })}
    AND (ar.id IS NULL OR ar.is_deleted = 0)
    ORDER BY s.release_date DESC
    LIMIT ? OFFSET ?
  `, [safeLimit, offset]);

  const songs = rows.map((row) => ({
    id: row.id,
    title: row.title,
    cover_url: row.cover_url,
    duration: row.duration,
    release_date: row.release_date,
    album: row.album_id
      ? {
          id: row.album_id,
          title: row.album_title,
        }
      : null,
    artist: row.artist_id
      ? {
          id: row.artist_id,
          name: row.artist_name,
        }
      : null,
  }));

  return {
    page: safePage,
    limit: safeLimit,
    songs,
    hasMore: songs.length === safeLimit,
  };
};


/**
 * Top 100 Chart – bài được nghe nhiều nhất
 */
export const getTop100Chart = async () => {
  const [rows] = await db.query(`
    SELECT
      s.id,
      s.title,
      s.cover_url,
      s.duration,
      s.play_count,
      ar.id AS artist_id,
      ar.name AS artist_name
    FROM songs s
    LEFT JOIN artists ar ON ar.id = s.artist_id
    WHERE ${buildSongPublicVisibilityCondition("s")}
      AND (ar.id IS NULL OR ar.is_deleted = 0)
    ORDER BY s.play_count DESC
    LIMIT 100
  `);

  return rows.map((row, index) => ({
    rank: index + 1,
    song: {
      id: row.id,
      title: row.title,
      cover_url: row.cover_url,
      duration: row.duration,
    },
    artist: row.artist_id
      ? { id: row.artist_id, name: row.artist_name }
      : null,
    playCount: row.play_count,
  }));
};
export const getSongDailySeries = async (songId, days = 7) => {
  const [rows] = await db.query(
    `
    SELECT
      DATE(listened_at) AS day,
      COUNT(*) AS plays
    FROM listening_history
    WHERE song_id = ?
      AND listened_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
    GROUP BY DATE(listened_at)
    ORDER BY day ASC
    `,
    [songId, days]
  );

  return rows;
};

const getRegionChart = async (regionKey, limit = 5) => {
  const genres = REGION_GENRES[regionKey];
  if (!genres) {
    throw new Error("Invalid region");
  }

  const placeholders = genres.map(() => "?").join(",");

  const [rows] = await db.query(
    `
    SELECT
      s.id,
      ANY_VALUE(s.title) AS title,
      ANY_VALUE(s.duration) AS duration,
      ANY_VALUE(s.play_count) AS play_count,
      ANY_VALUE(s.cover_url) AS cover_url,

      ANY_VALUE(ar.id) AS artist_id,
      ANY_VALUE(ar.name) AS artist_name,

      ANY_VALUE(s.album_id) AS album_id,
      ANY_VALUE(al.title) AS album_title,
      ANY_VALUE(al.cover_url) AS album_cover_url
    FROM songs s
    JOIN song_genres sg ON sg.song_id = s.id
    JOIN genres g ON g.id = sg.genre_id
    LEFT JOIN artists ar ON ar.id = s.artist_id
    LEFT JOIN albums al ON al.id = s.album_id
    WHERE g.name IN (${placeholders})
      AND ${buildSongPublicVisibilityCondition("s", { albumAlias: "al" })}
      AND (ar.id IS NULL OR ar.is_deleted = 0)
    GROUP BY s.id
    ORDER BY s.play_count DESC
    LIMIT ?;
    `,
    [...genres, Number(limit)]
  );

  return rows.map((row, index) => ({
    rank: index + 1,
    id: row.id,
    title: row.title,
    duration: row.duration,
    cover_url: row.cover_url,
    play_count: row.play_count,

    artist: row.artist_id
      ? {
          id: row.artist_id,
          name: row.artist_name,
        }
      : null,

    album: row.album_id
      ? {
          id: row.album_id,
          title: row.album_title,
          cover_url: row.album_cover_url,
        }
      : null,
  }));
};


export const getMultiRegionChart = async (limit = 5) => {
  const [vn, usuk, kpop] = await Promise.all([
    getRegionChart("VIETNAM", limit),
    getRegionChart("USUK", limit),
    getRegionChart("KPOP", limit),
  ]);

  return {
    vietnam: vn,
    usuk,
    kpop,
    updated_at: new Date(),
  };
};

const getLatestAvailableWeekStart = async () => {
  const [rows] = await db.query(`
    SELECT MAX(period_start) AS week_start
    FROM song_play_stats
    WHERE period_type = 'week'
      AND period_start <= DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY)
  `);

  return rows[0]?.week_start ?? null;
};

const getTopSongsFallback = async (limit) => {
  const [recentRows] = await db.query(
    `
    SELECT
      s.id,
      s.title,
      s.cover_url,
      s.duration,
      a.name AS artist_name,
      s.play_count AS weekly_play_count
    FROM songs s
    JOIN artists a ON a.id = s.artist_id
    WHERE ${buildSongPublicVisibilityCondition("s")}
      AND a.is_deleted = 0
      AND s.release_date >= DATE_SUB(CURDATE(), INTERVAL 3 MONTH)
    ORDER BY s.play_count DESC
    LIMIT ?
    `,
    [limit]
  );

  if (recentRows.length >= limit) {
    return recentRows;
  }

  const remain = limit - recentRows.length;
  const selectedIds = recentRows.map((row) => row.id);
  const placeholders = selectedIds.map(() => "?").join(",");

  const exclusionClause = selectedIds.length
    ? ` AND s.id NOT IN (${placeholders})`
    : "";

  const [extendedRows] = await db.query(
    `
    SELECT
      s.id,
      s.title,
      s.cover_url,
      s.duration,
      a.name AS artist_name,
      s.play_count AS weekly_play_count
    FROM songs s
    JOIN artists a ON a.id = s.artist_id
    WHERE ${buildSongPublicVisibilityCondition("s")}
      AND a.is_deleted = 0
      ${exclusionClause}
    ORDER BY s.play_count DESC
    LIMIT ?
    `,
    [...selectedIds, remain]
  );

  return [...recentRows, ...extendedRows];
};

export const getTopWeeklySongs = async (limit = 5) => {
  const weekStart = await getLatestAvailableWeekStart();

  if (!weekStart) {
    return getTopSongsFallback(limit);
  }

  const [rows] = await db.query(
    `
    SELECT
      s.id,
      s.title,
      s.cover_url,
      s.duration,
      a.name AS artist_name,
      sp.play_count AS weekly_play_count
    FROM song_play_stats sp
    JOIN songs s ON s.id = sp.song_id
    JOIN artists a ON a.id = s.artist_id
    WHERE sp.period_type = 'week'
      AND sp.period_start = ?
      AND ${buildSongPublicVisibilityCondition("s")}
      AND a.is_deleted = 0
    ORDER BY sp.play_count DESC
    LIMIT ?
    `,
    [weekStart, limit]
  );

  if (rows.length > 0) {
    return rows;
  }

  return getTopSongsFallback(limit);
};


export const getWeeklyTop5 = async () => {
  const weekStart = await getLatestAvailableWeekStart();

  if (!weekStart) {
    return [];
  }

  const [rows] = await db.query(`
    SELECT
      w.song_id,
      s.title,
      s.duration,
      s.cover_url,
      a.id   AS artist_id,
      a.name AS artist_name,
      d.date,
      COALESCE(sp.play_count, 0) AS play_count
    FROM (
      SELECT song_id
      FROM song_play_stats
      WHERE period_type = 'week'
        AND period_start = ?
      ORDER BY play_count DESC
      LIMIT 5
    ) w

    CROSS JOIN (
      SELECT ? + INTERVAL n DAY AS date
      FROM (
        SELECT 0 n UNION ALL SELECT 1 UNION ALL SELECT 2
        UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6
      ) nums
    ) d

    JOIN songs s ON s.id = w.song_id
    JOIN artists a ON a.id = s.artist_id

    LEFT JOIN song_play_stats sp
      ON sp.song_id = w.song_id
      AND sp.period_type = 'day'
      AND sp.period_start = d.date
      WHERE ${buildSongPublicVisibilityCondition("s")}
      AND a.is_deleted = 0
    ORDER BY w.song_id, d.date ASC
  `, [weekStart, weekStart]);

  return rows;
};

export const getTop50SongsByGenres = async () => {
  const cached = getCachedTop50ByGenre();
  if (cached) {
    return cached;
  }

  const [rows] = await db.query(`
    SELECT
      ranked.genre_id,
      ranked.genre_name,
      ranked.song_id,
      ranked.title,
      ranked.duration,
      ranked.cover_url,
      ranked.play_count,
      ranked.artist_id,
      ranked.artist_name,
      ranked.album_id,
      ranked.album_title,
      ranked.album_cover_url,
      ranked.album_release_date,
      ranked.rank_in_genre
    FROM (
      SELECT
        g.id AS genre_id,
        g.name AS genre_name,
        s.id AS song_id,
        s.title,
        s.duration,
        s.cover_url,
        s.play_count,
        ar.id AS artist_id,
        ar.name AS artist_name,
        al.id AS album_id,
        al.title AS album_title,
        al.cover_url AS album_cover_url,
        al.release_date AS album_release_date,
        ROW_NUMBER() OVER (
          PARTITION BY g.id
          ORDER BY s.play_count DESC, s.id DESC
        ) AS rank_in_genre,
        COUNT(*) OVER (PARTITION BY g.id) AS genre_song_count
      FROM songs s
      JOIN song_genres sg ON sg.song_id = s.id
      JOIN genres g ON g.id = sg.genre_id
      LEFT JOIN artists ar ON ar.id = s.artist_id
      LEFT JOIN albums al ON al.id = s.album_id
      WHERE ${buildSongPublicVisibilityCondition("s", { albumAlias: "al" })}
        AND (ar.id IS NULL OR ar.is_deleted = 0)
    ) ranked
    WHERE ranked.genre_song_count >= 50
      AND ranked.rank_in_genre <= 50
    ORDER BY ranked.genre_id ASC, ranked.rank_in_genre ASC
  `);

  const grouped = new Map();

  rows.forEach((row) => {
    if (!grouped.has(row.genre_id)) {
      grouped.set(row.genre_id, {
        genre: {
          id: row.genre_id,
          name: row.genre_name,
        },
        songs: [],
      });
    }

    const currentGenre = grouped.get(row.genre_id);
    currentGenre.songs.push({
      rank: row.rank_in_genre,
      id: row.song_id,
      title: row.title,
      duration: row.duration,
      cover_url: row.cover_url,
      play_count: row.play_count,
      artist: row.artist_id
        ? {
            id: row.artist_id,
            name: row.artist_name,
          }
        : null,
      album: row.album_id
        ? {
            id: row.album_id,
            title: row.album_title,
            cover_url: row.album_cover_url,
            release_date: row.album_release_date,
          }
        : null,
    });
  });

  const result = [...grouped.values()];
  setCachedTop50ByGenre(result);

  return result;
};



