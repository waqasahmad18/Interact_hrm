import { NextRequest, NextResponse } from "next/server";
import mysql from "mysql2/promise";

const dbConfig = {
  host: "localhost",
  user: "root",
  password: "",
  database: "interact_hrm"
};

export async function GET() {
  const conn = await mysql.createConnection(dbConfig);
  const [rows] = await conn.execute("SELECT * FROM departments ORDER BY name");
  await conn.end();
  return NextResponse.json({ success: true, departments: rows });
}

export async function POST(req: NextRequest) {
  const { name } = await req.json();
  const conn = await mysql.createConnection(dbConfig);
  await conn.execute("INSERT INTO departments (name) VALUES (?)", [name]);
  await conn.end();
  return NextResponse.json({ success: true });
}

export async function PUT(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const { name } = await req.json();
  const conn = await mysql.createConnection(dbConfig);
  await conn.execute("UPDATE departments SET name = ? WHERE id = ?", [name, id]);
  await conn.end();
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const conn = await mysql.createConnection(dbConfig);
  await conn.execute("DELETE FROM departments WHERE id = ?", [id]);
  await conn.end();
  return NextResponse.json({ success: true });
}
