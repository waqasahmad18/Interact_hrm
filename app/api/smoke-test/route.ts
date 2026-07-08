import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { pool } from "@/lib/db";

const TABLE = "hrm_smoke_test";

export async function GET() {
  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id, login_id, message, created_at
         FROM ${TABLE}
        ORDER BY id DESC
        LIMIT 20`,
    );
    return NextResponse.json({ success: true, rows });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Failed to load rows" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const message = String(body?.message ?? "").trim();
    const loginId = body?.loginId ? String(body.loginId).trim() : null;
    if (!message) {
      return NextResponse.json(
        { success: false, error: "message is required" },
        { status: 400 },
      );
    }
    const [result] = await pool.execute(
      `INSERT INTO ${TABLE} (login_id, message) VALUES (?, ?)`,
      [loginId, message.slice(0, 500)],
    );
    const insertId = (result as { insertId?: number }).insertId ?? null;
    return NextResponse.json({ success: true, id: insertId });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Failed to save row" },
      { status: 500 },
    );
  }
}
