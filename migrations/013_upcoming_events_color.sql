-- Event chip / calendar highlight color for upcoming_events
SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'upcoming_events'
    AND COLUMN_NAME = 'color'
);

SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE upcoming_events ADD COLUMN color VARCHAR(16) NULL AFTER location',
  'SELECT 1'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
