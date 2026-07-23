-- Monthly payroll manual adjustments (CTD + Fuel per employee / month).

CREATE TABLE IF NOT EXISTS `monthly_payroll_adjustments` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `employee_id` varchar(64) NOT NULL,
  `month` varchar(7) NOT NULL COMMENT 'Format: YYYY-MM',
  `ctd` decimal(12,2) NOT NULL DEFAULT 0.00,
  `fuel_allowance` decimal(12,2) DEFAULT NULL COMMENT 'NULL = use UI default',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `employee_month_unique` (`employee_id`,`month`),
  KEY `idx_month` (`month`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @col_ctd := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'monthly_payroll_adjustments'
    AND COLUMN_NAME = 'ctd'
);

SET @sql_ctd := IF(
  @col_ctd = 0,
  'ALTER TABLE monthly_payroll_adjustments ADD COLUMN ctd decimal(12,2) NOT NULL DEFAULT 0.00 AFTER month',
  'SELECT 1'
);

PREPARE stmt_ctd FROM @sql_ctd;
EXECUTE stmt_ctd;
DEALLOCATE PREPARE stmt_ctd;

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
