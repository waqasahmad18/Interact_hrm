-- Run manually in MySQL (interact_hrm database)
-- Stores per-browser saved logins (linked via interact_hrm_device cookie)

CREATE TABLE IF NOT EXISTS hrm_saved_logins (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  device_key VARCHAR(64) NOT NULL,
  login_id VARCHAR(255) NOT NULL,
  password_enc TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_device_login (device_key, login_id),
  KEY idx_device_key (device_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
