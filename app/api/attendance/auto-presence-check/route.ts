import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { ATTENDANCE_TABLE, ensureAttendanceTable } from "@/lib/attendance-table";
import {
  evaluatePresencePrompt,
  fetchShiftForEmployee,
  type OpenAttendanceRow,
} from "@/lib/attendance-presence";
import { sweepAutoPresenceClockOuts } from "@/lib/auto-presence-sweep";
import { registerAutoPresenceCron } from "@/lib/register-auto-presence-cron";
import { clockInDateKey } from "@/lib/shift-timing";

export const runtime = "nodejs";

registerAutoPresenceCron();

export async function GET(req: NextRequest) {
  let conn;
  try {
    const employeeId = new URL(req.url).searchParams.get("employeeId")?.trim();
    if (!employeeId) {
      return NextResponse.json({ success: false, error: "employeeId required" }, { status: 400 });
    }

    conn = await pool.getConnection();
    await ensureAttendanceTable(conn);

    await sweepAutoPresenceClockOuts(employeeId);

    const [openRows] = await conn.execute(
      `SELECT id, employee_id, employee_name,
              DATE_FORMAT(clock_in, '%Y-%m-%dT%H:%i:%s') AS clock_in,
              DATE_FORMAT(last_presence_ack_at, '%Y-%m-%dT%H:%i:%s') AS last_presence_ack_at
       FROM ${ATTENDANCE_TABLE}
       WHERE employee_id = ? AND clock_out IS NULL
       ORDER BY clock_in DESC
       LIMIT 1`,
      [employeeId],
    );
    const open = (openRows as OpenAttendanceRow[])[0];
    if (!open?.clock_in) {
      return NextResponse.json({
        success: true,
        clockedIn: false,
        shouldPrompt: false,
      });
    }

    const shift = await fetchShiftForEmployee(conn, employeeId, clockInDateKey(open.clock_in));
    const evalResult = evaluatePresencePrompt(open, shift);

    return NextResponse.json({
      success: true,
      serverNow: Date.now(),
      attendanceId: open.id,
      ...evalResult,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  } finally {
    if (conn) conn.release();
  }
}
