import { NextRequest, NextResponse } from "next/server";
import mysql from "mysql2/promise";

const dbConfig = {
  host: "localhost",
  user: "root",
  password: "",
  database: "interact_hrm"
};

// GET: Fetch all prayer breaks or by employeeId/date
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const employeeId = searchParams.get("employeeId");
    const date = searchParams.get("date"); // YYYY-MM-DD format from frontend
    const conn = await mysql.createConnection(dbConfig);
    let query = "SELECT * FROM prayer_breaks WHERE 1=1";
    const params: string[] = [];
    if (employeeId) {
      query += " AND employee_id = ?";
      params.push(employeeId);
    }
    if (date) {
      query += " AND DATE(prayer_break_start) = ?";
      params.push(date);
    }
    query += " ORDER BY prayer_break_start DESC, prayer_break_start ASC";
    const [rows] = await conn.execute(query, params);
    const formattedPrayerBreaks = (rows as any[]).map(row => ({
      ...row,
      employee_name: row.employee_name || "",
      prayer_break_start: row.prayer_break_start ? new Date(row.prayer_break_start + 'Z').toISOString() : null,
      prayer_break_end: row.prayer_break_end ? new Date(row.prayer_break_end + 'Z').toISOString() : null,
      prayer_break_duration: row.prayer_break_duration ? Number(row.prayer_break_duration) : null,
    }));
    await conn.end();
    return NextResponse.json({ success: true, prayer_breaks: formattedPrayerBreaks });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: errMsg }, { status: 500 });
  }
}

// POST: Add or update prayer break record
export async function POST(req: NextRequest) {
  const data = await req.json();
  const { employee_id, employee_name, date, prayer_break_start, prayer_break_end } = data || {};
  if (!employee_id || !date) {
    return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 });
  }
  const formattedDate = new Date(date).toISOString().slice(0, 10); // YYYY-MM-DD
  try {
    const conn = await mysql.createConnection(dbConfig);
    if (prayer_break_start) {
      // Starting a new prayer break
      const [ongoingPrayerBreaks] = await conn.execute(
        "SELECT id FROM prayer_breaks WHERE employee_id = ? AND DATE(prayer_break_start) = ? AND prayer_break_end IS NULL",
        [employee_id, formattedDate]
      );
      if ((ongoingPrayerBreaks as any[]).length > 0) {
        return NextResponse.json({ success: false, error: "An ongoing prayer break already exists for this employee for today." }, { status: 400 });
      }
      await conn.execute(
        "INSERT INTO prayer_breaks (employee_id, employee_name, date, prayer_break_start, prayer_break_end, prayer_break_duration) VALUES (?, ?, ?, ?, NULL, NULL)",
        [employee_id, employee_name || "", formattedDate, new Date(prayer_break_start).toISOString().slice(0, 19).replace('T', ' ')]
      );
    } else if (prayer_break_end) {
      // Ending an existing prayer break
      const [latestPrayerBreakRows] = await conn.execute(
        "SELECT id, prayer_break_start FROM prayer_breaks WHERE employee_id = ? AND DATE(prayer_break_start) = ? AND prayer_break_end IS NULL ORDER BY prayer_break_start DESC LIMIT 1",
        [employee_id, formattedDate]
      );
      const latestPrayerBreak = (latestPrayerBreakRows as any[])[0];
      if (!latestPrayerBreak) {
        return NextResponse.json({ success: false, error: "No ongoing prayer break found for this employee for today." }, { status: 400 });
      }
      const prayerBreakStartTime = new Date(latestPrayerBreak.prayer_break_start + 'Z').getTime();
      const prayerBreakEndTime = new Date(prayer_break_end).getTime();
      const prayerBreakDurationInSeconds = (prayerBreakEndTime - prayerBreakStartTime) / 1000;
      await conn.execute(
        "UPDATE prayer_breaks SET prayer_break_end = ?, prayer_break_duration = ? WHERE id = ?",
        [new Date(prayer_break_end).toISOString().slice(0, 19).replace('T', ' '), prayerBreakDurationInSeconds, latestPrayerBreak.id]
      );
    } else {
      return NextResponse.json({ success: false, error: "Invalid prayer break action." }, { status: 400 });
    }
    await conn.end();
    return NextResponse.json({ success: true });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: errMsg }, { status: 500 });
  }
}
