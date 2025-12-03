import { NextRequest, NextResponse } from "next/server";
import mysql from "mysql2/promise";

const dbConfig = {
  host: "localhost",
  user: "root",
  password: "",
  database: "interact_hrm"
};

// GET: Fetch all breaks or by employeeId/date
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const employeeId = searchParams.get("employeeId");
    const date = searchParams.get("date"); // YYYY-MM-DD format from frontend
    const conn = await mysql.createConnection(dbConfig);
    let rows;

    // Removed LEFT JOIN employee e as it's causing "Table 'interact_hrm.employee' doesn't exist" error.
    let query = "SELECT b.* FROM breaks b WHERE 1=1"; // Simplified query
    const params: string[] = [];

    if (employeeId) {
      query += " AND b.employee_id = ?";
      params.push(employeeId);
    }
    if (date) {
      // Use break_start for date filtering
      query += " AND DATE(b.break_start) = ?";
      params.push(date);
    }
    query += " ORDER BY b.break_start DESC, b.break_start ASC";

    console.log("Breaks API GET Query:", query);
    console.log("Breaks API GET Parameters:", params);

    [rows] = await conn.execute(query, params);

    // Only lunch break fields
    const formattedBreaks = (rows as any[]).map(row => ({
      ...row,
      employee_name: row.employee_name || "",
      break_start: row.break_start ? new Date(row.break_start + 'Z').toISOString() : null,
      break_end: row.break_end ? new Date(row.break_end + 'Z').toISOString() : null,
      break_duration: row.break_duration ? Number(row.break_duration) : null,
    }));

    await conn.end();
    return NextResponse.json({ success: true, breaks: formattedBreaks });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: errMsg }, { status: 500 });
  }
}

// POST: Add or update break record
export async function POST(req: NextRequest) {
  const data = await req.json();
  const { employee_id, employee_name, date, break_start, break_end } = data || {};
  if (!employee_id || !date) {
    return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 });
  }

  const formattedDate = new Date(date).toISOString().slice(0, 10); // YYYY-MM-DD

  try {
    const conn = await mysql.createConnection(dbConfig);

    // Lunch break logic only
    if (break_start) {
      // Starting a new lunch break
      const [ongoingBreaks] = await conn.execute(
        "SELECT id FROM breaks WHERE employee_id = ? AND DATE(break_start) = ? AND break_end IS NULL",
        [employee_id, formattedDate]
      );
      if ((ongoingBreaks as any[]).length > 0) {
        return NextResponse.json({ success: false, error: "An ongoing lunch break already exists for this employee for today." }, { status: 400 });
      }
      await conn.execute(
        "INSERT INTO breaks (employee_id, employee_name, date, break_start, break_end, break_duration) VALUES (?, ?, ?, ?, NULL, NULL)",
        [employee_id, employee_name || "", formattedDate, new Date(break_start).toISOString().slice(0, 19).replace('T', ' ')]
      );
    } else if (break_end) {
      // Ending an existing lunch break
      const [latestBreakRows] = await conn.execute(
        "SELECT id, break_start FROM breaks WHERE employee_id = ? AND DATE(break_start) = ? AND break_end IS NULL ORDER BY break_start DESC LIMIT 1",
        [employee_id, formattedDate]
      );
      const latestBreak = (latestBreakRows as any[])[0];
      if (!latestBreak) {
        return NextResponse.json({ success: false, error: "No ongoing lunch break found for this employee for today." }, { status: 400 });
      }
      const breakStartTime = new Date(latestBreak.break_start + 'Z').getTime();
      const breakEndTime = new Date(break_end).getTime();
      const breakDurationInSeconds = (breakEndTime - breakStartTime) / 1000;
      await conn.execute(
        "UPDATE breaks SET break_end = ?, break_duration = ? WHERE id = ?",
        [new Date(break_end).toISOString().slice(0, 19).replace('T', ' '), breakDurationInSeconds, latestBreak.id]
      );
    } else {
      return NextResponse.json({ success: false, error: "Invalid break action." }, { status: 400 });
    }

    await conn.end();
    return NextResponse.json({ success: true });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: errMsg }, { status: 500 });
  }
}
