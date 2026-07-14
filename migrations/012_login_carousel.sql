-- Login auth left-panel carousel (slides + settings)
CREATE TABLE IF NOT EXISTS hrm_login_carousel_slides (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  file_name VARCHAR(191) NOT NULL,
  original_name VARCHAR(255) NULL,
  mime_type VARCHAR(64) NULL,
  file_size INT UNSIGNED NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_login_carousel_file (file_name),
  KEY idx_login_carousel_active_sort (is_active, sort_order, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS hrm_login_carousel_settings (
  setting_key VARCHAR(64) NOT NULL PRIMARY KEY,
  setting_value TEXT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO hrm_login_carousel_settings (setting_key, setting_value) VALUES
  ('enabled', 'true'),
  ('interval_ms', '5000'),
  ('animation', 'fade'),
  ('include_brand_slide', 'true')
ON DUPLICATE KEY UPDATE setting_key = setting_key;
