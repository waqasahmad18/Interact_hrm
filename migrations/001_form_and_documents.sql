-- 001 — Employee documents + Formats Library (form templates & assignments)
-- Circular FKs between documents <-> assignments, so disable FK checks while creating.
-- All CREATE ... IF NOT EXISTS so this is safe on DBs where tables already exist.

SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS `hrm_form_templates` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `title` varchar(255) NOT NULL,
  `description` text DEFAULT NULL,
  `scope` enum('company','department') NOT NULL DEFAULT 'company',
  `department_id` int(11) DEFAULT NULL,
  `category` enum('warning','appraisal','onboarding','exit','asset','leave','disciplinary','general','custom') NOT NULL DEFAULT 'general',
  `form_schema` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`form_schema`)),
  `template_file_name` varchar(255) DEFAULT NULL,
  `template_file_path` varchar(512) DEFAULT NULL,
  `template_mime_type` varchar(128) DEFAULT NULL,
  `is_fillable_online` tinyint(1) NOT NULL DEFAULT 1,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `version` int(10) unsigned NOT NULL DEFAULT 1,
  `created_by` varchar(128) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_hft_scope` (`scope`),
  KEY `idx_hft_department` (`department_id`),
  KEY `idx_hft_category` (`category`),
  KEY `idx_hft_active` (`is_active`),
  CONSTRAINT `fk_hft_department` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `hrm_form_assignments` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `template_id` int(10) unsigned NOT NULL,
  `employee_id` int(11) NOT NULL,
  `assigned_by` varchar(128) DEFAULT NULL,
  `assigned_note` text DEFAULT NULL,
  `status` enum('pending','in_progress','draft','submitted','cancelled','archived') NOT NULL DEFAULT 'pending',
  `form_data` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`form_data`)),
  `submitted_at` timestamp NULL DEFAULT NULL,
  `reviewed_at` timestamp NULL DEFAULT NULL,
  `reviewed_by` varchar(128) DEFAULT NULL,
  `result_document_id` int(10) unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_hfa_employee` (`employee_id`),
  KEY `idx_hfa_template` (`template_id`),
  KEY `idx_hfa_status` (`status`),
  KEY `idx_hfa_submitted` (`submitted_at`),
  KEY `idx_hfa_emp_status` (`employee_id`,`status`),
  KEY `fk_hfa_result_document` (`result_document_id`),
  CONSTRAINT `fk_hfa_employee` FOREIGN KEY (`employee_id`) REFERENCES `hrm_employees` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_hfa_result_document` FOREIGN KEY (`result_document_id`) REFERENCES `hrm_employee_documents` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_hfa_template` FOREIGN KEY (`template_id`) REFERENCES `hrm_form_templates` (`id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `hrm_employee_documents` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `employee_id` int(11) NOT NULL,
  `folder_type` enum('personal_upload','hr_issued','form_pending','form_submitted','auto_generated') NOT NULL DEFAULT 'personal_upload',
  `source_type` enum('employee_upload','hr_upload','form_assignment','form_submission','appraisal','warning','system') NOT NULL DEFAULT 'employee_upload',
  `assignment_id` int(10) unsigned DEFAULT NULL,
  `template_id` int(10) unsigned DEFAULT NULL,
  `file_name` varchar(255) NOT NULL,
  `file_path` varchar(512) NOT NULL,
  `mime_type` varchar(128) NOT NULL,
  `file_size` bigint(20) unsigned NOT NULL,
  `uploaded_by_employee_id` int(11) DEFAULT NULL,
  `uploaded_by_hr` varchar(128) DEFAULT NULL,
  `is_readonly` tinyint(1) NOT NULL DEFAULT 0,
  `deleted_at` timestamp NULL DEFAULT NULL,
  `deleted_by` varchar(128) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_hed_employee` (`employee_id`),
  KEY `idx_hed_folder` (`folder_type`),
  KEY `idx_hed_source` (`source_type`),
  KEY `idx_hed_assignment` (`assignment_id`),
  KEY `idx_hed_template` (`template_id`),
  KEY `idx_hed_deleted` (`deleted_at`),
  KEY `idx_hed_emp_folder` (`employee_id`,`folder_type`,`deleted_at`),
  CONSTRAINT `fk_hed_assignment` FOREIGN KEY (`assignment_id`) REFERENCES `hrm_form_assignments` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_hed_employee` FOREIGN KEY (`employee_id`) REFERENCES `hrm_employees` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_hed_template` FOREIGN KEY (`template_id`) REFERENCES `hrm_form_templates` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
