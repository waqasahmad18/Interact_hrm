import "server-only";

import { pool } from "./db";
import { ATTENDANCE_TABLE, ensureAttendanceTable } from "./attendance-table";
import {
  evaluatePresencePrompt,
  fetchShiftForEmployee,
  type OpenAttendanceRow,
} from "./attendance-presence";
import { performAutoClockOut, shouldServerAutoClockOut } from "./auto-clock-out";
import { AUTO_PRESENCE_POPUP_MS, clockInDateKey } from "./shift-timing";

export type AutoPresenceSweepResult = {
  processed: number;
  clockedOut: number;
  attendanceIds: number[];
};

type OpenRow = OpenAttendanceRow & {
  employee_name?: string | null;
};

async function processOpenSession(
  conn: { execute: (sql: string, params?: unknown[]) => Promise<unknown> },
  open: OpenRow,
): Promise<number | null> {
  const cinDate = clockInDateKey(open.clock_in);
  const shift = await fetchShiftForEmployee(conn, open.employee_id, cinDate);
  const evalResult = evaluatePresencePrompt(open, shift);

  if (evalResult.promptAtMs == null || evalResult.clockInMs == null) {
    return null;
  }

  if (
    !shouldServerAutoClockOut(
      evalResult.promptAtMs,
      evalResult.clockInMs,
      evalResult.lastPresenceAckMs ?? null,
    )
  ) {
    return null;
  }

  const scheduledClockOutMs = evalResult.promptAtMs + AUTO_PRESENCE_POPUP_MS;
  await performAutoClockOut(conn, open.id, open.employee_name, scheduledClockOutMs);
  return open.id;
}

/**
 * DB-driven auto clock-out for open sessions past shift grace + 5 min popup window.
 * Runs without browser — logout / closed tab has no effect.
 */
export async function sweepAutoPresenceClockOuts(
  employeeId?: string,
): Promise<AutoPresenceSweepResult> {
  let conn;
  const result: AutoPresenceSweepResult = {
    processed: 0,
    clockedOut: 0,
    attendanceIds: [],
  };

  try {
    conn = await pool.getConnection();
    await ensureAttendanceTable(conn);

    const sql = employeeId
      ? `SELECT id, employee_id, employee_name,
                DATE_FORMAT(clock_in, '%Y-%m-%dT%H:%i:%s') AS clock_in,
                DATE_FORMAT(last_presence_ack_at, '%Y-%m-%dT%H:%i:%s') AS last_presence_ack_at
         FROM ${ATTENDANCE_TABLE}
         WHERE clock_out IS NULL AND employee_id = ?`
      : `SELECT id, employee_id, employee_name,
                DATE_FORMAT(clock_in, '%Y-%m-%dT%H:%i:%s') AS clock_in,
                DATE_FORMAT(last_presence_ack_at, '%Y-%m-%dT%H:%i:%s') AS last_presence_ack_at
         FROM ${ATTENDANCE_TABLE}
         WHERE clock_out IS NULL`;

    const [rows] = await conn.execute(sql, employeeId ? [employeeId] : []);
    const openSessions = rows as OpenRow[];

    for (const open of openSessions) {
      if (!open?.clock_in) continue;
      result.processed += 1;
      const closedId = await processOpenSession(conn, open);
      if (closedId != null) {
        result.clockedOut += 1;
        result.attendanceIds.push(closedId);
      }
    }

    return result;
  } finally {
    if (conn) conn.release();
  }
}
