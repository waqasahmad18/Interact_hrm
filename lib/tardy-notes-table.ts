import "server-only";

import { pool } from "@/lib/db";
import { tardyNoteLabelForCode } from "@/lib/tardy-note-options";

export const TARDY_NOTES_TABLE = "hrm_tardy_notes";

export type TardyNoteRow = {
  id: number;
  employee_id: string;
  attendance_id: number | null;
  attendance_date: string;
  note_code: string;
  note_label: string;
};

function normalizeDateKey(value: string): string {
  return String(value || "").trim().slice(0, 10);
}

export async function getTardyNoteByAttendanceId(
  attendanceId: number
): Promise<TardyNoteRow | null> {
  if (!attendanceId) return null;
  const [rows] = await pool.execute(
    `SELECT id, employee_id, attendance_id,
            DATE_FORMAT(attendance_date, '%Y-%m-%d') AS attendance_date,
            note_code, note_label
     FROM ${TARDY_NOTES_TABLE}
     WHERE attendance_id = ?
     LIMIT 1`,
    [attendanceId]
  );
  return (rows as TardyNoteRow[])[0] ?? null;
}

export async function getTardyNote(
  employeeId: string,
  attendanceDate: string
): Promise<TardyNoteRow | null> {
  const dateKey = normalizeDateKey(attendanceDate);
  const [rows] = await pool.execute(
    `SELECT id, employee_id, attendance_id,
            DATE_FORMAT(attendance_date, '%Y-%m-%d') AS attendance_date,
            note_code, note_label
     FROM ${TARDY_NOTES_TABLE}
     WHERE employee_id = ? AND attendance_date = ? AND attendance_id IS NULL
     LIMIT 1`,
    [employeeId, dateKey]
  );
  return (rows as TardyNoteRow[])[0] ?? null;
}

export async function listTardyNotesInRange(
  fromDate: string,
  toDate: string,
  employeeId?: string
): Promise<TardyNoteRow[]> {
  const from = normalizeDateKey(fromDate);
  const to = normalizeDateKey(toDate);
  const select = `SELECT id, employee_id, attendance_id,
            DATE_FORMAT(attendance_date, '%Y-%m-%d') AS attendance_date,
            note_code, note_label`;

  if (employeeId) {
    const [rows] = await pool.execute(
      `${select}
       FROM ${TARDY_NOTES_TABLE}
       WHERE employee_id = ? AND attendance_date BETWEEN ? AND ?
       ORDER BY attendance_date ASC, id ASC`,
      [employeeId, from, to]
    );
    return rows as TardyNoteRow[];
  }

  const [rows] = await pool.execute(
    `${select}
     FROM ${TARDY_NOTES_TABLE}
     WHERE attendance_date BETWEEN ? AND ?
     ORDER BY employee_id ASC, attendance_date ASC, id ASC`,
    [from, to]
  );
  return rows as TardyNoteRow[];
}

export async function upsertTardyNote(
  employeeId: string,
  attendanceDate: string,
  noteCode: string,
  attendanceId: number,
  noteLabelOverride?: string
): Promise<TardyNoteRow> {
  const dateKey = normalizeDateKey(attendanceDate);
  const noteLabel = noteLabelOverride?.trim() || tardyNoteLabelForCode(noteCode);
  if (!attendanceId) {
    throw new Error("attendance_id is required");
  }

  await pool.execute(
    `INSERT INTO ${TARDY_NOTES_TABLE} (employee_id, attendance_date, attendance_id, note_code, note_label)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       note_code = VALUES(note_code),
       note_label = VALUES(note_label),
       attendance_date = VALUES(attendance_date),
       updated_at = CURRENT_TIMESTAMP`,
    [employeeId, dateKey, attendanceId, noteCode, noteLabel]
  );

  const saved = await getTardyNoteByAttendanceId(attendanceId);
  if (!saved) {
    throw new Error("Failed to save tardy note");
  }
  return saved;
}
