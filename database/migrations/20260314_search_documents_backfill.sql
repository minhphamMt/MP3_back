USE music_platform;

SET @previous_group_concat_max_len := @@SESSION.group_concat_max_len;
SET SESSION group_concat_max_len = GREATEST(@@SESSION.group_concat_max_len, 262144);


-- Backfill search_documents from songs, artists, and albums.
-- Safe to rerun because it uses ON DUPLICATE KEY UPDATE.
-- Note: current search_documents schema does not include user rows.

-- 1. Songs: public scope
INSERT INTO search_documents (
  entity_type,
  entity_id,
  scope,
  title,
  subtitle,
  primary_text,
  primary_text_norm,
  primary_text_compact,
  priority_text,
  priority_text_norm,
  match_text,
  match_text_norm,
  search_text,
  search_text_norm,
  popularity_score,
  freshness_score,
  is_active,
  source_updated_at
)
SELECT
  'song' AS entity_type,
  song_base.entity_id,
  'public' AS scope,
  song_base.title,
  NULLIF(song_base.subtitle, '') AS subtitle,
  song_base.primary_text,
  LEFT(COALESCE(LOWER(REGEXP_REPLACE(TRIM(song_base.primary_text), '[[:space:]]+', ' ')), ''), 512) AS primary_text_norm,
  LEFT(REPLACE(COALESCE(LOWER(REGEXP_REPLACE(TRIM(song_base.primary_text), '[[:space:]]+', ' ')), ''), ' ', ''), 512) AS primary_text_compact,
  NULLIF(song_base.priority_text, '') AS priority_text,
  NULLIF(COALESCE(LOWER(REGEXP_REPLACE(TRIM(song_base.priority_text), '[[:space:]]+', ' ')), ''), '') AS priority_text_norm,
  NULLIF(song_base.match_text, '') AS match_text,
  NULLIF(COALESCE(LOWER(REGEXP_REPLACE(TRIM(song_base.match_text), '[[:space:]]+', ' ')), ''), '') AS match_text_norm,
  song_base.search_text,
  COALESCE(LOWER(REGEXP_REPLACE(TRIM(song_base.search_text), '[[:space:]]+', ' ')), '') AS search_text_norm,
  song_base.popularity_score,
  song_base.freshness_score,
  song_base.is_active,
  song_base.source_updated_at
