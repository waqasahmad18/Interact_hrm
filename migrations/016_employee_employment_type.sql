-- Employment type (Full Time / Part Time) + working hours for payroll OT rate
SET @col_type := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'hrm_employees'
    AND COLUMN_NAME = 'employment_type'
);

SET @sql_type := IF(
  @col_type = 0,
  'ALTER TABLE hrm_employees ADD COLUMN employment_type VARCHAR(20) NULL AFTER employment_status',
  'SELECT 1'
);

PREPARE stmt_type FROM @sql_type;
EXECUTE stmt_type;
DEALLOCATE PREPARE stmt_type;

SET @col_hours := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'hrm_employees'
    AND COLUMN_NAME = 'working_hours'
);

SET @sql_hours := IF(
  @col_hours = 0,
  'ALTER TABLE hrm_employees ADD COLUMN working_hours TINYINT UNSIGNED NULL AFTER employment_type',
  'SELECT 1'
);

PREPARE stmt_hours FROM @sql_hours;
EXECUTE stmt_hours;
DEALLOCATE PREPARE stmt_hours;
