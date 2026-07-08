-- 003 — document tags + audit log (used by My Files GET/tags and audit trail).
-- Without these, GET /api/employee-documents throws (tag join) → list shows empty
-- even though upload succeeded. Internal FKs only (safe across environments).

SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS `hrm_document_tags` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(64) NOT NULL,
  `slug` varchar(64) NOT NULL,
  `color` varchar(16) DEFAULT '#611f69',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_hdt_slug` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `hrm_document_tag_map` (
  `document_id` int(10) unsigned NOT NULL,
  `tag_id` int(10) unsigned NOT NULL,
  PRIMARY KEY (`document_id`,`tag_id`),
  KEY `idx_hdmap_tag` (`tag_id`),
  CONSTRAINT `fk_hdmap_document` FOREIGN KEY (`document_id`) REFERENCES `hrm_employee_documents` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_hdmap_tag` FOREIGN KEY (`tag_id`) REFERENCES `hrm_document_tags` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `hrm_document_audit_log` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `document_id` int(10) unsigned DEFAULT NULL,
  `assignment_id` int(10) unsigned DEFAULT NULL,
  `employee_id` int(11) DEFAULT NULL,
  `action` enum('upload','download','print','view','delete','restore','assign_form','submit_form','cancel_form','hr_issue') NOT NULL,
  `actor_type` enum('employee','hr','admin','system') NOT NULL,
  `actor_id` varchar(128) DEFAULT NULL,
  `actor_name` varchar(255) DEFAULT NULL,
  `meta` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`meta`)),
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_hdalog_document` (`document_id`),
  KEY `idx_hdalog_employee` (`employee_id`),
  KEY `idx_hdalog_action` (`action`),
  KEY `idx_hdalog_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
