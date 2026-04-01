USE music_platform;

-- Add a column to keep the uploaded lyric source file path/URL for a song.
-- Safe to rerun.

SET @schema_name := DATABASE();
SET @table_exists := (
  SELECT COUNT(*)
  FROM information_schema.tables
  WHERE table_schema = @schema_name
    AND table_name = 'songs'
);

SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = @schema_name
    AND table_name = 'songs'
    AND column_name = 'lyrics_path'
);

SET @sql := IF(
  @table_exists = 0,
  'SELECT ''songs table not found'' AS message',
  IF(
    @column_exists > 0,
    'SELECT ''songs.lyrics_path already exists'' AS message',
    "ALTER TABLE songs ADD COLUMN lyrics_path VARCHAR(1024) NULL AFTER audio_path"
  )
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SHOW FULL COLUMNS FROM songs;
