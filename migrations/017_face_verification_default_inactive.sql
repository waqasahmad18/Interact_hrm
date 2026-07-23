-- New employees: face verification Inactive by default (existing rows unchanged)
SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'hrm_employees'
    AND COLUMN_NAME = 'face_verification_enabled'
);

-- Ensure column exists with inactive default for brand-new installs
SET @sql_add := IF(
  @col_exists = 0,
  'ALTER TABLE hrm_employees ADD COLUMN face_verification_enabled TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT 1'
);
PREPARE stmt_add FROM @sql_add;
EXECUTE stmt_add;
DEALLOCATE PREPARE stmt_add;

-- Change default for future INSERTs (does not rewrite existing employees)
ALTER TABLE hrm_employees
  MODIFY COLUMN face_verification_enabled TINYINT(1) NOT NULL DEFAULT 0;
