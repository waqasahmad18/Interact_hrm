import { NextResponse } from "next/server";
import mysql from "mysql2/promise";

const dbConfig = {
  host: "localhost",
  user: "root",
  password: "",
  database: "interact_hrm"
};

export async function GET() {
  const conn = await mysql.createConnection(dbConfig);
  const [rows] = await conn.execute("SELECT * FROM shifts");
  await conn.end();
  return NextResponse.json(rows);
}

import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const conn = await mysql.createConnection(dbConfig);
  await conn.execute(
    `INSERT INTO shifts (name, shift_in, shift_out, shift_out_next_day) VALUES (?, ?, ?, ?)`,
    [body.name, body.shift_in, body.shift_out, body.shift_out_next_day]
  );
  await conn.end();
  return NextResponse.json({ success: true });
}

export async function PUT(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const body = await req.json();
  const conn = await mysql.createConnection(dbConfig);
  await conn.execute(
    `UPDATE shifts SET name = ?, shift_in = ?, shift_out = ? WHERE id = ?`,
    [body.name, body.shift_in, body.shift_out, id]
  );
  await conn.end();
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const conn = await mysql.createConnection(dbConfig);
  await conn.execute("DELETE FROM shifts WHERE id = ?", [id]);
  await conn.end();
  return NextResponse.json({ success: true });
}
