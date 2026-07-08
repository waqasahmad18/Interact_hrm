-- 011 — cleanup: drop the sample check table after pipeline verification.
-- Safe (IF EXISTS) on environments where it was never created.

DROP TABLE IF EXISTS `hrm_sample_check`;
