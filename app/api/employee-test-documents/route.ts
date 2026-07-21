import { NextRequest, NextResponse } from "next/server";
import { pool, query } from "@/lib/db";

const TABLE = "employee_test_documents";

async function ensureTable() {
  await query(
    `CREATE TABLE IF NOT EXISTS ${TABLE} (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      employee_id VARCHAR(64) NOT NULL,
      title VARCHAR(255) NOT NULL,
      notes TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_employee_test_documents_employee (employee_id),
      KEY idx_employee_test_documents_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );
}

export async function GET(req: NextRequest) {
  try {
    await ensureTable();
    const { searchParams } = new URL(req.url);
    const employeeId = String(searchParams.get("employeeId") || "").trim();
    if (!employeeId) {
      return NextResponse.json(
        { success: false, error: "employeeId is required" },
        { status: 400 }
      );
    }

    const [rows] = await query(
      `SELECT id, employee_id, title, notes, created_at
       FROM ${TABLE}
       WHERE employee_id = ?
       ORDER BY id DESC
       LIMIT 50`,
      [employeeId]
    );

    return NextResponse.json({ success: true, documents: rows ?? [] });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureTable();
    const body = await req.json();
    const employeeId = String(body?.employee_id || "").trim();
    const title = String(body?.title || "").trim();
    const notes = String(body?.notes || "").trim();

    if (!employeeId || !title) {
      return NextResponse.json(
        { success: false, error: "employee_id and title are required" },
        { status: 400 }
      );
    }

    const [result] = await pool.query(
      `INSERT INTO ${TABLE} (employee_id, title, notes) VALUES (?, ?, ?)`,
      [employeeId, title, notes || null]
    );
    const insertId = Number((result as { insertId?: number }).insertId || 0);

    const [rows] = await query(
      `SELECT id, employee_id, title, notes, created_at
       FROM ${TABLE}
       WHERE id = ?
       LIMIT 1`,
      [insertId]
    );
    const created = Array.isArray(rows) && rows.length ? rows[0] : null;

    return NextResponse.json({ success: true, document: created });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
