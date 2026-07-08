-- 010 — sample check table for end-to-end auto-deploy + auto-migration verification.
-- Employee dashboard "Sample Check" page saves rows here. No external FKs.

CREATE TABLE IF NOT EXISTS `hrm_sample_check` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `login_id` varchar(128) DEFAULT NULL,
  `message` varchar(500) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_hsc_login` (`login_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
