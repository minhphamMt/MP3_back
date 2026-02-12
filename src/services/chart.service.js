import db from "../config/db.js";
import { REGION_GENRES } from "../constants/region-map.js";
/**
 * Zing Chart – Top 10 bài theo lượt nghe trong ngày
 */
export const getZingChart = async () => {
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
    WHERE s.status = 'approved'
    AND s.is_deleted = 0
    AND (ar.id IS NULL OR ar.is_deleted = 0)
    AND s.release_date IS NOT NULL
    AND s.release_date <= NOW()
    ORDER BY s.play_count DESC
    LIMIT 10
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

/**
 * New Release Chart – Bài mới phát hành
 */
export const getNewReleaseChart = async () => {
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
    WHERE s.status = 'approved'
    AND s.is_deleted = 0
    AND (ar.id IS NULL OR ar.is_deleted = 0)
    AND (al.id IS NULL OR al.is_deleted = 0)
    AND s.release_date IS NOT NULL
    AND s.release_date <= NOW()
    ORDER BY s.release_date DESC
    LIMIT 20
  `);

  return rows.map((row) => ({
    song: {
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
    },
    artist: row.artist_id
      ? {
          id: row.artist_id,
          name: row.artist_name,
        }
      : null,
  }));
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
    WHERE s.status = 'approved'
      AND s.is_deleted = 0
      AND (ar.id IS NULL OR ar.is_deleted = 0)
      AND s.release_date IS NOT NULL
      AND s.release_date <= NOW()
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

export const getRegionChart = async (regionKey, limit = 5) => {
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
      AND s.status = 'approved'
      AND s.is_deleted = 0
      AND (ar.id IS NULL OR ar.is_deleted = 0)
      AND (al.id IS NULL OR al.is_deleted = 0)
      AND s.release_date IS NOT NULL
      AND s.release_date <= NOW()
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

export const getTopWeeklySongs = async (limit = 5) => {
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
      AND sp.period_start = DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY)
      AND s.status = 'approved'
      AND s.is_deleted = 0
      AND a.is_deleted = 0
      AND s.release_date IS NOT NULL
      AND s.release_date <= NOW()
    ORDER BY sp.play_count DESC
    LIMIT ?
    `,
    [limit]
  );

  return rows;
};


export const getWeeklyTop5 = async () => {
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
        AND period_start = DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY)
      ORDER BY play_count DESC
      LIMIT 5
    ) w

    CROSS JOIN (
      SELECT CURDATE() - INTERVAL n DAY AS date
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
      WHERE s.is_deleted = 0
      AND a.is_deleted = 0
    ORDER BY w.song_id, d.date ASC
  `);

  return rows;
};

export const getTop50SongsByGenres = async () => {
  /**
   * 1️⃣ Lấy các genre có >= 50 bài approved
   */
  const [genres] = await db.query(`
    SELECT
      g.id,
      ANY_VALUE(g.name) AS name,
      COUNT(sg.song_id) AS song_count
    FROM genres g
    JOIN song_genres sg ON sg.genre_id = g.id
    JOIN songs s ON s.id = sg.song_id
    WHERE s.status = 'approved'
    AND s.is_deleted = 0
    AND s.release_date IS NOT NULL
    AND s.release_date <= NOW()
    GROUP BY g.id
    HAVING song_count >= 50
  `);

  if (!genres.length) return [];

  /**
   * 2️⃣ Với mỗi genre, lấy top 50 bài theo lượt nghe
   */
  const result = [];

  for (const genre of genres) {
    const [songs] = await db.query(
      `
      SELECT
        s.id,
        s.title,
        s.duration,
        s.cover_url,
        s.play_count,

        s.artist_id,
        ar.name AS artist_name,

        s.album_id,
        al.title AS album_title,
        al.cover_url AS album_cover_url,
        al.release_date AS album_release_date
      FROM songs s
      JOIN song_genres sg ON sg.song_id = s.id
      LEFT JOIN artists ar ON ar.id = s.artist_id
      LEFT JOIN albums al ON al.id = s.album_id
      WHERE
        sg.genre_id = ?
        AND s.status = 'approved'
        AND s.is_deleted = 0
        AND (ar.id IS NULL OR ar.is_deleted = 0)
        AND (al.id IS NULL OR al.is_deleted = 0)
        AND s.release_date IS NOT NULL
        AND s.release_date <= NOW()
      ORDER BY s.play_count DESC
      LIMIT 50
      `,
      [genre.id]
    );

    if (songs.length === 50) {
      result.push({
        genre: {
          id: genre.id,
          name: genre.name,
        },
        songs: songs.map((row, index) => ({
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
                release_date: row.album_release_date,
              }
            : null,
        })),
      });
    }
  }

  return result;
};



export default {
  getZingChart,
  getNewReleaseChart,
  getTop100Chart,
  getSongDailySeries,
  getRegionChart,
  getMultiRegionChart,
  getTopWeeklySongs,
  getWeeklyTop5,
  getTop50SongsByGenres
};
