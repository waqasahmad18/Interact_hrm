import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { pool } from "@/lib/db";
import { getDateStringInTimeZone, SERVER_TIMEZONE } from "@/lib/timezone";

export const runtime = "nodejs";

type ImportTarget = "attendance" | "breaks" | "prayer_breaks";

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ");
}

function getCell(row: Record<string, unknown>, aliases: string[]) {
  const normalized = new Map<string, unknown>();
  Object.entries(row).forEach(([k, v]) => normalized.set(normalizeHeader(k), v));
  for (const alias of aliases) {
    const value = normalized.get(normalizeHeader(alias));
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }
  return null;
}

function toDateTimeSql(value: unknown): string | null {
  if (value == null || String(value).trim() === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      const dt = new Date(
        Date.UTC(parsed.y, parsed.m - 1, parsed.d, parsed.H, parsed.M, Math.floor(parsed.S || 0)),
      );
      return dt.toISOString().slice(0, 19).replace("T", " ");
    }
  }
  const raw = value instanceof Date ? value.toISOString() : String(value);
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 19).replace("T", " ");
}

function toDateSql(value: unknown): string | null {
  if (value == null || String(value).trim() === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
    }
  }
  if (value instanceof Date) return getDateStringInTimeZone(value, SERVER_TIMEZONE);
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return null;
  return getDateStringInTimeZone(dt, SERVER_TIMEZONE);
}

function toEmployeeId(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s ? s : null;
}

function parseTimeOnly(value: unknown): { hour: number; minute: number; second: number } | null {
  if (value == null) return null;
  const raw = String(value).trim().toLowerCase();
  if (!raw) return null;
  const match = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] || "0");
  const ampm = (match[4] || "").toLowerCase();
  if (Number.isNaN(hour) || Number.isNaN(minute) || Number.isNaN(second)) return null;
  if (ampm === "pm" && hour < 12) hour += 12;
  if (ampm === "am" && hour === 12) hour = 0;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) return null;
  return { hour, minute, second };
}

function combineDateAndTimeSql(dateSql: string | null, timeValue: unknown): string | null {
  if (!dateSql || timeValue == null || String(timeValue).trim() === "") return null;

  // Excel numeric time serial (e.g., 0.75 for 18:00:00)
  if (typeof timeValue === "number" && Number.isFinite(timeValue) && timeValue >= 0 && timeValue < 1) {
    const totalSeconds = Math.floor(timeValue * 24 * 3600);
    const hour = Math.floor(totalSeconds / 3600);
    const minute = Math.floor((totalSeconds % 3600) / 60);
    const second = totalSeconds % 60;
    return `${dateSql} ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`;
  }

  const t = parseTimeOnly(timeValue);
  if (t) {
    return `${dateSql} ${String(t.hour).padStart(2, "0")}:${String(t.minute).padStart(2, "0")}:${String(t.second).padStart(2, "0")}`;
  }

  return toDateTimeSql(timeValue);
}

