USE music_platform;

-- Backup first, then run this once in a maintenance window.
-- If a previous run already created `keyword_norm`, skip the ADD COLUMN statement
-- and continue from the UPDATE statement below.

-- 1. Search history: keep one normalized row per user + keyword.
ALTER TABLE search_history
  ADD COLUMN keyword_norm VARCHAR(255) NULL AFTER keyword;

UPDATE search_history
SET keyword_norm = LOWER(REGEXP_REPLACE(TRIM(keyword), '\\s+', ' '))
WHERE keyword_norm IS NULL;

DELETE sh_old
FROM search_history sh_old
JOIN search_history sh_newer
  ON sh_old.user_id = sh_newer.user_id
 AND sh_old.keyword_norm = sh_newer.keyword_norm
 AND sh_old.id < sh_newer.id;

ALTER TABLE search_history
  ADD UNIQUE KEY uq_search_history_user_keyword_norm (user_id, keyword_norm),
  ADD KEY idx_search_history_user_searched (user_id, searched_at DESC, id DESC);

-- 2. Search index build helpers.
ALTER TABLE song_likes
  ADD KEY idx_song_likes_song_user (song_id, user_id);

ALTER TABLE album_likes
  ADD KEY idx_album_likes_album_user (album_id, user_id);

ALTER TABLE song_artists
  ADD KEY idx_song_artists_song_sort (song_id, sort_order, artist_id),
  ADD KEY idx_song_artists_artist_song (artist_id, song_id);

ALTER TABLE albums
  ADD KEY idx_albums_search_visibility (is_deleted, release_date, artist_id, id);

ANALYZE TABLE
  search_history,
  song_likes,
  album_likes,
  song_artists,
  songs,
  albums,
  artists;
