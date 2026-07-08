import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { pool } from "@/lib/db";
import { buildFormPrintHtml } from "@/lib/form-print-html";
import { logDocumentAudit, parseJsonField } from "@/lib/employee-documents";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const { searchParams } = new URL(req.url);
    const audience = searchParams.get("audience") === "employee" ? "employee" : "all";
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT a.*, t.title AS template_title, t.category AS template_category, t.form_schema,
              CONCAT(e.first_name, ' ', e.last_name) AS employee_name
       FROM hrm_form_assignments a
       JOIN hrm_form_templates t ON t.id = a.template_id
       JOIN hrm_employees e ON e.id = a.employee_id
       WHERE a.id = ? LIMIT 1`,
      [Number(id)]
    );
    const row = rows[0];
    if (!row) {
      return new NextResponse("Not found", { status: 404 });
    }

    const formData = parseJsonField<Record<string, unknown>>(row.form_data) || {};
    const schema = parseJsonField(row.form_schema);
    const html = buildFormPrintHtml({
      template: {
        title: String(row.template_title),
        category: String(row.template_category),
      },
      employeeName: String(row.employee_name),
      employeeId: String(row.employee_id),
      formData,
      schema,
      submittedAt: row.submitted_at,
      hrMessage: row.assigned_note ? String(row.assigned_note) : null,
      audience,
    });

    await logDocumentAudit({
      assignmentId: Number(id),
      employeeId: Number(row.employee_id),
      action: "print",
      actorType: "hr",
      actorId: "admin",
    });

    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    });
  } catch (err) {
    return new NextResponse(err instanceof Error ? err.message : "Error", { status: 500 });
  }
}
