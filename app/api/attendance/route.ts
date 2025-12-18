import { NextRequest, NextResponse } from "next/server";
import mysql from "mysql2/promise";

const dbConfig = {
  host: "localhost",
  user: "root",
  password: "",
  database: "interact_hrm"
};

// Use a dedicated table for attendance to avoid legacy conflicts
const ATTENDANCE_TABLE = "employee_attendance";

async function ensureAttendanceTable(conn: mysql.Connection) {
  const createSql = `
    CREATE TABLE IF NOT EXISTS ${ATTENDANCE_TABLE} (
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
  `;
  await conn.execute(createSql);
}

// GET: Fetch all attendance records or by employeeId
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const employeeId = searchParams.get("employeeId");
    const date = searchParams.get("date");
    const conn = await mysql.createConnection(dbConfig);
    await ensureAttendanceTable(conn);
    let rows;
    if (employeeId && date) {
      [rows] = await conn.execute(
        `SELECT * FROM ${ATTENDANCE_TABLE} WHERE employee_id = ? AND DATE(date) = ? ORDER BY date DESC`,
        [employeeId, date]
      );
    } else if (employeeId) {
      [rows] = await conn.execute(
        `SELECT * FROM ${ATTENDANCE_TABLE} WHERE employee_id = ? ORDER BY date DESC`,
        [employeeId]
      );
    } else if (date) {
      [rows] = await conn.execute(
        `SELECT * FROM ${ATTENDANCE_TABLE} WHERE DATE(date) = ? ORDER BY date DESC`,
        [date]
      );
    } else {
      [rows] = await conn.execute(
        `SELECT * FROM ${ATTENDANCE_TABLE} ORDER BY date DESC`
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
  
  console.log("Attendance API POST Data:", { employee_id, employee_name, date, clock_in, clock_out });
  
  // Ensure date is in YYYY-MM-DD format for database consistency
  const formattedDate = date;

  if (!employee_id || !formattedDate) {
    return NextResponse.json({ success: false, error: "Missing required fields: employee_id or date" }, { status: 400 });
  }

  try {
    const conn = await mysql.createConnection(dbConfig);
    await ensureAttendanceTable(conn);

    // Check if a record already exists for this employee & date
    const [existingRows] = await conn.execute(
      `SELECT id, clock_in, clock_out FROM ${ATTENDANCE_TABLE} WHERE employee_id = ? AND date = ?`,
      [employee_id, formattedDate]
    );
    const existing = (existingRows as any[])[0];

    if (existing) {
      if (clock_out !== undefined && clock_out !== null) {
        const formattedClockOut = new Date(clock_out).toISOString().slice(0, 19).replace('T', ' ');
        // Compute total hours in SQL to avoid timezone/parse issues
        await conn.execute(
          `UPDATE ${ATTENDANCE_TABLE} SET clock_out = ?, total_hours = ROUND(TIMESTAMPDIFF(MINUTE, clock_in, ?)/60, 2), employee_name = ? WHERE id = ?`,
          [formattedClockOut, formattedClockOut, employee_name || null, existing.id]
        );
      } else if (clock_in !== undefined && clock_in !== null) {
        // Update clock_in, reset clock_out and total_hours
        await conn.execute(
          `UPDATE ${ATTENDANCE_TABLE} SET clock_in = ?, clock_out = NULL, total_hours = NULL WHERE id = ?`,
          [new Date(clock_in).toISOString().slice(0, 19).replace('T', ' '), existing.id]
        );
      }
    } else {
      // No existing record: insert a new row with clock_in. clock_out and total_hours will be NULL.
      if (clock_in !== undefined && clock_in !== null) { // Only insert if clock_in is provided for a new record
        console.log("Inserting new attendance record:", { employee_id, employee_name, formattedDate, clock_in });
        await conn.execute(
          `INSERT INTO ${ATTENDANCE_TABLE} (employee_id, employee_name, date, clock_in, clock_out, total_hours)
           VALUES (?, ?, ?, ?, NULL, NULL)`,
          [employee_id, employee_name || '', formattedDate, new Date(clock_in).toISOString().slice(0, 19).replace('T', ' ')]
        );
        console.log("Attendance record inserted successfully");
      }
    }

    await conn.end();
    return NextResponse.json({ success: true, message: existing ? 'updated' : 'inserted' });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: errMsg }, { status: 500 });
  }
}
