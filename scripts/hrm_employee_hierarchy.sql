-- Optional explicit reporting lines & team assignments (overrides role-based inference)
CREATE TABLE IF NOT EXISTS hrm_employee_hierarchy (
  employee_id INT UNSIGNED NOT NULL PRIMARY KEY,
  reports_to_employee_id INT UNSIGNED NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_reports_to (reports_to_employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS hrm_team_members (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  team_lead_employee_id INT UNSIGNED NOT NULL,
  member_employee_id INT UNSIGNED NOT NULL,
  assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_member (member_employee_id),
  KEY idx_team_lead (team_lead_employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
