-- 002 — self-test: proves migrations auto-run via deploy.sh (no manual step).
-- Harmless marker table; can be dropped later with a follow-up migration.

CREATE TABLE IF NOT EXISTS `hrm_migration_selftest` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `note` varchar(128) NOT NULL DEFAULT 'auto-migration works',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
