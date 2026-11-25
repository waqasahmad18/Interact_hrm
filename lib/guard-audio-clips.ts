import { pool } from "@/lib/db";

const TABLE = "guard_audio_clips";

export type GuardAudioClipRow = {
  id: number;
  employee_id: string;
  employee_name: string | null;
  pseudonym: string | null;
  audio_path: string;
  transcript: string | null;
  language: string | null;
  matched_json: string | null;
  ticket_number: string | null;
  byte_size: number | null;
  created_at: string;
};

let ensured = false;

export async function ensureGuardAudioClipsTable(): Promise<void> {
  if (ensured) return;
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS ${TABLE} (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      employee_id VARCHAR(64) NOT NULL,
      employee_name VARCHAR(255) NULL,
      pseudonym VARCHAR(255) NULL,
      audio_path VARCHAR(512) NOT NULL,
      transcript MEDIUMTEXT NULL,
      language VARCHAR(32) NULL,
      matched_json TEXT NULL,
      ticket_number VARCHAR(64) NULL,
      byte_size INT UNSIGNED NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_guard_audio_clips_emp_created (employee_id, created_at),
      KEY idx_guard_audio_clips_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  ensured = true;
}

export async function insertGuardAudioClip(input: {
  employeeId: string;
  employeeName?: string | null;
  pseudonym?: string | null;
  audioPath: string;
  transcript?: string | null;
  language?: string | null;
  matched?: string[] | null;
  ticketNumber?: string | null;
  byteSize?: number | null;
}): Promise<number> {
  await ensureGuardAudioClipsTable();
  const matchedJson =
    input.matched && input.matched.length
      ? JSON.stringify(input.matched.slice(0, 20))
      : null;
  const [result] = await pool.execute(
    `INSERT INTO ${TABLE}
      (employee_id, employee_name, pseudonym, audio_path, transcript, language,
       matched_json, ticket_number, byte_size)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      String(input.employeeId || "").trim(),
      input.employeeName?.trim() || null,
      input.pseudonym?.trim() || null,
      String(input.audioPath || "").trim(),
      input.transcript?.trim() || null,
      input.language?.trim() || null,
      matchedJson,
      input.ticketNumber?.trim() || null,
      input.byteSize != null && Number.isFinite(input.byteSize)
        ? Math.max(0, Math.floor(input.byteSize))
        : null,
    ]
  );
  const id = Number((result as { insertId?: number }).insertId || 0);
  return id;
}

export async function listGuardAudioClips(opts?: {
  limit?: number;
  employeeId?: string;
}): Promise<GuardAudioClipRow[]> {
  await ensureGuardAudioClipsTable();
  const limit = Math.min(300, Math.max(1, Math.floor(opts?.limit ?? 80)));
  const emp = String(opts?.employeeId || "").trim();
  const [rows] = emp
    ? await pool.execute(
        `SELECT id, employee_id, employee_name, pseudonym, audio_path, transcript,
                language, matched_json, ticket_number, byte_size, created_at
         FROM ${TABLE}
         WHERE employee_id = ?
         ORDER BY id DESC
         LIMIT ${limit}`,
        [emp]
      )
    : await pool.execute(
        `SELECT id, employee_id, employee_name, pseudonym, audio_path, transcript,
                language, matched_json, ticket_number, byte_size, created_at
         FROM ${TABLE}
         ORDER BY id DESC
         LIMIT ${limit}`
      );
  return rows as GuardAudioClipRow[];
}

export async function getGuardAudioClip(
  id: number
): Promise<GuardAudioClipRow | null> {
  await ensureGuardAudioClipsTable();
  if (!Number.isFinite(id) || id <= 0) return null;
  const [rows] = await pool.execute(
    `SELECT id, employee_id, employee_name, pseudonym, audio_path, transcript,
            language, matched_json, ticket_number, byte_size, created_at
     FROM ${TABLE}
     WHERE id = ?
     LIMIT 1`,
    [id]
  );
  return (rows as GuardAudioClipRow[])[0] ?? null;
}

export async function updateGuardAudioClipTranscript(
  id: number,
  transcript: string,
  language?: string | null
): Promise<GuardAudioClipRow | null> {
  await ensureGuardAudioClipsTable();
  await pool.execute(
    `UPDATE ${TABLE}
     SET transcript = ?, language = COALESCE(?, language)
     WHERE id = ?`,
    [String(transcript || "").trim() || null, language?.trim() || null, id]
  );
  return getGuardAudioClip(id);
}
