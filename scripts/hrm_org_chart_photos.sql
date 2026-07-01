-- Org chart + shell branding photos (employee, role, company logo, top-bar avatars)
-- Run in your interact_hrm MySQL database

CREATE TABLE IF NOT EXISTS hrm_org_chart_photos (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  subject_type ENUM('employee', 'role', 'company_logo', 'shell_avatar') NOT NULL,
  subject_id VARCHAR(64) NOT NULL,
  photo_data LONGTEXT NOT NULL COMMENT 'data:image/...;base64,...',
  mime_type VARCHAR(64) NOT NULL DEFAULT 'image/jpeg',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_org_chart_photo_subject (subject_type, subject_id),
  KEY idx_org_chart_photo_type (subject_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- If table already exists with older ENUM, run:
-- ALTER TABLE hrm_org_chart_photos
--   MODIFY COLUMN subject_type ENUM('employee', 'role', 'company_logo', 'shell_avatar') NOT NULL;
