-- 007 — baseline safety net for pre-existing tables.
-- Every statement is CREATE TABLE IF NOT EXISTS, so on an environment that
-- already has the table this is a no-op (nothing is altered). On any
-- environment where a table is missing, it gets created. FK checks are
-- disabled so cross-table references never block creation order.

SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS `advance_salary` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `employee_id` int(11) NOT NULL,
  `employee_name` varchar(100) NOT NULL,
  `pseudonym` varchar(100) DEFAULT NULL,
  `department` varchar(100) DEFAULT NULL,
  `advance_amount` decimal(12,2) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `breaks` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `employee_id` int(11) DEFAULT NULL,
  `employee_name` varchar(150) DEFAULT NULL,
  `shift_assignment_id` int(11) DEFAULT NULL,
  `date` date DEFAULT NULL,
  `break_start` datetime DEFAULT NULL,
  `break_end` datetime DEFAULT NULL,
  `exceed_minutes` int(11) DEFAULT 0,
  `break_duration` int(11) DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `fk_breaks_employee_id` (`employee_id`),
  KEY `idx_shift_assignment_id` (`shift_assignment_id`),
  CONSTRAINT `fk_breaks_employee_id` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `calendar_day_overrides` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `date` date NOT NULL,
  `status` enum('off','working') NOT NULL DEFAULT 'working',
  `note` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `date` (`date`),
  KEY `date_2` (`date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `company_calendar_days` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `date` date NOT NULL,
  `status` varchar(20) NOT NULL,
  `note` varchar(255) DEFAULT NULL,
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `date` (`date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `company_policies` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `heading` varchar(100) NOT NULL,
  `description` text DEFAULT NULL,
  `display_order` int(11) DEFAULT 1,
  `status` enum('active','inactive') DEFAULT 'active',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `departments` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `employee_name` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `employee_attachments` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `employee_id` int(11) NOT NULL,
  `file_name` varchar(255) NOT NULL,
  `file_path` varchar(512) NOT NULL,
  `file_size` bigint(20) NOT NULL,
  `uploaded_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `employee_id` (`employee_id`),
  CONSTRAINT `employee_attachments_ibfk_1` FOREIGN KEY (`employee_id`) REFERENCES `hrm_employees` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `employee_attendance` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `employee_id` varchar(50) NOT NULL,
  `employee_name` varchar(150) DEFAULT NULL,
  `date` date NOT NULL,
  `clock_in` datetime DEFAULT NULL,
  `clock_out` datetime DEFAULT NULL,
  `total_hours` bigint(20) DEFAULT NULL,
  `deduction` int(11) DEFAULT 0,
  `overtime` int(11) DEFAULT 0,
  `auto_clock_out` tinyint(1) NOT NULL DEFAULT 0 COMMENT '1 = session auto closed (employee forgot clock out)',
  `last_presence_ack_at` datetime DEFAULT NULL COMMENT 'Last time employee clicked I am here on presence popup',
  PRIMARY KEY (`id`),
  KEY `employee_id` (`employee_id`),
  KEY `date` (`date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `employee_commissions` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `employee_id` int(11) NOT NULL,
  `month` varchar(7) NOT NULL COMMENT 'Format: YYYY-MM (e.g., 2026-03)',
  `year` int(4) NOT NULL,
  `month_number` int(2) NOT NULL COMMENT '1-12',
  `train_6h_amt` decimal(10,2) DEFAULT 0.00,
  `arrears` decimal(10,2) DEFAULT 0.00,
  `kpi_add` decimal(10,2) DEFAULT 0.00,
  `commission` decimal(10,2) DEFAULT 0.00,
  `existing_client_incentive` decimal(10,2) DEFAULT 0.00,
  `trainer_incentive` decimal(10,2) DEFAULT 0.00,
  `floor_incentive` decimal(10,2) DEFAULT 0.00,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `employee_month_unique` (`employee_id`,`month`),
  KEY `idx_month` (`month`),
  KEY `idx_year_month` (`year`,`month_number`),
  KEY `idx_employee_year` (`employee_id`,`year`,`month_number`),
  CONSTRAINT `fk_employee_commissions_employee` FOREIGN KEY (`employee_id`) REFERENCES `hrm_employees` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `employee_contacts` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `employee_id` int(11) DEFAULT NULL,
  `street1` varchar(255) DEFAULT NULL,
  `street2` varchar(255) DEFAULT NULL,
  `city` varchar(100) DEFAULT NULL,
  `state` varchar(100) DEFAULT NULL,
  `zip` varchar(20) DEFAULT NULL,
  `country` varchar(50) DEFAULT NULL,
  `phone_home` varchar(30) DEFAULT NULL,
  `phone_mobile` varchar(30) DEFAULT NULL,
  `phone_work` varchar(30) DEFAULT NULL,
  `email_work` varchar(100) DEFAULT NULL,
  `email_other` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_contacts_hrm_employee` (`employee_id`),
  CONSTRAINT `fk_contacts_employee` FOREIGN KEY (`employee_id`) REFERENCES `hrm_employees` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_contacts_hrm_employee` FOREIGN KEY (`employee_id`) REFERENCES `hrm_employees` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `employee_details` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `employee_id` varchar(20) DEFAULT NULL,
  `contact_details` text DEFAULT NULL,
  `emergency_contacts` text DEFAULT NULL,
  `dependents` text DEFAULT NULL,
  `immigration` text DEFAULT NULL,
  `job` text DEFAULT NULL,
  `salary` text DEFAULT NULL,
  `report_to` text DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `employee_id` (`employee_id`),
  CONSTRAINT `employee_details_ibfk_1` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`employee_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `employee_emergency_contacts` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `employee_id` int(11) DEFAULT NULL,
  `contact_name` varchar(100) DEFAULT NULL,
  `relationship` varchar(50) DEFAULT NULL,
  `phone` varchar(30) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_emergency_hrm_employee` (`employee_id`),
  CONSTRAINT `fk_emergency_employee` FOREIGN KEY (`employee_id`) REFERENCES `hrm_employees` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_emergency_hrm_employee` FOREIGN KEY (`employee_id`) REFERENCES `hrm_employees` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `employee_face_enrollment` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `employee_id` varchar(50) NOT NULL,
  `compreface_subject` varchar(255) NOT NULL,
  `compreface_image_id` varchar(64) NOT NULL,
  `local_path` varchar(512) DEFAULT NULL,
  `source` enum('upload','webcam') NOT NULL DEFAULT 'upload',
  `enrolled_by` varchar(100) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `face_descriptor` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`face_descriptor`)),
  `descriptor_type` varchar(16) NOT NULL DEFAULT 'full',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_compreface_image` (`compreface_image_id`),
  KEY `idx_employee` (`employee_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `employee_financial_requests` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `employee_id` varchar(64) NOT NULL,
  `employee_name` varchar(255) NOT NULL,
  `request_type` enum('advance','loan') NOT NULL,
  `amount` decimal(12,2) NOT NULL,
  `installments` int(10) unsigned DEFAULT NULL,
  `start_month` varchar(7) DEFAULT NULL,
  `reason` text DEFAULT NULL,
  `status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `admin_remark` text DEFAULT NULL,
  `requested_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_efr_status` (`status`),
  KEY `idx_efr_employee` (`employee_id`),
  KEY `idx_efr_type` (`request_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `employee_jobs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `employee_id` int(11) DEFAULT NULL,
  `joined_date` date DEFAULT NULL,
  `job_title` varchar(100) DEFAULT NULL,
  `job_specification` varchar(255) DEFAULT NULL,
  `job_category` varchar(100) DEFAULT NULL,
  `sub_unit` varchar(100) DEFAULT NULL,
  `location` varchar(100) DEFAULT NULL,
  `employment_status` varchar(50) DEFAULT NULL,
  `include_contract` tinyint(1) DEFAULT NULL,
  `department_id` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_jobs_hrm_employee` (`employee_id`),
  KEY `department_id` (`department_id`),
  CONSTRAINT `employee_jobs_ibfk_1` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`),
  CONSTRAINT `fk_jobs_employee` FOREIGN KEY (`employee_id`) REFERENCES `hrm_employees` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_jobs_hrm_employee` FOREIGN KEY (`employee_id`) REFERENCES `hrm_employees` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `employee_leave_allowances` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `employee_id` int(11) NOT NULL,
  `annual_allowance` int(11) DEFAULT 20,
  `casual_allowance` int(11) DEFAULT 10,
  `sick_allowance` int(11) DEFAULT 15,
  `bereavement_allowance` int(11) DEFAULT 3,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `annual_balance_adjustment` int(11) DEFAULT 0,
  `bereavement_balance_adjustment` int(11) DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_employee` (`employee_id`),
  CONSTRAINT `employee_leave_allowances_ibfk_1` FOREIGN KEY (`employee_id`) REFERENCES `hrm_employees` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `employee_leaves` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `employee_id` int(11) NOT NULL,
  `employee_name` varchar(150) DEFAULT NULL,
  `leave_category` enum('annual','casual','sick','bereavement','other','NEW_CATEGORY_NAME') DEFAULT 'annual',
  `start_date` date NOT NULL,
  `end_date` date NOT NULL,
  `total_days` int(11) NOT NULL,
  `reason` text DEFAULT NULL,
  `status` enum('pending','approved','rejected') DEFAULT 'pending',
  `admin_remarks` text DEFAULT NULL,
  `admin_remark` text DEFAULT NULL,
  `document_paths` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`document_paths`)),
  `requested_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `employee_id` (`employee_id`),
  CONSTRAINT `employee_leaves_ibfk_1` FOREIGN KEY (`employee_id`) REFERENCES `hrm_employees` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `employee_salaries` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `employee_id` int(11) DEFAULT NULL,
  `component` varchar(100) DEFAULT NULL,
  `pay_grade` varchar(50) DEFAULT NULL,
  `pay_frequency` varchar(50) DEFAULT NULL,
  `currency` varchar(10) DEFAULT NULL,
  `amount` decimal(18,2) DEFAULT NULL,
  `comments` varchar(255) DEFAULT NULL,
  `direct_deposit` tinyint(1) DEFAULT NULL,
  `account_number` varchar(50) DEFAULT NULL,
  `account_type` varchar(50) DEFAULT NULL,
  `routing_number` varchar(50) DEFAULT NULL,
  `deposit_amount` decimal(18,2) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_salaries_hrm_employee` (`employee_id`),
  CONSTRAINT `fk_salaries_employee` FOREIGN KEY (`employee_id`) REFERENCES `hrm_employees` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_salaries_hrm_employee` FOREIGN KEY (`employee_id`) REFERENCES `hrm_employees` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `employee_tickets` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `ticket_number` varchar(32) NOT NULL,
  `employee_id` varchar(64) NOT NULL,
  `employee_name` varchar(255) NOT NULL,
  `category` enum('ESS','IT','HR','ADMIN','OPERATIONS') NOT NULL,
  `ticket_type` varchar(64) NOT NULL,
  `is_custom` tinyint(1) NOT NULL DEFAULT 0,
  `subject` varchar(255) DEFAULT NULL,
  `description` text DEFAULT NULL,
  `form_data` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`form_data`)),
  `priority` enum('low','normal','high','urgent') NOT NULL DEFAULT 'normal',
  `status` enum('pending','in_progress','resolved','rejected','closed') NOT NULL DEFAULT 'pending',
  `admin_remark` text DEFAULT NULL,
  `messages` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`messages`)),
  `resolved_at` timestamp NULL DEFAULT NULL,
  `requested_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ticket_number` (`ticket_number`),
  KEY `idx_et_status` (`status`),
  KEY `idx_et_category` (`category`),
  KEY `idx_et_employee` (`employee_id`),
  KEY `idx_et_requested` (`requested_at`),
  KEY `idx_et_category_status` (`category`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `employees` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `first_name` varchar(50) DEFAULT NULL,
  `middle_name` varchar(50) DEFAULT NULL,
  `last_name` varchar(50) DEFAULT NULL,
  `employee_id` varchar(20) DEFAULT NULL,
  `dob` date DEFAULT NULL,
  `gender` varchar(10) DEFAULT NULL,
  `marital_status` varchar(20) DEFAULT NULL,
  `nationality` varchar(50) DEFAULT NULL,
  `email` varchar(100) DEFAULT NULL,
  `status` varchar(20) DEFAULT NULL,
  `username` varchar(50) DEFAULT NULL,
  `password` varchar(100) DEFAULT NULL,
  `profile_img` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `password_plain` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `employee_id` (`employee_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `hrm_admin_settings` (
  `setting_key` varchar(64) NOT NULL,
  `setting_value` text NOT NULL,
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`setting_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `hrm_employee_hierarchy` (
  `employee_id` int(10) unsigned NOT NULL,
  `reports_to_employee_id` int(10) unsigned DEFAULT NULL,
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`employee_id`),
  KEY `idx_reports_to` (`reports_to_employee_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `hrm_employees` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `first_name` varchar(100) DEFAULT NULL,
  `pseudonym` varchar(255) DEFAULT NULL,
  `cnic_number` varchar(50) DEFAULT NULL,
  `cnic_address` varchar(500) DEFAULT NULL,
  `employment_status` varchar(50) DEFAULT NULL,
  `last_name` varchar(100) DEFAULT NULL,
  `employee_code` varchar(50) DEFAULT NULL,
  `dob` date DEFAULT NULL,
  `gender` varchar(20) DEFAULT NULL,
  `marital_status` varchar(20) DEFAULT NULL,
  `nationality` varchar(50) DEFAULT NULL,
  `profile_img` varchar(255) DEFAULT NULL,
  `username` varchar(100) DEFAULT NULL,
  `password` varchar(255) DEFAULT NULL,
  `status` varchar(20) DEFAULT NULL,
  `role` enum('BOD/CEO','HOD','Management','Leader','Officer') NOT NULL DEFAULT 'Officer',
  `face_verification_enabled` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `employee_code` (`employee_code`),
  KEY `idx_hrm_employees_role` (`role`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `hrm_org_chart_photos` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `subject_type` enum('employee','role','company_logo','shell_avatar') NOT NULL,
  `subject_id` varchar(64) NOT NULL,
  `photo_data` longtext NOT NULL,
  `mime_type` varchar(64) NOT NULL DEFAULT 'image/jpeg',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_org_chart_photo_subject` (`subject_type`,`subject_id`),
  KEY `idx_org_chart_photo_type` (`subject_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `hrm_saved_logins` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `device_key` varchar(128) NOT NULL,
  `login_id` varchar(255) NOT NULL,
  `password_enc` text NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_device_login` (`device_key`,`login_id`),
  KEY `idx_device_key` (`device_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `hrm_tardy_notes` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `employee_id` varchar(32) NOT NULL,
  `attendance_date` date NOT NULL,
  `attendance_id` int(10) unsigned DEFAULT NULL,
  `note_code` varchar(64) NOT NULL,
  `note_label` text NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_tardy_attendance` (`attendance_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `hrm_team_members` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `team_lead_employee_id` int(10) unsigned NOT NULL,
  `member_employee_id` int(10) unsigned NOT NULL,
  `assigned_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_member` (`member_employee_id`),
  KEY `idx_team_lead` (`team_lead_employee_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `loan_installments` (
  `employee_id` int(11) NOT NULL,
  `month` varchar(7) NOT NULL,
  `original_amount` decimal(10,2) NOT NULL,
  `paid_amount` decimal(10,2) DEFAULT 0.00,
  `payable_this_month` decimal(12,2) DEFAULT NULL,
  `status` varchar(20) DEFAULT 'pending',
  `created_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`employee_id`,`month`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `loan_salary` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `employee_id` int(11) NOT NULL,
  `employee_name` varchar(100) DEFAULT NULL,
  `pseudonym` varchar(100) DEFAULT NULL,
  `department` varchar(100) DEFAULT NULL,
  `loan_amount` decimal(12,2) DEFAULT NULL,
  `installments` int(11) DEFAULT NULL,
  `custom_installments` int(11) DEFAULT NULL,
  `payable_this_month` decimal(12,2) DEFAULT NULL,
  `remaining_amount` decimal(12,2) DEFAULT NULL,
  `remaining_installments` int(11) DEFAULT NULL,
  `month` varchar(7) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `master_shifts` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `shift_in` time NOT NULL,
  `shift_out` time NOT NULL,
  `late_daily` int(11) DEFAULT 0,
  `early_daily` int(11) DEFAULT 0,
  `overtime_daily` int(11) DEFAULT 0,
  `working_days` varchar(100) DEFAULT NULL,
  `late_sitting` int(11) DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `prayer_breaks` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `employee_id` int(11) DEFAULT NULL,
  `employee_name` varchar(150) DEFAULT NULL,
  `shift_assignment_id` int(11) DEFAULT NULL,
  `date` date DEFAULT NULL,
  `prayer_break_start` datetime DEFAULT NULL,
  `prayer_break_end` datetime DEFAULT NULL,
  `prayer_break_duration` int(11) DEFAULT 0,
  `exceed_minutes` int(11) DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `fk_prayer_breaks_employee_id` (`employee_id`),
  KEY `idx_shift_assignment_id` (`shift_assignment_id`),
  CONSTRAINT `fk_prayer_breaks_employee_id` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `reminders` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `message` text NOT NULL,
  `is_active` tinyint(1) DEFAULT 1,
  `display_order` int(11) DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `shift_assignments` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `employee_id` int(11) NOT NULL,
  `shift_name` varchar(100) NOT NULL,
  `start_time` time NOT NULL,
  `end_time` time NOT NULL,
  `assigned_date` date NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `allow_overtime` tinyint(1) DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_employee_date` (`employee_id`,`assigned_date`),
  CONSTRAINT `shift_assignments_ibfk_1` FOREIGN KEY (`employee_id`) REFERENCES `hrm_employees` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `shift_effective_dates` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `employee_id` int(11) NOT NULL,
  `shift_name` varchar(100) NOT NULL,
  `start_time` time NOT NULL,
  `end_time` time NOT NULL,
  `allow_overtime` tinyint(1) DEFAULT 0,
  `effective_date` date NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `shift_late_early_relaxation` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `shift_id` int(11) NOT NULL,
  `daily_late_minutes` int(11) DEFAULT 0,
  `daily_early_minutes` int(11) DEFAULT 0,
  `monthly_late_minutes` int(11) DEFAULT 0,
  `monthly_early_minutes` int(11) DEFAULT 0,
  `monthly_special_late_relax` int(11) DEFAULT 0,
  `minutes_one_time_late` int(11) DEFAULT 0,
  `no_late_without_special` int(11) DEFAULT 0,
  `day_to_deduct` varchar(20) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `shift_id` (`shift_id`),
  CONSTRAINT `shift_late_early_relaxation_ibfk_1` FOREIGN KEY (`shift_id`) REFERENCES `shifts` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `shift_late_sitting_overtime` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `shift_id` int(11) NOT NULL,
  `late_sitting_time` time DEFAULT NULL,
  `late_sitting_minutes` int(11) DEFAULT 0,
  `overtime_per_month` int(11) DEFAULT 0,
  `overtime_per_day` int(11) DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `shift_id` (`shift_id`),
  CONSTRAINT `shift_late_sitting_overtime_ibfk_1` FOREIGN KEY (`shift_id`) REFERENCES `shifts` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `shift_leave_settings` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `shift_id` int(11) NOT NULL,
  `auto_calculate` tinyint(1) DEFAULT 0,
  `full_day_minutes` int(11) DEFAULT NULL,
  `half_day_minutes` int(11) DEFAULT NULL,
  `short_day_minutes` int(11) DEFAULT NULL,
  `full_day_value` decimal(4,2) DEFAULT NULL,
  `half_day_value` decimal(4,2) DEFAULT NULL,
  `short_day_value` decimal(4,2) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `shift_id` (`shift_id`),
  CONSTRAINT `shift_leave_settings_ibfk_1` FOREIGN KEY (`shift_id`) REFERENCES `shifts` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `shift_working_days` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `shift_id` int(11) NOT NULL,
  `monday` tinyint(1) DEFAULT 0,
  `tuesday` tinyint(1) DEFAULT 0,
  `wednesday` tinyint(1) DEFAULT 0,
  `thursday` tinyint(1) DEFAULT 0,
  `friday` tinyint(1) DEFAULT 0,
  `saturday` tinyint(1) DEFAULT 0,
  `sunday` tinyint(1) DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `shift_id` (`shift_id`),
  CONSTRAINT `shift_working_days_ibfk_1` FOREIGN KEY (`shift_id`) REFERENCES `shifts` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `shifts` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `shift_in` time NOT NULL,
  `shift_out` time NOT NULL,
  `shift_out_next_day` tinyint(1) DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `upcoming_events` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `title` varchar(200) NOT NULL,
  `description` text DEFAULT NULL,
  `start_at` datetime NOT NULL,
  `end_at` datetime DEFAULT NULL,
  `is_all_day` tinyint(1) NOT NULL DEFAULT 0,
  `location` varchar(255) DEFAULT NULL,
  `status` enum('draft','published','cancelled') NOT NULL DEFAULT 'published',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `widget_heading` varchar(255) DEFAULT 'Events',
  PRIMARY KEY (`id`),
  KEY `idx_start_at` (`start_at`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `zkbio_punch_log` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `log_id` varchar(64) DEFAULT NULL,
  `event_time` datetime DEFAULT NULL,
  `pin` varchar(64) DEFAULT NULL,
  `first_name` varchar(100) DEFAULT NULL,
  `last_name` varchar(100) DEFAULT NULL,
  `event_name` varchar(200) DEFAULT NULL,
  `verify_mode` varchar(100) DEFAULT NULL,
  `device_name` varchar(150) DEFAULT NULL,
  `reader_name` varchar(150) DEFAULT NULL,
  `dept_name` varchar(150) DEFAULT NULL,
  `raw_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `imported_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_zkbio_log_id` (`log_id`),
  UNIQUE KEY `uq_zkbio_pin_event` (`pin`,`event_time`),
  KEY `idx_event_time` (`event_time`),
  KEY `idx_pin` (`pin`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

SET FOREIGN_KEY_CHECKS = 1;
