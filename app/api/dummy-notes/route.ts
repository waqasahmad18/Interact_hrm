import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { pool } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const loginId = searchParams.get("loginId") || "";
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id, login_id, note, created_at
       FROM hrm_dummy_notes
       WHERE (? = '' OR login_id = ?)
       ORDER BY id DESC
       LIMIT 50`,
      [loginId, loginId]
    );
    return NextResponse.json({ success: true, notes: rows });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Failed to load notes" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const note = String(body?.note ?? "").trim();
    const loginId = String(body?.loginId ?? "").trim() || null;
    if (!note) {
      return NextResponse.json({ success: false, error: "Note is required" }, { status: 400 });
    }
    if (note.length > 500) {
      return NextResponse.json({ success: false, error: "Note too long (max 500)" }, { status: 400 });
    }
    const [result] = await pool.execute(
      `INSERT INTO hrm_dummy_notes (login_id, note) VALUES (?, ?)`,
      [loginId, note]
    );
    const insertId = (result as { insertId: number }).insertId;
    return NextResponse.json({ success: true, id: insertId });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Failed to save note" },
      { status: 500 }
    );
  }
}
