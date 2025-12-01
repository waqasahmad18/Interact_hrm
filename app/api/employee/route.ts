export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const employeeId = searchParams.get("employeeId");
  if (!employeeId) {
    return NextResponse.json({ success: false, error: "Missing employeeId" }, { status: 400 });
  }
  try {
    const conn = await mysql.createConnection(dbConfig);
    await conn.execute('DELETE FROM employee_details WHERE employee_id = ?', [employeeId]);
    await conn.execute('DELETE FROM employees WHERE employee_id = ?', [employeeId]);
    await conn.end();
    return NextResponse.json({ success: true });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: errMsg }, { status: 500 });
  }
}
import { NextRequest, NextResponse } from "next/server";
import mysql from "mysql2/promise";

const dbConfig = {
  host: "localhost",
  user: "root",
  password: "",
  database: "interact_hrm"
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const employeeId = searchParams.get("employeeId");
    const username = searchParams.get("username");
    const email = searchParams.get("email");
    const conn = await mysql.createConnection(dbConfig);
    if (employeeId) {
      const [rows] = await conn.execute(
        'SELECT employee_id, first_name, last_name, username, email, password FROM employees WHERE employee_id = ?', [employeeId]
      );
      await conn.end();
      const result = rows as any[];
      if (result && result.length > 0) {
        return NextResponse.json({ success: true, employee: result[0] });
      } else {
        return NextResponse.json({ success: false, error: "Employee not found" }, { status: 404 });
      }
    } else if (username) {
      const [rows] = await conn.execute(
        'SELECT employee_id, first_name, last_name, username, email, password FROM employees WHERE username = ?', [username]
      );
      await conn.end();
      const result = rows as any[];
      if (result && result.length > 0) {
        return NextResponse.json({ success: true, employee: result[0] });
      } else {
        return NextResponse.json({ success: false, error: "Employee not found" }, { status: 404 });
      }
    } else if (email) {
      const [rows] = await conn.execute(
        'SELECT employee_id, first_name, last_name, username, email, password FROM employees WHERE email = ?', [email]
      );
      await conn.end();
      const result = rows as any[];
      if (result && result.length > 0) {
        return NextResponse.json({ success: true, employee: result[0] });
      } else {
        return NextResponse.json({ success: false, error: "Employee not found" }, { status: 404 });
      }
    } else {
      const [rows] = await conn.execute(
        'SELECT id, first_name, middle_name, last_name, employee_id, gender, nationality, profile_img FROM employees ORDER BY id DESC'
      );
      await conn.end();
      return NextResponse.json({ success: true, employees: rows });
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: errMsg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const data = await req.json();
  const {
    firstName,
    middleName,
    lastName,
    employeeId,
    dob,
    gender,
    maritalStatus,
    nationality,
    email,
    status,
    username,
    password,
    profileImg
  } = data || {};

  try {
    const conn = await mysql.createConnection(dbConfig);
    // If only password update is requested
    if (employeeId && password && Object.keys(data).length === 2) {
      await conn.execute(
        `UPDATE employees SET password = ? WHERE employee_id = ?`,
        [password, employeeId]
      );
      await conn.end();
      return NextResponse.json({ success: true });
    }
    // ...existing code for other updates...
    await conn.end();
    return NextResponse.json({ success: false, error: "Invalid request or not implemented." }, { status: 400 });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: errMsg }, { status: 500 });
  }
}
