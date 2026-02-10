import { NextRequest, NextResponse } from "next/server";
import { pool } from "../../../lib/db";

// GET: Fetch all prayer breaks or by employeeId/date
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
    let query = `SELECT pb.*, e.pseudonym, d.name AS department_name
      FROM prayer_breaks pb
      LEFT JOIN hrm_employees e ON pb.employee_id = e.id
      LEFT JOIN employee_jobs j ON e.id = j.employee_id
      LEFT JOIN departments d ON j.department_id = d.id
      WHERE 1=1`;
    const params: (string|number)[] = [];
    if (employeeId) {
      query += " AND pb.employee_id = ?";
      params.push(Number(employeeId));
    }
    if (date) {
      query += " AND DATE(pb.prayer_break_start) = ?";
      params.push(date);
    }
    query += " ORDER BY pb.prayer_break_start DESC, pb.prayer_break_start ASC";
    const [rows] = await conn.execute(query, params);
    const formattedPrayerBreaks = (rows as any[]).map(row => ({
      ...row,
      employee_name: row.employee_name || "",
      pseudonym: row.pseudonym || "",
      prayer_break_start: row.prayer_break_start ? new Date(row.prayer_break_start + 'Z').toISOString() : null,
      prayer_break_end: row.prayer_break_end ? new Date(row.prayer_break_end + 'Z').toISOString() : null,
      prayer_break_duration: row.prayer_break_duration ? Number(row.prayer_break_duration) : null,
    }));
    return NextResponse.json({ success: true, prayer_breaks: formattedPrayerBreaks });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('GET prayer_breaks error:', error);
    return NextResponse.json({ success: false, error: errMsg }, { status: 500 });
  } finally {
    if (conn) conn.release();
  }
}

// POST: Add or update prayer break record
export async function POST(req: NextRequest) {
  let conn;
  try {
    const data = await req.json();
    const { employee_id, employee_name, date, prayer_break_start, prayer_break_end } = data || {};
    if (!employee_id || !date) {
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 });
    }
    const formattedDate = new Date(date).toISOString().slice(0, 10); // YYYY-MM-DD
    conn = await pool.getConnection();
    if (prayer_break_start) {
      // Starting a new prayer break
      const [ongoingPrayerBreaks] = await conn.execute(
        "SELECT id FROM prayer_breaks WHERE employee_id = ? AND DATE(prayer_break_start) = ? AND prayer_break_end IS NULL",
        [Number(employee_id), formattedDate]
      );
      if ((ongoingPrayerBreaks as any[]).length > 0) {
        return NextResponse.json({ success: false, error: "An ongoing prayer break already exists for this employee for today." }, { status: 400 });
      }
      await conn.execute(
        "INSERT INTO prayer_breaks (employee_id, employee_name, date, prayer_break_start, prayer_break_end, prayer_break_duration) VALUES (?, ?, ?, ?, NULL, NULL)",
        [Number(employee_id), employee_name || "", formattedDate, new Date(prayer_break_start).toISOString().slice(0, 19).replace('T', ' ')]
      );
    } else if (prayer_break_end) {
      // Ending an existing prayer break - find ANY open prayer break (not just today)
      const [latestPrayerBreakRows] = await conn.execute(
        "SELECT id, prayer_break_start FROM prayer_breaks WHERE employee_id = ? AND prayer_break_end IS NULL ORDER BY prayer_break_start DESC LIMIT 1",
        [Number(employee_id)]
      );
      const latestPrayerBreak = (latestPrayerBreakRows as any[])[0];
      if (!latestPrayerBreak) {
        return NextResponse.json({ success: false, error: "No ongoing prayer break found for this employee." }, { status: 400 });
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
    return NextResponse.json({ success: true });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('POST prayer_breaks error:', error);
    return NextResponse.json({ success: false, error: errMsg }, { status: 500 });
  } finally {
    if (conn) conn.release();
  }
}
// PUT: Update existing prayer break record (Admin manual edit)
export async function PUT(req: NextRequest) {
  let conn;
  try {
    const data = await req.json();
    const { id, employee_id, employee_name, date, prayer_break_start, prayer_break_end } = data || {};

    if (!id || !employee_id) {
      return NextResponse.json({ success: false, error: "Missing required fields: id or employee_id" }, { status: 400 });
    }

    conn = await pool.getConnection();

    const formattedDate = date ? new Date(date).toISOString().slice(0, 10) : null;
    const formattedPrayerBreakStart = prayer_break_start ? new Date(prayer_break_start).toISOString().slice(0, 19).replace('T', ' ') : null;
    const formattedPrayerBreakEnd = prayer_break_end ? new Date(prayer_break_end).toISOString().slice(0, 19).replace('T', ' ') : null;

    // Calculate duration if both start and end are provided
    let prayerBreakDuration = null;
    if (formattedPrayerBreakStart && formattedPrayerBreakEnd) {
      const startTime = new Date(prayer_break_start).getTime();
      const endTime = new Date(prayer_break_end).getTime();
      prayerBreakDuration = Math.floor((endTime - startTime) / 1000); // Duration in seconds
    }

    await conn.execute(
      `UPDATE prayer_breaks 
       SET employee_name = ?, date = ?, prayer_break_start = ?, prayer_break_end = ?, 
           prayer_break_duration = ?
       WHERE id = ?`,
      [employee_name || '', formattedDate, formattedPrayerBreakStart, formattedPrayerBreakEnd, prayerBreakDuration, id]
    );

    return NextResponse.json({ success: true, message: 'Prayer break updated successfully' });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('PUT prayer_breaks error:', error);
    return NextResponse.json({ success: false, error: errMsg }, { status: 500 });
  } finally {
    if (conn) conn.release();
  }
}

// DELETE: Delete prayer break record
export async function DELETE(req: NextRequest) {
  let conn;
  try {
    const data = await req.json();
    const { id } = data || {};

    if (!id) {
      return NextResponse.json({ success: false, error: "Missing required field: id" }, { status: 400 });
    }

    conn = await pool.getConnection();
    await conn.execute(`DELETE FROM prayer_breaks WHERE id = ?`, [id]);

    return NextResponse.json({ success: true, message: 'Prayer break deleted successfully' });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('DELETE prayer_breaks error:', error);
    return NextResponse.json({ success: false, error: errMsg }, { status: 500 });
  } finally {
    if (conn) conn.release();
  }
}