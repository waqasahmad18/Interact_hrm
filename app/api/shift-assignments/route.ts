import { NextResponse, NextRequest } from "next/server";
import mysql from "mysql2/promise";

const dbConfig = {
  host: "localhost",
  user: "root",
  password: "",
  database: "interact_hrm"
};

export async function GET(req: NextRequest) {
  const conn = await mysql.createConnection(dbConfig);
  const [rows] = await conn.execute(
    `SELECT sa.*, d.name as department_name, e.first_name, e.last_name, s.name as shift_name
     FROM shift_assignments sa
     LEFT JOIN departments d ON sa.department_id = d.id
     LEFT JOIN employees e ON sa.employee_id = e.id
     LEFT JOIN shifts s ON sa.shift_id = s.id
     ORDER BY sa.assign_date DESC, sa.id DESC`
  );
  await conn.end();
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const conn = await mysql.createConnection(dbConfig);
  await conn.execute(
    `INSERT INTO shift_assignments (department_id, employee_id, shift_id, assign_date) VALUES (?, ?, ?, ?)`,
    [body.department_id, body.employee_id, body.shift_id, body.assign_date]
  );
  await conn.end();
  return NextResponse.json({ success: true });
}
