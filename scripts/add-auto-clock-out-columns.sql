-- Auto presence / auto clock-out columns on employee_attendance
ALTER TABLE employee_attendance
  ADD COLUMN auto_clock_out TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN last_presence_ack_at DATETIME NULL;