FROM (
  SELECT
    s.id AS entity_id,
    s.title AS title,
    COALESCE(sa_names.artist_names, a.name, '') AS subtitle,
    s.title AS primary_text,
    TRIM(CONCAT_WS(' ',
      COALESCE(sa_names.artist_names, a.name, ''),
      COALESCE(sa_names.artist_aliases, a.alias, ''),
      COALESCE(sa_names.artist_realnames, a.realname, '')
    )) AS priority_text,
    TRIM(CONCAT_WS(' ',
      COALESCE(al.title, ''),
      COALESCE(song_genre_names.genre_names, '')
    )) AS match_text,
    TRIM(CONCAT_WS(' ',
      s.title,
      COALESCE(sa_names.artist_names, a.name, ''),
      COALESCE(sa_names.artist_aliases, a.alias, ''),
      COALESCE(sa_names.artist_realnames, a.realname, ''),
      COALESCE(al.title, ''),
      COALESCE(song_genre_names.genre_names, '')
    )) AS search_text,
    (
      LOG(1 + GREATEST(COALESCE(s.play_count, 0), 0)) * 1.6 +
      LOG(1 + GREATEST(COALESCE(song_like_counts.like_count, 0), 0)) * 2.2 +
      CASE
        WHEN s.release_date IS NULL THEN 0
        WHEN DATEDIFF(CURDATE(), s.release_date) <= 30 THEN 2.5
        WHEN DATEDIFF(CURDATE(), s.release_date) <= 180 THEN 1.5
        WHEN DATEDIFF(CURDATE(), s.release_date) <= 365 THEN 0.75
        ELSE 0
      END
    ) AS popularity_score,
    CASE
      WHEN s.release_date IS NULL THEN 0
      WHEN DATEDIFF(CURDATE(), s.release_date) <= 30 THEN 2.5
      WHEN DATEDIFF(CURDATE(), s.release_date) <= 180 THEN 1.5
      WHEN DATEDIFF(CURDATE(), s.release_date) <= 365 THEN 0.75
      ELSE 0
    END AS freshness_score,
    CASE
      WHEN s.is_deleted = 0
        AND s.status = 'approved'
        AND s.release_date IS NOT NULL
        AND s.release_date <= NOW()
        AND (
          s.album_id IS NULL OR (
            al.id IS NOT NULL
            AND al.release_date IS NOT NULL
            AND al.release_date <= NOW()
          )
        )
      THEN 1 ELSE 0
    END AS is_active,
    COALESCE(s.reviewed_at, s.deleted_at, s.created_at) AS source_updated_at
  FROM songs s
  LEFT JOIN artists a ON a.id = s.artist_id AND a.is_deleted = 0
  LEFT JOIN albums al ON al.id = s.album_id AND al.is_deleted = 0
  LEFT JOIN (
    SELECT
      sa.song_id,
      GROUP_CONCAT(ar.name ORDER BY sa.sort_order ASC, sa.artist_id ASC SEPARATOR ' ') AS artist_names,
      GROUP_CONCAT(ar.alias ORDER BY sa.sort_order ASC, sa.artist_id ASC SEPARATOR ' ') AS artist_aliases,
      GROUP_CONCAT(ar.realname ORDER BY sa.sort_order ASC, sa.artist_id ASC SEPARATOR ' ') AS artist_realnames
    FROM song_artists sa
    JOIN artists ar ON ar.id = sa.artist_id
    WHERE ar.is_deleted = 0
    GROUP BY sa.song_id
  ) sa_names ON sa_names.song_id = s.id
  LEFT JOIN (
    SELECT song_id, COUNT(*) AS like_count
    FROM song_likes
    GROUP BY song_id
  ) song_like_counts ON song_like_counts.song_id = s.id
  LEFT JOIN (
    SELECT
      sg.song_id,
      GROUP_CONCAT(DISTINCT g.name ORDER BY g.name SEPARATOR ' ') AS genre_names
    FROM song_genres sg
    JOIN genres g ON g.id = sg.genre_id AND g.is_deleted = 0
    GROUP BY sg.song_id
  ) song_genre_names ON song_genre_names.song_id = s.id
) song_base
ON DUPLICATE KEY UPDATE
  title = VALUES(title),
  subtitle = VALUES(subtitle),
  primary_text = VALUES(primary_text),
  primary_text_norm = VALUES(primary_text_norm),
  primary_text_compact = VALUES(primary_text_compact),
  priority_text = VALUES(priority_text),
  priority_text_norm = VALUES(priority_text_norm),
  match_text = VALUES(match_text),
  match_text_norm = VALUES(match_text_norm),
  search_text = VALUES(search_text),
  search_text_norm = VALUES(search_text_norm),
  popularity_score = VALUES(popularity_score),
  freshness_score = VALUES(freshness_score),
  is_active = VALUES(is_active),
  source_updated_at = VALUES(source_updated_at),
  updated_at = CURRENT_TIMESTAMP;

-- 2. Songs: admin scope
INSERT INTO search_documents (
  entity_type,
  entity_id,
  scope,
  title,
  subtitle,
  primary_text,
  primary_text_norm,
  primary_text_compact,
  priority_text,
  priority_text_norm,
  match_text,
  match_text_norm,
  search_text,
  search_text_norm,
  popularity_score,
  freshness_score,
  is_active,
  source_updated_at
)
SELECT
  'song' AS entity_type,
  song_base.entity_id,
  'admin' AS scope,
  song_base.title,
  NULLIF(song_base.subtitle, '') AS subtitle,
  song_base.primary_text,
  LEFT(COALESCE(LOWER(REGEXP_REPLACE(TRIM(song_base.primary_text), '[[:space:]]+', ' ')), ''), 512) AS primary_text_norm,
  LEFT(REPLACE(COALESCE(LOWER(REGEXP_REPLACE(TRIM(song_base.primary_text), '[[:space:]]+', ' ')), ''), ' ', ''), 512) AS primary_text_compact,
  NULLIF(song_base.priority_text, '') AS priority_text,
  NULLIF(COALESCE(LOWER(REGEXP_REPLACE(TRIM(song_base.priority_text), '[[:space:]]+', ' ')), ''), '') AS priority_text_norm,
  NULLIF(song_base.match_text, '') AS match_text,
  NULLIF(COALESCE(LOWER(REGEXP_REPLACE(TRIM(song_base.match_text), '[[:space:]]+', ' ')), ''), '') AS match_text_norm,
  song_base.search_text,
  COALESCE(LOWER(REGEXP_REPLACE(TRIM(song_base.search_text), '[[:space:]]+', ' ')), '') AS search_text_norm,
  song_base.popularity_score,
  song_base.freshness_score,
  1 AS is_active,
  song_base.source_updated_at
