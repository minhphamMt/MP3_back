USE music_platform;

-- Search materialized index table.
-- Safe to rerun: the table is created only if missing, and each index
-- is added only when it does not already exist.

CREATE TABLE IF NOT EXISTS search_documents (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  entity_type ENUM('song', 'artist', 'album') NOT NULL,
  entity_id BIGINT NOT NULL,
  scope ENUM('public', 'admin') NOT NULL DEFAULT 'public',
  title TEXT NULL,
  subtitle TEXT NULL,
  primary_text TEXT NULL,
  primary_text_norm VARCHAR(512) NOT NULL DEFAULT '',
  primary_text_compact VARCHAR(512) NOT NULL DEFAULT '',
  priority_text TEXT NULL,
  priority_text_norm MEDIUMTEXT NULL,
  match_text MEDIUMTEXT NULL,
  match_text_norm MEDIUMTEXT NULL,
  search_text MEDIUMTEXT NOT NULL,
  search_text_norm MEDIUMTEXT NOT NULL,
  popularity_score DOUBLE NOT NULL DEFAULT 0,
  freshness_score DOUBLE NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  source_updated_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

SET @schema_name := DATABASE();

SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = @schema_name
    AND table_name = 'search_documents'
    AND index_name = 'uq_search_documents_entity_scope'
);
SET @sql := IF(
  @idx_exists = 0,
  'ALTER TABLE search_documents ADD UNIQUE KEY uq_search_documents_entity_scope (entity_type, entity_id, scope)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = @schema_name
    AND table_name = 'search_documents'
    AND index_name = 'idx_search_documents_scope_active_primary_norm'
);
SET @sql := IF(
  @idx_exists = 0,
  'ALTER TABLE search_documents ADD KEY idx_search_documents_scope_active_primary_norm (scope, is_active, primary_text_norm, entity_type, entity_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = @schema_name
    AND table_name = 'search_documents'
    AND index_name = 'idx_search_documents_scope_active_primary_compact'
);
SET @sql := IF(
  @idx_exists = 0,
  'ALTER TABLE search_documents ADD KEY idx_search_documents_scope_active_primary_compact (scope, is_active, primary_text_compact, entity_type, entity_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = @schema_name
    AND table_name = 'search_documents'
    AND index_name = 'idx_search_documents_scope_active_popularity'
);
SET @sql := IF(
  @idx_exists = 0,
  'ALTER TABLE search_documents ADD KEY idx_search_documents_scope_active_popularity (scope, is_active, entity_type, popularity_score, entity_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = @schema_name
    AND table_name = 'search_documents'
    AND index_name = 'idx_search_documents_scope_active_updated'
);
SET @sql := IF(
  @idx_exists = 0,
  'ALTER TABLE search_documents ADD KEY idx_search_documents_scope_active_updated (scope, is_active, updated_at, entity_type, entity_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

ANALYZE TABLE search_documents;

SHOW CREATE TABLE search_documents;
SHOW INDEX FROM search_documents;