function addOneDay(dateSql: string) {
  const d = new Date(`${dateSql}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return dateSql;
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function ensureAttendanceTable(conn: any) {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS employee_attendance (
      id INT AUTO_INCREMENT PRIMARY KEY,
      employee_id VARCHAR(50) NOT NULL,
      employee_name VARCHAR(150) NULL,
      date DATE NOT NULL,
      clock_in DATETIME NULL,
      clock_out DATETIME NULL,
      total_hours DECIMAL(5,2) NULL,
      INDEX (employee_id),
      INDEX (date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}

async function importAttendance(conn: any, rows: Record<string, unknown>[]) {
  await ensureAttendanceTable(conn);
  const [employeeRows] = await conn.execute(
    `SELECT id, employee_code, CONCAT(first_name, ' ', last_name) AS full_name FROM hrm_employees`,
  );
  const nameToId = new Map<string, string>();
  const codeToId = new Map<string, string>();
  const idSet = new Set<string>();
  (employeeRows as any[]).forEach((e) => {
    const id = String(e.id);
    idSet.add(id);
    const fullName = String(e.full_name || "").trim().toLowerCase();
    if (fullName) nameToId.set(fullName, id);
    const code = String(e.employee_code || "").trim();
    if (code) codeToId.set(code, id);
  });

  let inserted = 0;
  for (const row of rows) {
    const fullNameRaw = getCell(row, [
      "employee name",
      "full name",
      "full_name",
      "emp name",
      "employee_name",
      "name",
    ]);
    const employeeName = String(fullNameRaw ?? "").trim();
    const rawEmployeeId = toEmployeeId(
      getCell(row, ["employee id", "id", "employee_id", "emp id", "emp code", "employee code"]),
    );
    let employeeId: string | null = null;
    if (rawEmployeeId) {
      // If file has internal HRM id, keep it; otherwise treat as employee_code and map to HRM id.
      if (idSet.has(rawEmployeeId)) employeeId = rawEmployeeId;
      else employeeId = codeToId.get(rawEmployeeId) || null;
    }
    if (!employeeId && employeeName) {
      employeeId = nameToId.get(employeeName.toLowerCase()) || null;
    }
    const date = toDateSql(getCell(row, ["date", "attendance date", "work date", "att date"]));
    const clockInRaw = getCell(row, ["clock in", "clock_in", "in", "punch in", "time in"]);
    const clockOutRaw = getCell(row, ["clock out", "clock_out", "out", "punch out", "time out"]);
    const clockIn = combineDateAndTimeSql(date, clockInRaw);
    let clockOut = combineDateAndTimeSql(date, clockOutRaw);
    if (date && clockIn && clockOut && new Date(clockOut).getTime() < new Date(clockIn).getTime()) {
      clockOut = combineDateAndTimeSql(addOneDay(date), clockOutRaw);
    }
    if (!employeeId || !date) continue;

    await conn.execute(
      `INSERT INTO employee_attendance (employee_id, employee_name, date, clock_in, clock_out, total_hours)
       VALUES (?, ?, ?, ?, ?, CASE WHEN ? IS NOT NULL AND ? IS NOT NULL THEN ROUND(TIMESTAMPDIFF(MINUTE, ?, ?)/60, 2) ELSE NULL END)`,
      [employeeId, employeeName, date, clockIn, clockOut, clockIn, clockOut, clockIn, clockOut],
    );
    inserted += 1;
  }
  return inserted;
}

async function importBreakLike(
  conn: any,
  rows: Record<string, unknown>[],
  table: "breaks" | "prayer_breaks",
) {
  const isPrayer = table === "prayer_breaks";
  const startCol = isPrayer ? "prayer_break_start" : "break_start";
  const endCol = isPrayer ? "prayer_break_end" : "break_end";
  const durationCol = isPrayer ? "prayer_break_duration" : "break_duration";
  let inserted = 0;

  for (const row of rows) {
    const employeeIdRaw = getCell(row, ["employee id", "employee_id", "id", "emp id"]);
    const employeeId = Number(employeeIdRaw);
    if (!employeeId || Number.isNaN(employeeId)) continue;

    const employeeName = String(
      getCell(row, ["employee name", "full name", "name", "employee_name"]) ?? "",
    ).trim();
    const date = toDateSql(getCell(row, ["date"]));
    const start = toDateTimeSql(
      getCell(row, [
        isPrayer ? "prayer start" : "break start",
        isPrayer ? "prayer_break_start" : "break_start",
      ]),
    );
    const end = toDateTimeSql(
      getCell(row, [
        isPrayer ? "prayer end" : "break end",
        isPrayer ? "prayer_break_end" : "break_end",
      ]),
    );
    if (!date || !start) continue;
    const duration =
      start && end
        ? Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 1000)
        : null;

    await conn.execute(
      `INSERT INTO ${table} (employee_id, employee_name, date, ${startCol}, ${endCol}, ${durationCol})
       VALUES (?, ?, ?, ?, ?, ?)`,
      [employeeId, employeeName, date, start, end, duration],
    );
    inserted += 1;
  }
  return inserted;
}

export async function POST(req: NextRequest) {
  let conn: any;
  try {
    const form = await req.formData();
    const file = form.get("file");
    const target = String(form.get("target") || "") as ImportTarget;
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ success: false, error: "Excel file is required" }, { status: 400 });
    }
    if (!["attendance", "breaks", "prayer_breaks"].includes(target)) {
      return NextResponse.json({ success: false, error: "Invalid import target" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
    if (!workbook.SheetNames.length) {
      return NextResponse.json({ success: false, error: "No sheet found in file" }, { status: 400 });
    }
    let allRows: Record<string, unknown>[] = [];
    workbook.SheetNames.forEach((sheetName) => {
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], {
        defval: null,
        raw: true,
      });
      allRows = allRows.concat(rows);
    });
    if (!allRows.length) {
      return NextResponse.json({ success: false, error: "Excel file has no data rows" }, { status: 400 });
    }

    conn = await pool.getConnection();
    await conn.beginTransaction();
    let imported = 0;
    if (target === "attendance") imported = await importAttendance(conn, allRows);
    else if (target === "breaks") imported = await importBreakLike(conn, allRows, "breaks");
    else imported = await importBreakLike(conn, allRows, "prayer_breaks");
    await conn.commit();

    return NextResponse.json({
      success: true,
      imported,
      totalRows: allRows.length,
      skipped: Math.max(0, allRows.length - imported),
      target,
      message: `Imported ${imported} rows into ${target}.`,
    });
  } catch (e) {
    if (conn) await conn.rollback();
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 });
  } finally {
    if (conn) conn.release();
  }
}