FROM (
  SELECT
    s.id AS entity_id,
    s.title AS title,
    COALESCE(sa_names.artist_names, a.name, '') AS subtitle,
    s.title AS primary_text,
    TRIM(CONCAT_WS(' ',
      COALESCE(sa_names.artist_names, a.name, ''),
      COALESCE(sa_names.artist_aliases, a.alias, ''),
      COALESCE(sa_names.artist_realnames, a.realname, '')
    )) AS priority_text,
    TRIM(CONCAT_WS(' ',
      COALESCE(al.title, ''),
      COALESCE(song_genre_names.genre_names, '')
    )) AS match_text,
    TRIM(CONCAT_WS(' ',
      s.title,
      COALESCE(sa_names.artist_names, a.name, ''),
      COALESCE(sa_names.artist_aliases, a.alias, ''),
      COALESCE(sa_names.artist_realnames, a.realname, ''),
      COALESCE(al.title, ''),
      COALESCE(song_genre_names.genre_names, '')
    )) AS search_text,
    (
      LOG(1 + GREATEST(COALESCE(s.play_count, 0), 0)) * 1.6 +
      LOG(1 + GREATEST(COALESCE(song_like_counts.like_count, 0), 0)) * 2.2 +
      CASE
        WHEN s.release_date IS NULL THEN 0
        WHEN DATEDIFF(CURDATE(), s.release_date) <= 30 THEN 2.5
        WHEN DATEDIFF(CURDATE(), s.release_date) <= 180 THEN 1.5
        WHEN DATEDIFF(CURDATE(), s.release_date) <= 365 THEN 0.75
        ELSE 0
      END
    ) AS popularity_score,
    CASE
      WHEN s.release_date IS NULL THEN 0
      WHEN DATEDIFF(CURDATE(), s.release_date) <= 30 THEN 2.5
      WHEN DATEDIFF(CURDATE(), s.release_date) <= 180 THEN 1.5
      WHEN DATEDIFF(CURDATE(), s.release_date) <= 365 THEN 0.75
      ELSE 0
    END AS freshness_score,
    COALESCE(s.reviewed_at, s.deleted_at, s.created_at) AS source_updated_at
  FROM songs s
  LEFT JOIN artists a ON a.id = s.artist_id
  LEFT JOIN albums al ON al.id = s.album_id
  LEFT JOIN (
    SELECT
      sa.song_id,
      GROUP_CONCAT(ar.name ORDER BY sa.sort_order ASC, sa.artist_id ASC SEPARATOR ' ') AS artist_names,
      GROUP_CONCAT(ar.alias ORDER BY sa.sort_order ASC, sa.artist_id ASC SEPARATOR ' ') AS artist_aliases,
      GROUP_CONCAT(ar.realname ORDER BY sa.sort_order ASC, sa.artist_id ASC SEPARATOR ' ') AS artist_realnames
    FROM song_artists sa
    JOIN artists ar ON ar.id = sa.artist_id
    GROUP BY sa.song_id
  ) sa_names ON sa_names.song_id = s.id
  LEFT JOIN (
    SELECT song_id, COUNT(*) AS like_count
    FROM song_likes
    GROUP BY song_id
  ) song_like_counts ON song_like_counts.song_id = s.id
  LEFT JOIN (
    SELECT
      sg.song_id,
      GROUP_CONCAT(DISTINCT g.name ORDER BY g.name SEPARATOR ' ') AS genre_names
    FROM song_genres sg
    LEFT JOIN genres g ON g.id = sg.genre_id
    GROUP BY sg.song_id
  ) song_genre_names ON song_genre_names.song_id = s.id
) song_base
ON DUPLICATE KEY UPDATE
  title = VALUES(title),
  subtitle = VALUES(subtitle),
  primary_text = VALUES(primary_text),
  primary_text_norm = VALUES(primary_text_norm),
  primary_text_compact = VALUES(primary_text_compact),
  priority_text = VALUES(priority_text),
  priority_text_norm = VALUES(priority_text_norm),
  match_text = VALUES(match_text),
  match_text_norm = VALUES(match_text_norm),
  search_text = VALUES(search_text),
  search_text_norm = VALUES(search_text_norm),
  popularity_score = VALUES(popularity_score),
  freshness_score = VALUES(freshness_score),
  is_active = VALUES(is_active),
  source_updated_at = VALUES(source_updated_at),
  updated_at = CURRENT_TIMESTAMP;

