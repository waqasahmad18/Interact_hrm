import "server-only";

import { pool } from "@/lib/db";
import {
  isAllowedMonthlyAttendanceStatus,
  normalizeAttendanceStatus,
} from "@/lib/attendance-status";

export const MONTHLY_STATUS_OVERRIDES_TABLE = "monthly_attendance_status_overrides";

export type MonthlyStatusOverrideRow = {
  employee_id: string;
  attendance_date: string;
  status_label: string;
  updated_by: string | null;
};

function normalizeDateKey(value: string): string {
  return String(value || "").trim().slice(0, 10);
}

export async function ensureMonthlyStatusOverridesTable(): Promise<void> {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS ${MONTHLY_STATUS_OVERRIDES_TABLE} (
      id INT AUTO_INCREMENT PRIMARY KEY,
      employee_id VARCHAR(64) NOT NULL,
      attendance_date DATE NOT NULL,
      status_label VARCHAR(64) NOT NULL,
      updated_by VARCHAR(128) NULL,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_monthly_att_status_emp_date (employee_id, attendance_date),
      KEY idx_monthly_att_status_date (attendance_date)
    )
  `);
}

export async function listMonthlyStatusOverridesInRange(
  fromDate: string,
  toDate: string,
  employeeId?: string,
): Promise<MonthlyStatusOverrideRow[]> {
  await ensureMonthlyStatusOverridesTable();
  const from = normalizeDateKey(fromDate);
  const to = normalizeDateKey(toDate);
  if (!from || !to) return [];

  if (employeeId) {
    const [rows] = await pool.execute(
      `SELECT employee_id,
              DATE_FORMAT(attendance_date, '%Y-%m-%d') AS attendance_date,
              status_label, updated_by
       FROM ${MONTHLY_STATUS_OVERRIDES_TABLE}
       WHERE attendance_date BETWEEN ? AND ?
         AND employee_id = ?
       ORDER BY attendance_date ASC`,
      [from, to, String(employeeId).trim()],
    );
    return rows as MonthlyStatusOverrideRow[];
  }

  const [rows] = await pool.execute(
    `SELECT employee_id,
            DATE_FORMAT(attendance_date, '%Y-%m-%d') AS attendance_date,
            status_label, updated_by
     FROM ${MONTHLY_STATUS_OVERRIDES_TABLE}
     WHERE attendance_date BETWEEN ? AND ?
     ORDER BY attendance_date ASC`,
    [from, to],
  );
  return rows as MonthlyStatusOverrideRow[];
}

export async function upsertMonthlyStatusOverride(opts: {
  employeeId: string;
  attendanceDate: string;
  statusLabel: string;
  updatedBy?: string | null;
}): Promise<MonthlyStatusOverrideRow> {
  await ensureMonthlyStatusOverridesTable();
  const employeeId = String(opts.employeeId || "").trim();
  const attendanceDate = normalizeDateKey(opts.attendanceDate);
  const statusLabel = normalizeAttendanceStatus(opts.statusLabel);
  if (!employeeId || !attendanceDate) {
    throw new Error("employeeId and attendanceDate are required");
  }
  if (!isAllowedMonthlyAttendanceStatus(statusLabel)) {
    throw new Error("Invalid status");
  }

  await pool.execute(
    `INSERT INTO ${MONTHLY_STATUS_OVERRIDES_TABLE}
       (employee_id, attendance_date, status_label, updated_by)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       status_label = VALUES(status_label),
       updated_by = VALUES(updated_by),
       updated_at = CURRENT_TIMESTAMP`,
    [employeeId, attendanceDate, statusLabel, opts.updatedBy || null],
  );

  return {
    employee_id: employeeId,
    attendance_date: attendanceDate,
    status_label: statusLabel,
    updated_by: opts.updatedBy || null,
  };
}

export async function deleteMonthlyStatusOverride(
  employeeId: string,
  attendanceDate: string,
): Promise<boolean> {
  await ensureMonthlyStatusOverridesTable();
  const eid = String(employeeId || "").trim();
  const date = normalizeDateKey(attendanceDate);
  if (!eid || !date) return false;
  const [result] = await pool.execute(
    `DELETE FROM ${MONTHLY_STATUS_OVERRIDES_TABLE}
     WHERE employee_id = ? AND attendance_date = ?`,
    [eid, date],
  );
  const info = result as { affectedRows?: number };
  return Number(info.affectedRows || 0) > 0;
}
