-- Ambient Guard mic clips (quality samples + optional transcript). Safe to re-run.
CREATE TABLE IF NOT EXISTS guard_audio_clips (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  employee_id VARCHAR(64) NOT NULL,
  employee_name VARCHAR(255) NULL,
  pseudonym VARCHAR(255) NULL,
  audio_path VARCHAR(512) NOT NULL,
  transcript MEDIUMTEXT NULL,
  language VARCHAR(32) NULL,
  matched_json TEXT NULL,
  ticket_number VARCHAR(64) NULL,
  byte_size INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_guard_audio_clips_emp_created (employee_id, created_at),
  KEY idx_guard_audio_clips_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