-- 3. Artists: public scope
INSERT INTO search_documents (
  entity_type,
  entity_id,
  scope,
  title,
  subtitle,
  primary_text,
  primary_text_norm,
  primary_text_compact,
  priority_text,
  priority_text_norm,
  match_text,
  match_text_norm,
  search_text,
  search_text_norm,
  popularity_score,
  freshness_score,
  is_active,
  source_updated_at
)
SELECT
  'artist' AS entity_type,
  artist_base.entity_id,
  'public' AS scope,
  artist_base.title,
  NULLIF(artist_base.subtitle, '') AS subtitle,
  artist_base.primary_text,
  LEFT(COALESCE(LOWER(REGEXP_REPLACE(TRIM(artist_base.primary_text), '[[:space:]]+', ' ')), ''), 512) AS primary_text_norm,
  LEFT(REPLACE(COALESCE(LOWER(REGEXP_REPLACE(TRIM(artist_base.primary_text), '[[:space:]]+', ' ')), ''), ' ', ''), 512) AS primary_text_compact,
  NULLIF(artist_base.priority_text, '') AS priority_text,
  NULLIF(COALESCE(LOWER(REGEXP_REPLACE(TRIM(artist_base.priority_text), '[[:space:]]+', ' ')), ''), '') AS priority_text_norm,
  NULLIF(artist_base.match_text, '') AS match_text,
  NULLIF(COALESCE(LOWER(REGEXP_REPLACE(TRIM(artist_base.match_text), '[[:space:]]+', ' ')), ''), '') AS match_text_norm,
  artist_base.search_text,
  COALESCE(LOWER(REGEXP_REPLACE(TRIM(artist_base.search_text), '[[:space:]]+', ' ')), '') AS search_text_norm,
  artist_base.popularity_score,
  0 AS freshness_score,
  artist_base.is_active,
  artist_base.source_updated_at
FROM (
  SELECT
    a.id AS entity_id,
    a.name AS title,
    TRIM(CONCAT_WS(' ', COALESCE(a.alias, ''), COALESCE(a.realname, ''))) AS subtitle,
    a.name AS primary_text,
    TRIM(CONCAT_WS(' ', COALESCE(a.alias, ''), COALESCE(a.realname, ''))) AS priority_text,
    TRIM(CONCAT_WS(' ',
      COALESCE(song_stats.song_titles, ''),
      COALESCE(album_stats.album_titles, ''),
      COALESCE(genre_stats.genre_names, ''),
      COALESCE(a.national, '')
    )) AS match_text,
    TRIM(CONCAT_WS(' ',
      a.name,
      COALESCE(a.alias, ''),
      COALESCE(a.realname, ''),
      COALESCE(song_stats.song_titles, ''),
      COALESCE(album_stats.album_titles, ''),
      COALESCE(genre_stats.genre_names, ''),
      COALESCE(a.national, '')
    )) AS search_text,
    (
      LOG(1 + GREATEST(COALESCE(a.follow_count, 0), 0)) * 2.4 +
      LOG(1 + GREATEST(COALESCE(song_stats.song_count, 0), 0)) * 1.2
    ) AS popularity_score,
    CASE WHEN a.is_deleted = 0 THEN 1 ELSE 0 END AS is_active,
    COALESCE(a.deleted_at, a.created_at) AS source_updated_at
  FROM artists a
  LEFT JOIN (
    SELECT
      s.artist_id,
      COUNT(DISTINCT s.id) AS song_count,
      GROUP_CONCAT(DISTINCT s.title ORDER BY s.title SEPARATOR ' || ') AS song_titles
    FROM songs s
    LEFT JOIN albums al_song_visibility ON al_song_visibility.id = s.album_id
    WHERE s.is_deleted = 0
      AND s.status = 'approved'
      AND s.release_date IS NOT NULL
      AND s.release_date <= NOW()
      AND (
        s.album_id IS NULL OR (
          al_song_visibility.id IS NOT NULL
          AND al_song_visibility.is_deleted = 0
          AND al_song_visibility.release_date IS NOT NULL
          AND al_song_visibility.release_date <= NOW()
        )
      )
    GROUP BY s.artist_id
  ) song_stats ON song_stats.artist_id = a.id
  LEFT JOIN (
    SELECT
      al.artist_id,
      GROUP_CONCAT(DISTINCT al.title ORDER BY al.title SEPARATOR ' || ') AS album_titles
    FROM albums al
    WHERE al.is_deleted = 0
      AND al.release_date IS NOT NULL
      AND al.release_date <= NOW()
    GROUP BY al.artist_id
  ) album_stats ON album_stats.artist_id = a.id
  LEFT JOIN (
    SELECT
      s.artist_id,
      GROUP_CONCAT(DISTINCT g.name ORDER BY g.name SEPARATOR ' ') AS genre_names
    FROM songs s
    LEFT JOIN albums al_song_visibility ON al_song_visibility.id = s.album_id
    JOIN song_genres sg ON sg.song_id = s.id
    JOIN genres g ON g.id = sg.genre_id AND g.is_deleted = 0
    WHERE s.is_deleted = 0
      AND s.status = 'approved'
      AND s.release_date IS NOT NULL
      AND s.release_date <= NOW()
      AND (
        s.album_id IS NULL OR (
          al_song_visibility.id IS NOT NULL
          AND al_song_visibility.is_deleted = 0
          AND al_song_visibility.release_date IS NOT NULL
          AND al_song_visibility.release_date <= NOW()
        )
      )
    GROUP BY s.artist_id
  ) genre_stats ON genre_stats.artist_id = a.id
) artist_base
ON DUPLICATE KEY UPDATE
  title = VALUES(title),
  subtitle = VALUES(subtitle),
  primary_text = VALUES(primary_text),
  primary_text_norm = VALUES(primary_text_norm),
  primary_text_compact = VALUES(primary_text_compact),
  priority_text = VALUES(priority_text),
  priority_text_norm = VALUES(priority_text_norm),
  match_text = VALUES(match_text),
  match_text_norm = VALUES(match_text_norm),
  search_text = VALUES(search_text),
  search_text_norm = VALUES(search_text_norm),
  popularity_score = VALUES(popularity_score),
  freshness_score = VALUES(freshness_score),
  is_active = VALUES(is_active),
  source_updated_at = VALUES(source_updated_at),
  updated_at = CURRENT_TIMESTAMP;

