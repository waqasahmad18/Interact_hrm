-- Employee advance & loan requests (submitted from employee portal)
CREATE TABLE IF NOT EXISTS employee_financial_requests (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  employee_id VARCHAR(64) NOT NULL,
  employee_name VARCHAR(255) NOT NULL,
  request_type ENUM('advance', 'loan') NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  installments INT UNSIGNED NULL,
  start_month VARCHAR(7) NULL,
  reason TEXT NULL,
  status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  admin_remark TEXT NULL,
  requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_efr_status (status),
  KEY idx_efr_employee (employee_id),
  KEY idx_efr_type (request_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
