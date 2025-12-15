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
import bcrypt from "bcryptjs";

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
      // Try hrm_employees first (new employees)
      let [rows]: any = await conn.execute(
        'SELECT id as employee_id, employee_code, first_name, middle_name, last_name, username, gender, nationality, dob, status FROM hrm_employees WHERE username = ?', [username]
      );
      
      if (!rows || rows.length === 0) {
        // Fallback to employees table (old employees)
        [rows] = await conn.execute(
          'SELECT employee_id, first_name, last_name, username FROM employees WHERE username = ?', [username]
        );
      }
      
      await conn.end();
      const result = rows as any[];
      if (result && result.length > 0) {
        return NextResponse.json({ success: true, employee: result[0] });
      } else {
        return NextResponse.json({ success: false, error: "Employee not found" }, { status: 404 });
      }
    } else if (email) {
      try {
        // Try hrm_employees first - search by username (email used as login)
        let [rows]: any = await conn.execute(
          'SELECT id as employee_id, employee_code, first_name, middle_name, last_name, username, gender, nationality, dob, status FROM hrm_employees WHERE username = ?', [email]
        );
        
        if (!rows || rows.length === 0) {
          // Fallback to employees table
          [rows] = await conn.execute(
            'SELECT employee_id, first_name, last_name, email FROM employees WHERE email = ?', [email]
          );
        }
        
        const result = rows as any[];
        if (result && result.length > 0) {
          return NextResponse.json({ success: true, employee: result[0] });
        } else {
          return NextResponse.json({ success: false, error: "Employee not found" }, { status: 404 });
        }
      } catch (err) {
        console.error('Email search error:', err);
        return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
      } finally {
        await conn.end();
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

    // Insert new employee
    // Auto-generate employee_id if not provided (e.g., max+1 or UUID)
    let newEmployeeId = employeeId;
    if (!newEmployeeId) {
      // Generate new employee_id as max(employee_id)+1 (numeric) or use UUID if string
      const [rows] = await conn.execute('SELECT MAX(CAST(employee_id AS UNSIGNED)) as maxId FROM employees');
      const maxId = rows && rows[0] && rows[0].maxId ? parseInt(rows[0].maxId) : 0;
      newEmployeeId = String(maxId + 1).padStart(2, '0');
    }

    // Convert undefined to null for SQL
    function toNull(v) { return v === undefined ? null : v; }
    let hashedPassword = password ? await bcrypt.hash(password, 10) : null;
    const [result] = await conn.execute(
      `INSERT INTO employees (first_name, middle_name, last_name, employee_id, dob, gender, marital_status, nationality, email, status, username, password, password_plain, profile_img)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
      [
        toNull(firstName),
        toNull(middleName),
        toNull(lastName),
        toNull(newEmployeeId),
        toNull(dob),
        toNull(gender),
        toNull(maritalStatus),
        toNull(nationality),
        toNull(email),
        toNull(status),
        toNull(username),
        toNull(hashedPassword),
        toNull(password),
        toNull(profileImg)
      ]
    );
    await conn.end();
    return NextResponse.json({ success: true, employee_id: newEmployeeId });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: errMsg }, { status: 500 });
  }
}