-- 4. Artists: admin scope
INSERT INTO search_documents (
  entity_type,
  entity_id,
  scope,
  title,
  subtitle,
  primary_text,
  primary_text_norm,
  primary_text_compact,
  priority_text,
  priority_text_norm,
  match_text,
  match_text_norm,
  search_text,
  search_text_norm,
  popularity_score,
  freshness_score,
  is_active,
  source_updated_at
)
SELECT
  'artist' AS entity_type,
  artist_base.entity_id,
  'admin' AS scope,
  artist_base.title,
  NULLIF(artist_base.subtitle, '') AS subtitle,
  artist_base.primary_text,
  LEFT(COALESCE(LOWER(REGEXP_REPLACE(TRIM(artist_base.primary_text), '[[:space:]]+', ' ')), ''), 512) AS primary_text_norm,
  LEFT(REPLACE(COALESCE(LOWER(REGEXP_REPLACE(TRIM(artist_base.primary_text), '[[:space:]]+', ' ')), ''), ' ', ''), 512) AS primary_text_compact,
  NULLIF(artist_base.priority_text, '') AS priority_text,
  NULLIF(COALESCE(LOWER(REGEXP_REPLACE(TRIM(artist_base.priority_text), '[[:space:]]+', ' ')), ''), '') AS priority_text_norm,
  NULLIF(artist_base.match_text, '') AS match_text,
  NULLIF(COALESCE(LOWER(REGEXP_REPLACE(TRIM(artist_base.match_text), '[[:space:]]+', ' ')), ''), '') AS match_text_norm,
  artist_base.search_text,
  COALESCE(LOWER(REGEXP_REPLACE(TRIM(artist_base.search_text), '[[:space:]]+', ' ')), '') AS search_text_norm,
  artist_base.popularity_score,
  0 AS freshness_score,
  1 AS is_active,
  artist_base.source_updated_at
FROM (
  SELECT
    a.id AS entity_id,
    a.name AS title,
    TRIM(CONCAT_WS(' ', COALESCE(a.alias, ''), COALESCE(a.realname, ''))) AS subtitle,
    a.name AS primary_text,
    TRIM(CONCAT_WS(' ', COALESCE(a.alias, ''), COALESCE(a.realname, ''))) AS priority_text,
    TRIM(CONCAT_WS(' ',
      COALESCE(song_stats.song_titles, ''),
      COALESCE(album_stats.album_titles, ''),
      COALESCE(genre_stats.genre_names, ''),
      COALESCE(a.national, '')
    )) AS match_text,
    TRIM(CONCAT_WS(' ',
      a.name,
      COALESCE(a.alias, ''),
      COALESCE(a.realname, ''),
      COALESCE(song_stats.song_titles, ''),
      COALESCE(album_stats.album_titles, ''),
      COALESCE(genre_stats.genre_names, ''),
      COALESCE(a.national, '')
    )) AS search_text,
    (
      LOG(1 + GREATEST(COALESCE(a.follow_count, 0), 0)) * 2.4 +
      LOG(1 + GREATEST(COALESCE(song_stats.song_count, 0), 0)) * 1.2
    ) AS popularity_score,
    COALESCE(a.deleted_at, a.created_at) AS source_updated_at
  FROM artists a
  LEFT JOIN (
    SELECT
      s.artist_id,
      COUNT(DISTINCT s.id) AS song_count,
      GROUP_CONCAT(DISTINCT s.title ORDER BY s.title SEPARATOR ' || ') AS song_titles
    FROM songs s
    GROUP BY s.artist_id
  ) song_stats ON song_stats.artist_id = a.id
  LEFT JOIN (
    SELECT
      al.artist_id,
      GROUP_CONCAT(DISTINCT al.title ORDER BY al.title SEPARATOR ' || ') AS album_titles
    FROM albums al
    GROUP BY al.artist_id
  ) album_stats ON album_stats.artist_id = a.id
  LEFT JOIN (
    SELECT
      s.artist_id,
      GROUP_CONCAT(DISTINCT g.name ORDER BY g.name SEPARATOR ' ') AS genre_names
    FROM songs s
    JOIN song_genres sg ON sg.song_id = s.id
    LEFT JOIN genres g ON g.id = sg.genre_id
    GROUP BY s.artist_id
  ) genre_stats ON genre_stats.artist_id = a.id
) artist_base
ON DUPLICATE KEY UPDATE
  title = VALUES(title),
  subtitle = VALUES(subtitle),
  primary_text = VALUES(primary_text),
  primary_text_norm = VALUES(primary_text_norm),
  primary_text_compact = VALUES(primary_text_compact),
  priority_text = VALUES(priority_text),
  priority_text_norm = VALUES(priority_text_norm),
  match_text = VALUES(match_text),
  match_text_norm = VALUES(match_text_norm),
  search_text = VALUES(search_text),
  search_text_norm = VALUES(search_text_norm),
  popularity_score = VALUES(popularity_score),
  freshness_score = VALUES(freshness_score),
  is_active = VALUES(is_active),
  source_updated_at = VALUES(source_updated_at),
  updated_at = CURRENT_TIMESTAMP;

