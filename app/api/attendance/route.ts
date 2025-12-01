import { NextRequest, NextResponse } from "next/server";
import mysql from "mysql2/promise";

const dbConfig = {
  host: "localhost",
  user: "root",
  password: "",
  database: "interact_hrm"
};

// GET: Fetch all attendance records or by employeeId
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const employeeId = searchParams.get("employeeId");
    const date = searchParams.get("date");
    const conn = await mysql.createConnection(dbConfig);
    let rows;
    if (employeeId && date) {
      [rows] = await conn.execute(
        "SELECT * FROM attendance WHERE employee_id = ? AND DATE(date) = ? ORDER BY date DESC",
        [employeeId, date]
      );
    } else if (employeeId) {
      [rows] = await conn.execute(
        "SELECT * FROM attendance WHERE employee_id = ? ORDER BY date DESC",
        [employeeId]
      );
    } else if (date) {
      [rows] = await conn.execute(
        "SELECT * FROM attendance WHERE DATE(date) = ? ORDER BY date DESC",
        [date]
      );
    } else {
      [rows] = await conn.execute(
        "SELECT * FROM attendance ORDER BY date DESC"
      );
    }

    // Simply return the rows as is; frontend will handle date parsing.
    await conn.end();
    const formattedAttendance = (rows as any[]).map(row => {
      let formattedClockIn = null;
      if (row.clock_in) {
        // Add 'Z' to assume UTC and ensure proper parsing by new Date()
        const clockInDate = new Date(String(row.clock_in) + 'Z');
        if (!isNaN(clockInDate.getTime())) {
            formattedClockIn = clockInDate.toISOString();
        }
      }

      let formattedClockOut = null;
      if (row.clock_out) {
        // Add 'Z' to assume UTC and ensure proper parsing by new Date()
        const clockOutDate = new Date(String(row.clock_out) + 'Z');
        if (!isNaN(clockOutDate.getTime())) {
            formattedClockOut = clockOutDate.toISOString();
        }
      }

      return {
        ...row,
        clock_in: formattedClockIn,
        clock_out: formattedClockOut,
      };
    });
    return NextResponse.json({ success: true, attendance: formattedAttendance });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: errMsg }, { status: 500 });
  }
}

// POST: Add or update attendance record
export async function POST(req: NextRequest) {
  const data = await req.json();
  const { employee_id, employee_name, date, clock_in, clock_out } = data || {};
  // Ensure date is in YYYY-MM-DD format for database consistency
  const formattedDate = date ? new Date(date).toISOString().slice(0, 10) : null;

  if (!employee_id || !formattedDate) {
    return NextResponse.json({ success: false, error: "Missing required fields: employee_id or date" }, { status: 400 });
  }

  try {
    const conn = await mysql.createConnection(dbConfig);

    // Check if a record already exists for this employee & date
    const [existingRows] = await conn.execute(
      "SELECT id, clock_in, clock_out FROM attendance WHERE employee_id = ? AND date = ?",
      [employee_id, formattedDate]
    );
    const existing = (existingRows as any[])[0];

    if (existing) {
      if (clock_out !== undefined && clock_out !== null) {
        const clockInTime = new Date(existing.clock_in).getTime();
        const clockOutTime = new Date(clock_out).getTime();
        const totalHours = (clockOutTime - clockInTime) / (1000 * 60 * 60);
        await conn.execute(
          "UPDATE attendance SET clock_out = ?, total_hours = ?, employee_name = ? WHERE id = ?",
          [new Date(clock_out).toISOString().slice(0, 19).replace('T', ' '), totalHours.toFixed(2), employee_name, existing.id]
        );
      } else if (clock_in !== undefined && clock_in !== null) {
        // Update clock_in, reset clock_out and total_hours
        await conn.execute(
          "UPDATE attendance SET clock_in = ?, clock_out = NULL, total_hours = NULL WHERE id = ?",
          [new Date(clock_in).toISOString().slice(0, 19).replace('T', ' '), existing.id]
        );
      }
    } else {
      // No existing record: insert a new row with clock_in. clock_out and total_hours will be NULL.
      if (clock_in !== undefined && clock_in !== null) { // Only insert if clock_in is provided for a new record
        await conn.execute(
          `INSERT INTO attendance (employee_id, date, clock_in, clock_out, total_hours)
           VALUES (?, ?, ?, NULL, NULL)`,
          [employee_id, formattedDate, new Date(clock_in).toISOString().slice(0, 19).replace('T', ' ')]
        );
      }
    }

    await conn.end();
    return NextResponse.json({ success: true });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: errMsg }, { status: 500 });
  }
}
