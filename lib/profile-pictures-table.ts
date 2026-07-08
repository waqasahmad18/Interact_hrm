import type { RowDataPacket } from "mysql2";
import { pool } from "@/lib/db";

export const PROFILE_PICTURES_TABLE = "hrm_profile_pictures";

export type ProfilePictureSubjectType =
  | "employee"
  | "role"
  | "company_logo"
  | "shell_avatar";

export type ProfilePictureRow = {
  subject_type: ProfilePictureSubjectType;
  subject_id: string;
  file_path: string;
};

/**
 * Turn a stored disk path (e.g. `/uploads/profile-pictures/uuid.jpg`) into a URL
 * that is served by an API route. Next.js production only serves files that were
 * in `public/` at build time — files uploaded at runtime 404 — so we stream them
 * through `/api/profile-picture/file/<name>` instead of linking the static path.
 */
export function profilePictureServeUrl(filePath: string): string {
  const name = filePath.split("/").filter(Boolean).pop() ?? "";
  return `/api/profile-picture/file/${encodeURIComponent(name)}`;
}

export async function upsertProfilePicture(
  subjectType: ProfilePictureSubjectType,
  subjectId: string,
  filePath: string,
  mime: string,
  size: number,
) {
  await pool.execute(
    `INSERT INTO ${PROFILE_PICTURES_TABLE}
       (subject_type, subject_id, file_path, mime_type, file_size)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       file_path = VALUES(file_path),
       mime_type = VALUES(mime_type),
       file_size = VALUES(file_size),
       updated_at = CURRENT_TIMESTAMP`,
    [subjectType, subjectId, filePath, mime, size],
  );
}

export async function getProfilePicturePath(
  subjectType: ProfilePictureSubjectType,
  subjectId: string,
): Promise<string | null> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT file_path FROM ${PROFILE_PICTURES_TABLE}
     WHERE subject_type = ? AND subject_id = ? LIMIT 1`,
    [subjectType, subjectId],
  );
  return rows[0]?.file_path ? String(rows[0].file_path) : null;
}

/** All profile-picture rows. Returns [] if the table does not exist yet. */
export async function getAllProfilePictureRows(): Promise<ProfilePictureRow[]> {
  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT subject_type, subject_id, file_path FROM ${PROFILE_PICTURES_TABLE}`,
    );
    return rows as ProfilePictureRow[];
  } catch {
    return [];
  }
}

/** Deletes the row and returns the removed file path (so the caller can unlink it). */
export async function deleteProfilePicture(
  subjectType: ProfilePictureSubjectType,
  subjectId: string,
): Promise<string | null> {
  const existing = await getProfilePicturePath(subjectType, subjectId);
  await pool.execute(
    `DELETE FROM ${PROFILE_PICTURES_TABLE}
     WHERE subject_type = ? AND subject_id = ?`,
    [subjectType, subjectId],
  );
  return existing;
}