-- 5. Albums: public scope
INSERT INTO search_documents (
  entity_type,
  entity_id,
  scope,
  title,
  subtitle,
  primary_text,
  primary_text_norm,
  primary_text_compact,
  priority_text,
  priority_text_norm,
  match_text,
  match_text_norm,
  search_text,
  search_text_norm,
  popularity_score,
  freshness_score,
  is_active,
  source_updated_at
)
SELECT
  'album' AS entity_type,
  album_base.entity_id,
  'public' AS scope,
  album_base.title,
  NULLIF(album_base.subtitle, '') AS subtitle,
  album_base.primary_text,
  LEFT(COALESCE(LOWER(REGEXP_REPLACE(TRIM(album_base.primary_text), '[[:space:]]+', ' ')), ''), 512) AS primary_text_norm,
  LEFT(REPLACE(COALESCE(LOWER(REGEXP_REPLACE(TRIM(album_base.primary_text), '[[:space:]]+', ' ')), ''), ' ', ''), 512) AS primary_text_compact,
  NULLIF(album_base.priority_text, '') AS priority_text,
  NULLIF(COALESCE(LOWER(REGEXP_REPLACE(TRIM(album_base.priority_text), '[[:space:]]+', ' ')), ''), '') AS priority_text_norm,
  NULLIF(album_base.match_text, '') AS match_text,
  NULLIF(COALESCE(LOWER(REGEXP_REPLACE(TRIM(album_base.match_text), '[[:space:]]+', ' ')), ''), '') AS match_text_norm,
  album_base.search_text,
  COALESCE(LOWER(REGEXP_REPLACE(TRIM(album_base.search_text), '[[:space:]]+', ' ')), '') AS search_text_norm,
  album_base.popularity_score,
  album_base.freshness_score,
  album_base.is_active,
  album_base.source_updated_at
