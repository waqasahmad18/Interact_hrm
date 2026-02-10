import { NextRequest, NextResponse } from "next/server";
import { pool } from "../../../lib/db";

// GET: Fetch all breaks or by employeeId/date
export async function GET(req: NextRequest) {
  let conn;
  try {
    const { searchParams } = new URL(req.url);
    const employeeId = searchParams.get("employeeId");
    const date = searchParams.get("date"); // YYYY-MM-DD format from frontend
    conn = await pool.getConnection();
    if (!conn) {
      throw new Error("Failed to get database connection from pool");
    }
    let rows;
    // Join with hrm_employees for pseudonym and departments for department name
    let query = `SELECT b.*, e.pseudonym, d.name AS department_name
      FROM breaks b
      LEFT JOIN hrm_employees e ON b.employee_id = e.id
      LEFT JOIN employee_jobs j ON e.id = j.employee_id
      LEFT JOIN departments d ON j.department_id = d.id
      WHERE 1=1`;
    const params: (string|number)[] = [];
    if (employeeId) {
      query += " AND b.employee_id = ?";
      params.push(Number(employeeId));
    }
    if (date) {
      query += " AND DATE(b.break_start) = ?";
      params.push(date);
    }
    query += " ORDER BY b.break_start DESC, b.break_start ASC";
    [rows] = await conn.execute(query, params);
    const formattedBreaks = (rows as any[]).map(row => ({
      ...row,
      employee_name: row.employee_name || "",
      pseudonym: row.pseudonym || "",
      break_start: row.break_start ? new Date(row.break_start + 'Z').toISOString() : null,
      break_end: row.break_end ? new Date(row.break_end + 'Z').toISOString() : null,
      break_duration: row.break_duration ? Number(row.break_duration) : null,
    }));
    return NextResponse.json({ success: true, breaks: formattedBreaks });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('GET breaks error:', error);
    return NextResponse.json({ success: false, error: errMsg }, { status: 500 });
  } finally {
    if (conn) conn.release();
  }
}

// POST: Add or update break record
export async function POST(req: NextRequest) {
  let conn;
  try {
    const data = await req.json();
    const { employee_id, employee_name, date, break_start, break_end } = data || {};
    if (!employee_id || !date) {
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 });
    }

    const formattedDate = new Date(date).toISOString().slice(0, 10); // YYYY-MM-DD

    conn = await pool.getConnection();

    // Lunch break logic only
    if (break_start) {
      // Starting a new lunch break
      const [ongoingBreaks] = await conn.execute(
        "SELECT id FROM breaks WHERE employee_id = ? AND DATE(break_start) = ? AND break_end IS NULL",
        [Number(employee_id), formattedDate]
      );
      if ((ongoingBreaks as any[]).length > 0) {
        return NextResponse.json({ success: false, error: "An ongoing lunch break already exists for this employee for today." }, { status: 400 });
      }
      await conn.execute(
        "INSERT INTO breaks (employee_id, employee_name, date, break_start, break_end, break_duration) VALUES (?, ?, ?, ?, NULL, NULL)",
        [Number(employee_id), employee_name || "", formattedDate, new Date(break_start).toISOString().slice(0, 19).replace('T', ' ')]
      );
    } else if (break_end) {
      // Ending an existing lunch break - find ANY open break (not just today)
      const [latestBreakRows] = await conn.execute(
        "SELECT id, break_start FROM breaks WHERE employee_id = ? AND break_end IS NULL ORDER BY break_start DESC LIMIT 1",
        [Number(employee_id)]
      );
      const latestBreak = (latestBreakRows as any[])[0];
      if (!latestBreak) {
        return NextResponse.json({ success: false, error: "No ongoing lunch break found for this employee." }, { status: 400 });
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

    return NextResponse.json({ success: true });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('POST breaks error:', error);
    return NextResponse.json({ success: false, error: errMsg }, { status: 500 });
  } finally {
    if (conn) conn.release();
  }
}
// PUT: Update existing break record (Admin manual edit)
export async function PUT(req: NextRequest) {
  let conn;
  try {
    const data = await req.json();
    const { id, employee_id, employee_name, date, break_start, break_end } = data || {};

    if (!id || !employee_id) {
      return NextResponse.json({ success: false, error: "Missing required fields: id or employee_id" }, { status: 400 });
    }

    conn = await pool.getConnection();

    const formattedDate = date ? new Date(date).toISOString().slice(0, 10) : null;
    const formattedBreakStart = break_start ? new Date(break_start).toISOString().slice(0, 19).replace('T', ' ') : null;
    const formattedBreakEnd = break_end ? new Date(break_end).toISOString().slice(0, 19).replace('T', ' ') : null;

    // Calculate duration if both start and end are provided
    let breakDuration = null;
    if (formattedBreakStart && formattedBreakEnd) {
      const startTime = new Date(break_start).getTime();
      const endTime = new Date(break_end).getTime();
      breakDuration = Math.floor((endTime - startTime) / 1000); // Duration in seconds
    }

    await conn.execute(
      `UPDATE breaks 
       SET employee_name = ?, date = ?, break_start = ?, break_end = ?, 
           break_duration = ?
       WHERE id = ?`,
      [employee_name || '', formattedDate, formattedBreakStart, formattedBreakEnd, breakDuration, id]
    );

    return NextResponse.json({ success: true, message: 'Break updated successfully' });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('PUT breaks error:', error);
    return NextResponse.json({ success: false, error: errMsg }, { status: 500 });
  } finally {
    if (conn) conn.release();
  }
}

// DELETE: Delete break record
export async function DELETE(req: NextRequest) {
  let conn;
  try {
    const data = await req.json();
    const { id } = data || {};

    if (!id) {
      return NextResponse.json({ success: false, error: "Missing required field: id" }, { status: 400 });
    }

    conn = await pool.getConnection();
    await conn.execute(`DELETE FROM breaks WHERE id = ?`, [id]);

    return NextResponse.json({ success: true, message: 'Break deleted successfully' });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('DELETE breaks error:', error);
    return NextResponse.json({ success: false, error: errMsg }, { status: 500 });
  } finally {
    if (conn) conn.release();
  }
}