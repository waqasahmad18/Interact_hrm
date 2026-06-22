-- Run manually in MySQL (interact_hrm database)

CREATE TABLE IF NOT EXISTS hrm_tardy_notes (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  employee_id VARCHAR(32) NOT NULL,
  attendance_date DATE NOT NULL,
  attendance_id INT UNSIGNED NULL,
  note_code VARCHAR(64) NOT NULL,
  note_label TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tardy_attendance (attendance_id),
  KEY idx_employee_date (employee_id, attendance_date),
  KEY idx_attendance_date (attendance_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- If table already exists, run these migrations:

-- ALTER TABLE hrm_tardy_notes MODIFY note_label TEXT NOT NULL;

-- ALTER TABLE hrm_tardy_notes ADD COLUMN attendance_id INT UNSIGNED NULL AFTER attendance_date;

-- ALTER TABLE hrm_tardy_notes DROP INDEX uq_employee_tardy_date;

-- ALTER TABLE hrm_tardy_notes ADD UNIQUE KEY uq_tardy_attendance (attendance_id);