FROM (
  SELECT
    al.id AS entity_id,
    al.title AS title,
    COALESCE(ar.name, '') AS subtitle,
    al.title AS primary_text,
    TRIM(CONCAT_WS(' ', COALESCE(ar.name, ''), COALESCE(ar.alias, ''), COALESCE(ar.realname, ''))) AS priority_text,
    TRIM(CONCAT_WS(' ',
      COALESCE(song_stats.song_titles, ''),
      COALESCE(song_stats.genre_names, '')
    )) AS match_text,
    TRIM(CONCAT_WS(' ',
      al.title,
      COALESCE(ar.name, ''),
      COALESCE(ar.alias, ''),
      COALESCE(ar.realname, ''),
      COALESCE(song_stats.song_titles, ''),
      COALESCE(song_stats.genre_names, '')
    )) AS search_text,
    (
      LOG(1 + GREATEST(COALESCE(album_like_counts.like_count, 0), 0)) * 2.1 +
      LOG(1 + GREATEST(COALESCE(song_stats.song_count, 0), 0)) * 1 +
      CASE
        WHEN al.release_date IS NULL THEN 0
        WHEN DATEDIFF(CURDATE(), al.release_date) <= 30 THEN 2.5
        WHEN DATEDIFF(CURDATE(), al.release_date) <= 180 THEN 1.5
        WHEN DATEDIFF(CURDATE(), al.release_date) <= 365 THEN 0.75
        ELSE 0
      END
    ) AS popularity_score,
    CASE
      WHEN al.release_date IS NULL THEN 0
      WHEN DATEDIFF(CURDATE(), al.release_date) <= 30 THEN 2.5
      WHEN DATEDIFF(CURDATE(), al.release_date) <= 180 THEN 1.5
      WHEN DATEDIFF(CURDATE(), al.release_date) <= 365 THEN 0.75
      ELSE 0
    END AS freshness_score,
    CASE
      WHEN al.is_deleted = 0
        AND al.release_date IS NOT NULL
        AND al.release_date <= NOW()
      THEN 1 ELSE 0
    END AS is_active,
    COALESCE(al.deleted_at, al.created_at) AS source_updated_at
  FROM albums al
  LEFT JOIN artists ar ON ar.id = al.artist_id AND ar.is_deleted = 0
  LEFT JOIN (
    SELECT album_id, COUNT(*) AS like_count
    FROM album_likes
    GROUP BY album_id
  ) album_like_counts ON album_like_counts.album_id = al.id
  LEFT JOIN (
    SELECT
      s.album_id,
      COUNT(DISTINCT s.id) AS song_count,
      GROUP_CONCAT(DISTINCT s.title ORDER BY s.title SEPARATOR ' || ') AS song_titles,
      GROUP_CONCAT(DISTINCT g.name ORDER BY g.name SEPARATOR ' ') AS genre_names
    FROM songs s
    LEFT JOIN albums al_song_visibility ON al_song_visibility.id = s.album_id
    LEFT JOIN song_genres sg ON sg.song_id = s.id
    LEFT JOIN genres g ON g.id = sg.genre_id AND g.is_deleted = 0
    WHERE s.is_deleted = 0
      AND s.status = 'approved'
      AND s.release_date IS NOT NULL
      AND s.release_date <= NOW()
      AND (
        s.album_id IS NULL OR (
          al_song_visibility.id IS NOT NULL
          AND al_song_visibility.is_deleted = 0
          AND al_song_visibility.release_date IS NOT NULL
          AND al_song_visibility.release_date <= NOW()
        )
      )
    GROUP BY s.album_id
  ) song_stats ON song_stats.album_id = al.id
) album_base
ON DUPLICATE KEY UPDATE
  title = VALUES(title),
  subtitle = VALUES(subtitle),
  primary_text = VALUES(primary_text),
  primary_text_norm = VALUES(primary_text_norm),
  primary_text_compact = VALUES(primary_text_compact),
  priority_text = VALUES(priority_text),
  priority_text_norm = VALUES(priority_text_norm),
  match_text = VALUES(match_text),
  match_text_norm = VALUES(match_text_norm),
  search_text = VALUES(search_text),
  search_text_norm = VALUES(search_text_norm),
  popularity_score = VALUES(popularity_score),
  freshness_score = VALUES(freshness_score),
  is_active = VALUES(is_active),
  source_updated_at = VALUES(source_updated_at),
  updated_at = CURRENT_TIMESTAMP;

-- 6. Albums: admin scope
INSERT INTO search_documents (
  entity_type,
  entity_id,
  scope,
  title,
  subtitle,
  primary_text,
  primary_text_norm,
  primary_text_compact,
  priority_text,
  priority_text_norm,
  match_text,
  match_text_norm,
  search_text,
  search_text_norm,
  popularity_score,
  freshness_score,
  is_active,
  source_updated_at
)
SELECT
  'album' AS entity_type,
  album_base.entity_id,
  'admin' AS scope,
  album_base.title,
  NULLIF(album_base.subtitle, '') AS subtitle,
  album_base.primary_text,
  LEFT(COALESCE(LOWER(REGEXP_REPLACE(TRIM(album_base.primary_text), '[[:space:]]+', ' ')), ''), 512) AS primary_text_norm,
  LEFT(REPLACE(COALESCE(LOWER(REGEXP_REPLACE(TRIM(album_base.primary_text), '[[:space:]]+', ' ')), ''), ' ', ''), 512) AS primary_text_compact,
  NULLIF(album_base.priority_text, '') AS priority_text,
  NULLIF(COALESCE(LOWER(REGEXP_REPLACE(TRIM(album_base.priority_text), '[[:space:]]+', ' ')), ''), '') AS priority_text_norm,
  NULLIF(album_base.match_text, '') AS match_text,
  NULLIF(COALESCE(LOWER(REGEXP_REPLACE(TRIM(album_base.match_text), '[[:space:]]+', ' ')), ''), '') AS match_text_norm,
  album_base.search_text,
  COALESCE(LOWER(REGEXP_REPLACE(TRIM(album_base.search_text), '[[:space:]]+', ' ')), '') AS search_text_norm,
  album_base.popularity_score,
  album_base.freshness_score,
  1 AS is_active,
  album_base.source_updated_at
