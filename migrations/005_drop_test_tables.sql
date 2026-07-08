-- 005 — cleanup: drop test/dummy tables created during pipeline verification.
-- Safe (IF EXISTS) on environments where they were never created.

DROP TABLE IF EXISTS `hrm_dummy_notes`;
DROP TABLE IF EXISTS `hrm_migration_selftest`;
