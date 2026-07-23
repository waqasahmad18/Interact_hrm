-- Fuel allowance on monthly payroll adjustments (editable per employee / month).
-- NULL means “not set” so UI can keep the 5,000 default where applicable.

SET @col_fuel := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'monthly_payroll_adjustments'
    AND COLUMN_NAME = 'fuel_allowance'
);

SET @sql_fuel := IF(
  @col_fuel = 0,
  'ALTER TABLE monthly_payroll_adjustments ADD COLUMN fuel_allowance decimal(12,2) DEFAULT NULL AFTER ctd',
  'SELECT 1'
);

PREPARE stmt_fuel FROM @sql_fuel;
EXECUTE stmt_fuel;
DEALLOCATE PREPARE stmt_fuel;
