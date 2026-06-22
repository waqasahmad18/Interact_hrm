import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { ATTENDANCE_TABLE } from "@/lib/attendance-table";
import {
  isValidTardyNoteCode,
  TARDY_NOTE_OPTIONS,
  TARDY_NOTE_OTHER_CODE,
  tardyNoteLabelForCode,
  validateTardyOtherText,
} from "@/lib/tardy-note-options";
import {
  getTardyNoteByAttendanceId,
  listTardyNotesInRange,
  upsertTardyNote,
} from "@/lib/tardy-notes-table";
import {
  getDateStringInTimeZone,
  getTimeInMinutesInTimeZone,
  SERVER_TIMEZONE,
} from "@/lib/timezone";

function parseTimeToMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const parts = String(value).trim().split(":");
  if (parts.length < 2) return null;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

function graceMinutesForGender(gender: string | null | undefined): number {
  const g = String(gender || "").trim().toLowerCase();
  return g === "female" ? 20 : 10;
}

type AttendanceLateRow = {
  attendance_id: number | null;
  clock_in: string | null;
  gender: string | null;
  shift_start_time: string | null;
  attendance_date: string | Date | null;
};

function isClockInLate(row: AttendanceLateRow): boolean {
  if (!row.clock_in) return false;

  const clockInDate = new Date(String(row.clock_in) + "Z");
  if (Number.isNaN(clockInDate.getTime())) return false;

  const shiftStartMinutes = parseTimeToMinutes(row.shift_start_time);
  if (shiftStartMinutes === null) return false;

  const clockInMinutes = getTimeInMinutesInTimeZone(clockInDate, SERVER_TIMEZONE);
  if (clockInMinutes === null) return false;

  let diffMinutes = clockInMinutes - shiftStartMinutes;
  if (diffMinutes < -12 * 60) diffMinutes += 24 * 60;
  const grace = graceMinutesForGender(row.gender);
  return diffMinutes > grace;
}

function dateKeyFromRow(value: string | Date | null | undefined): string {
  if (!value) return "";
  if (value instanceof Date) return getDateStringInTimeZone(value, SERVER_TIMEZONE);
  return String(value).slice(0, 10);
}

/** Active open session only — widget shows after late clock-in and hides after clock-out. */
async function getActiveTardyContext(employeeId: string) {
  const [rows] = await pool.execute(
    `SELECT ea.id AS attendance_id, ea.clock_in, ea.clock_out, DATE(ea.date) AS attendance_date, e.gender, sa.start_time AS shift_start_time
     FROM ${ATTENDANCE_TABLE} ea
     LEFT JOIN hrm_employees e ON ea.employee_id = e.id
     LEFT JOIN shift_assignments sa
       ON sa.employee_id = ea.employee_id
      AND sa.assigned_date = (
        SELECT MAX(sa2.assigned_date)
        FROM shift_assignments sa2
        WHERE sa2.employee_id = ea.employee_id
          AND sa2.assigned_date <= ea.date
      )
     WHERE ea.employee_id = ? AND ea.clock_in IS NOT NULL AND ea.clock_out IS NULL
     ORDER BY ea.clock_in DESC
     LIMIT 1`,
    [employeeId]
  );
  const row = (rows as AttendanceLateRow[])[0];
  if (!row?.clock_in) {
    return { isLate: false, isClockedIn: false, attendanceDate: "", attendanceId: 0 };
  }

  return {
    isLate: isClockInLate(row),
    isClockedIn: true,
    attendanceDate: dateKeyFromRow(row.attendance_date),
    attendanceId: Number(row.attendance_id) || 0,
  };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const employeeId = searchParams.get("employeeId")?.trim() || "";
    const date = searchParams.get("date")?.trim() || "";
    const fromDate = searchParams.get("fromDate")?.trim() || "";
    const toDate = searchParams.get("toDate")?.trim() || "";

    if (fromDate && toDate) {
      const notes = await listTardyNotesInRange(fromDate, toDate, employeeId || undefined);
      return NextResponse.json({ success: true, notes });
    }

    if (!employeeId || !date) {
      return NextResponse.json(
        { success: false, error: "employeeId and date are required" },
        { status: 400 }
      );
    }

    const ctx = await getActiveTardyContext(employeeId);
    const note =
      ctx.attendanceId > 0 ? await getTardyNoteByAttendanceId(ctx.attendanceId) : null;

    return NextResponse.json({
      success: true,
      isLate: ctx.isLate,
      isClockedIn: ctx.isClockedIn,
      canAddNote: ctx.isLate && ctx.isClockedIn && !note,
      attendanceDate: ctx.attendanceDate,
      attendanceId: ctx.attendanceId,
      note,
      options: TARDY_NOTE_OPTIONS,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load tardy note";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const employeeId = String(body?.employeeId || "").trim();
    const attendanceDate =
      String(body?.attendanceDate || body?.date || "").trim() ||
      getDateStringInTimeZone(new Date(), SERVER_TIMEZONE);
    const noteCode = String(body?.noteCode || "").trim();
    const noteText = String(body?.noteText || "");

    if (!employeeId || !noteCode) {
      return NextResponse.json(
        { success: false, error: "employeeId and noteCode are required" },
        { status: 400 }
      );
    }
    if (!isValidTardyNoteCode(noteCode)) {
      return NextResponse.json({ success: false, error: "Invalid note option" }, { status: 400 });
    }

    const ctx = await getActiveTardyContext(employeeId);
    if (!ctx.isClockedIn) {
      return NextResponse.json(
        { success: false, error: "Tardy note can only be added while you are clocked in" },
        { status: 400 }
      );
    }
    if (!ctx.isLate) {
      return NextResponse.json(
        { success: false, error: "Tardy note is only allowed after a late clock-in" },
        { status: 400 }
      );
    }
    if (!ctx.attendanceId) {
      return NextResponse.json(
        { success: false, error: "Active attendance session not found" },
        { status: 400 }
      );
    }

    const saveDate = ctx.attendanceDate || attendanceDate;
    let noteLabel = tardyNoteLabelForCode(noteCode);
    if (noteCode === TARDY_NOTE_OTHER_CODE) {
      const otherCheck = validateTardyOtherText(noteText);
      if (!otherCheck.ok) {
        return NextResponse.json({ success: false, error: otherCheck.error }, { status: 400 });
      }
      noteLabel = otherCheck.value;
    }

    const saved = await upsertTardyNote(
      employeeId,
      saveDate,
      noteCode,
      ctx.attendanceId,
      noteLabel
    );
    return NextResponse.json({ success: true, note: saved });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to save tardy note";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
