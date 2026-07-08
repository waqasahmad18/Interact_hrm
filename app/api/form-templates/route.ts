import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { pool } from "@/lib/db";
import { parseJsonField, type FormTemplateRow } from "@/lib/employee-documents";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const scope = searchParams.get("scope");
    const departmentId = searchParams.get("departmentId");
    const activeOnly = searchParams.get("active") !== "0";

    let sql = `SELECT t.*, d.name AS department_name
               FROM hrm_form_templates t
               LEFT JOIN departments d ON d.id = t.department_id
               WHERE 1=1`;
    const params: (string | number)[] = [];
    if (activeOnly) sql += ` AND t.is_active = 1`;
    if (scope) {
      sql += ` AND t.scope = ?`;
      params.push(scope);
    }
    if (departmentId) {
      sql += ` AND (t.scope = 'company' OR t.department_id = ?)`;
      params.push(Number(departmentId));
    }
    sql += ` ORDER BY t.scope ASC, t.category ASC, t.title ASC`;

    const [rows] = await pool.execute<RowDataPacket[]>(sql, params);
    const templates = (rows as FormTemplateRow[]).map((t) => ({
      ...t,
      form_schema: parseJsonField(t.form_schema),
    }));
    return NextResponse.json({ success: true, templates });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Failed to load templates" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const title = String(body.title || "").trim();
    if (!title) {
      return NextResponse.json({ success: false, error: "Title required" }, { status: 400 });
    }
    const scope = body.scope === "department" ? "department" : "company";
    const departmentId = scope === "department" ? Number(body.department_id) : null;
    if (scope === "department" && !departmentId) {
      return NextResponse.json(
        { success: false, error: "department_id required for department forms" },
        { status: 400 }
      );
    }
    const category = String(body.category || "general");
    const formSchema = body.form_schema ?? [];
    const description = body.description ? String(body.description) : null;
    const createdBy = body.created_by ? String(body.created_by) : "hr";

    const [result] = await pool.execute(
      `INSERT INTO hrm_form_templates
        (title, description, scope, department_id, category, form_schema, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [title, description, scope, departmentId, category, JSON.stringify(formSchema), createdBy]
    );
    const id = (result as { insertId: number }).insertId;
    return NextResponse.json({ success: true, id });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Create failed" },
      { status: 500 }
    );
  }
}
