-- 004 — dummy notes table for end-to-end auto-deploy + auto-migration test.
-- Employee dashboard "Dummy Test" page saves rows here. No external FKs.

CREATE TABLE IF NOT EXISTS `hrm_dummy_notes` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `login_id` varchar(128) DEFAULT NULL,
  `note` varchar(500) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_hdn_login` (`login_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
