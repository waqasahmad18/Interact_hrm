-- One-time: copy missing hrm_employees into legacy employees table (for breaks FK).
-- Run in MySQL/phpMyAdmin on interact_hrm database.

INSERT INTO employees (id, first_name, last_name, employee_id, gender, nationality, username, password, profile_img, status)
SELECT
  h.id,
  h.first_name,
  h.last_name,
  COALESCE(NULLIF(TRIM(h.employee_code), ''), CONCAT('HR', h.id)),
  h.gender,
  h.nationality,
  h.username,
  h.password,
  h.profile_img,
  COALESCE(h.status, 'active')
FROM hrm_employees h
LEFT JOIN employees e ON e.id = h.id
WHERE e.id IS NULL;
