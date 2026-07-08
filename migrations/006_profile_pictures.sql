-- 006 — dedicated profile pictures table.
-- Stores a FILE PATH (image saved on disk under public/uploads/profile-pictures),
-- not base64 — so any HD image saves smoothly without hitting max_allowed_packet.

CREATE TABLE IF NOT EXISTS `hrm_profile_pictures` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `subject_type` enum('employee','role','company_logo','shell_avatar') NOT NULL DEFAULT 'shell_avatar',
  `subject_id` varchar(64) NOT NULL,
  `file_path` varchar(512) NOT NULL,
  `mime_type` varchar(128) NOT NULL DEFAULT 'image/jpeg',
  `file_size` bigint(20) unsigned NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pp_subject` (`subject_type`,`subject_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
