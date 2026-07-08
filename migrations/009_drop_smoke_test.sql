-- 009 — cleanup: drop the smoke test table after pipeline verification.
-- Safe (IF EXISTS) on environments where it was never created.

DROP TABLE IF EXISTS `hrm_smoke_test`;
