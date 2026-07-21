CREATE TABLE IF NOT EXISTS employee_test_documents (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  employee_id VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_employee_test_documents_employee (employee_id),
  KEY idx_employee_test_documents_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
