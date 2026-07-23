-- Editable unpaid days override on monthly payroll (NULL = use system-calculated value).

SET @col_unpaid := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'monthly_payroll_adjustments'
    AND COLUMN_NAME = 'unpaid_days'
);

SET @sql_unpaid := IF(
  @col_unpaid = 0,
  'ALTER TABLE monthly_payroll_adjustments ADD COLUMN unpaid_days decimal(8,2) DEFAULT NULL AFTER fuel_allowance',
  'SELECT 1'
);

PREPARE stmt_unpaid FROM @sql_unpaid;
EXECUTE stmt_unpaid;
DEALLOCATE PREPARE stmt_unpaid;