FROM (
  SELECT
    al.id AS entity_id,
    al.title AS title,
    COALESCE(ar.name, '') AS subtitle,
    al.title AS primary_text,
    TRIM(CONCAT_WS(' ', COALESCE(ar.name, ''), COALESCE(ar.alias, ''), COALESCE(ar.realname, ''))) AS priority_text,
    TRIM(CONCAT_WS(' ',
      COALESCE(song_stats.song_titles, ''),
      COALESCE(song_stats.genre_names, '')
    )) AS match_text,
    TRIM(CONCAT_WS(' ',
      al.title,
      COALESCE(ar.name, ''),
      COALESCE(ar.alias, ''),
      COALESCE(ar.realname, ''),
      COALESCE(song_stats.song_titles, ''),
      COALESCE(song_stats.genre_names, '')
    )) AS search_text,
    (
      LOG(1 + GREATEST(COALESCE(album_like_counts.like_count, 0), 0)) * 2.1 +
      LOG(1 + GREATEST(COALESCE(song_stats.song_count, 0), 0)) * 1 +
      CASE
        WHEN al.release_date IS NULL THEN 0
        WHEN DATEDIFF(CURDATE(), al.release_date) <= 30 THEN 2.5
        WHEN DATEDIFF(CURDATE(), al.release_date) <= 180 THEN 1.5
        WHEN DATEDIFF(CURDATE(), al.release_date) <= 365 THEN 0.75
        ELSE 0
      END
    ) AS popularity_score,
    CASE
      WHEN al.release_date IS NULL THEN 0
      WHEN DATEDIFF(CURDATE(), al.release_date) <= 30 THEN 2.5
      WHEN DATEDIFF(CURDATE(), al.release_date) <= 180 THEN 1.5
      WHEN DATEDIFF(CURDATE(), al.release_date) <= 365 THEN 0.75
      ELSE 0
    END AS freshness_score,
    COALESCE(al.deleted_at, al.created_at) AS source_updated_at
  FROM albums al
  LEFT JOIN artists ar ON ar.id = al.artist_id
  LEFT JOIN (
    SELECT album_id, COUNT(*) AS like_count
    FROM album_likes
    GROUP BY album_id
  ) album_like_counts ON album_like_counts.album_id = al.id
  LEFT JOIN (
    SELECT
      s.album_id,
      COUNT(DISTINCT s.id) AS song_count,
      GROUP_CONCAT(DISTINCT s.title ORDER BY s.title SEPARATOR ' || ') AS song_titles,
      GROUP_CONCAT(DISTINCT g.name ORDER BY g.name SEPARATOR ' ') AS genre_names
    FROM songs s
    LEFT JOIN song_genres sg ON sg.song_id = s.id
    LEFT JOIN genres g ON g.id = sg.genre_id
    GROUP BY s.album_id
  ) song_stats ON song_stats.album_id = al.id
) album_base
ON DUPLICATE KEY UPDATE
  title = VALUES(title),
  subtitle = VALUES(subtitle),
  primary_text = VALUES(primary_text),
  primary_text_norm = VALUES(primary_text_norm),
  primary_text_compact = VALUES(primary_text_compact),
  priority_text = VALUES(priority_text),
  priority_text_norm = VALUES(priority_text_norm),
  match_text = VALUES(match_text),
  match_text_norm = VALUES(match_text_norm),
  search_text = VALUES(search_text),
  search_text_norm = VALUES(search_text_norm),
  popularity_score = VALUES(popularity_score),
  freshness_score = VALUES(freshness_score),
  is_active = VALUES(is_active),
  source_updated_at = VALUES(source_updated_at),
  updated_at = CURRENT_TIMESTAMP;

-- 7. Cleanup rows whose source records no longer exist.
DELETE sd
FROM search_documents sd
LEFT JOIN songs s
  ON sd.entity_type = 'song'
 AND sd.entity_id = s.id
WHERE sd.entity_type = 'song'
  AND s.id IS NULL;

DELETE sd
FROM search_documents sd
LEFT JOIN artists a
  ON sd.entity_type = 'artist'
 AND sd.entity_id = a.id
WHERE sd.entity_type = 'artist'
  AND a.id IS NULL;

DELETE sd
FROM search_documents sd
LEFT JOIN albums al
  ON sd.entity_type = 'album'
 AND sd.entity_id = al.id
WHERE sd.entity_type = 'album'
  AND al.id IS NULL;

ANALYZE TABLE search_documents;

SELECT scope, entity_type, COUNT(*) AS total_rows, SUM(is_active) AS active_rows
FROM search_documents
GROUP BY scope, entity_type
ORDER BY scope, entity_type;

SET SESSION group_concat_max_len = @previous_group_concat_max_len;




