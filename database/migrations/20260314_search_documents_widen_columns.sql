USE music_platform;

-- Widen search_documents columns for longer song/artist/album names.
-- Safe to rerun.

SET @schema_name := DATABASE();
SET @table_exists := (
  SELECT COUNT(*)
  FROM information_schema.tables
  WHERE table_schema = @schema_name
    AND table_name = 'search_documents'
);

SET @needs_alter := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = @schema_name
    AND table_name = 'search_documents'
    AND (
      (column_name = 'title' AND data_type <> 'text')
      OR (column_name = 'subtitle' AND data_type <> 'text')
      OR (column_name = 'primary_text' AND data_type <> 'text')
      OR (column_name = 'primary_text_norm' AND (character_maximum_length IS NULL OR character_maximum_length < 512))
      OR (column_name = 'primary_text_compact' AND (character_maximum_length IS NULL OR character_maximum_length < 512))
    )
);

SET @sql := IF(
  @table_exists = 0,
  'SELECT ''search_documents table not found'' AS message',
  IF(
    @needs_alter = 0,
    'SELECT ''search_documents columns already widened'' AS message',
    "ALTER TABLE search_documents MODIFY title TEXT NULL, MODIFY subtitle TEXT NULL, MODIFY primary_text TEXT NULL, MODIFY primary_text_norm VARCHAR(512) NOT NULL DEFAULT '', MODIFY primary_text_compact VARCHAR(512) NOT NULL DEFAULT ''"
  )
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

ANALYZE TABLE search_documents;
SHOW FULL COLUMNS FROM search_documents;
