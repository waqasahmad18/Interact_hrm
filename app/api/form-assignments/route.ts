import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import { v4 as uuidv4 } from "uuid";
import type { RowDataPacket } from "mysql2";
import { pool } from "@/lib/db";
import { EMPLOYEE_FILES_DIR } from "@/lib/document-constants";
import { buildFormPrintHtml } from "@/lib/form-print-html";
import {
  applyAutofillToSchema,
  getEmployeeProfileForAutofill,
  logDocumentAudit,
  parseJsonField,
  type FormAssignmentRow,
} from "@/lib/employee-documents";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const employeeId = searchParams.get("employeeId");
    const status = searchParams.get("status");
    const hrView = searchParams.get("hr") === "1";

    let sql = `SELECT a.*, t.title AS template_title, t.category AS template_category,
                      t.form_schema, CONCAT(e.first_name, ' ', e.last_name) AS employee_name
               FROM hrm_form_assignments a
               JOIN hrm_form_templates t ON t.id = a.template_id
               JOIN hrm_employees e ON e.id = a.employee_id
               WHERE 1=1`;
    const params: (string | number)[] = [];

    if (employeeId) {
      sql += ` AND a.employee_id = ?`;
      params.push(Number(employeeId));
    }
    if (status) {
      sql += ` AND a.status = ?`;
      params.push(status);
    } else if (!hrView && employeeId) {
      sql += ` AND a.status IN ('pending','in_progress','draft','submitted')`;
    } else if (hrView) {
      sql += ` AND a.status IN ('submitted','archived')`;
    }
    sql += ` ORDER BY a.updated_at DESC`;

    const [rows] = await pool.execute<RowDataPacket[]>(sql, params);
    const assignments = (rows as FormAssignmentRow[]).map((a) => ({
      ...a,
      form_data: parseJsonField<Record<string, unknown>>(a.form_data),
      form_schema: parseJsonField(a.form_schema),
    }));
    return NextResponse.json({ success: true, assignments });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Failed to load assignments" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const templateId = Number(body.template_id);
    const employeeId = Number(body.employee_id);
    const assignedBy = body.assigned_by ? String(body.assigned_by) : "hr";
    const note = body.assigned_note != null ? String(body.assigned_note).trim() : "";

    if (!templateId || !employeeId) {
      return NextResponse.json(
        { success: false, error: "template_id and employee_id required" },
        { status: 400 }
      );
    }

    const [tRows] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM hrm_form_templates WHERE id = ? AND is_active = 1 LIMIT 1`,
      [templateId]
    );
    const template = tRows[0];
    if (!template) {
      return NextResponse.json({ success: false, error: "Template not found" }, { status: 404 });
    }

    if (String(template.category).toLowerCase() === "warning" && !note) {
      return NextResponse.json(
        { success: false, error: "Please enter warning details for the employee." },
        { status: 400 }
      );
    }

    const reviewPeriod =
      body.review_period != null ? String(body.review_period).trim() : "";
    if (String(template.category).toLowerCase() === "appraisal" && !reviewPeriod) {
      return NextResponse.json(
        { success: false, error: "Review period is required for appraisal forms." },
        { status: 400 }
      );
    }

    const schema = parseJsonField(template.form_schema);
    const profile = await getEmployeeProfileForAutofill(employeeId);
    const formData = profile ? applyAutofillToSchema(schema, profile) : {};
    if (reviewPeriod) {
      formData.review_period = reviewPeriod;
    }

    const [result] = await pool.execute(
      `INSERT INTO hrm_form_assignments
        (template_id, employee_id, assigned_by, assigned_note, status, form_data)
       VALUES (?, ?, ?, ?, 'pending', ?)`,
      [templateId, employeeId, assignedBy, note || null, JSON.stringify(formData)]
    );
    const assignmentId = (result as { insertId: number }).insertId;

    await logDocumentAudit({
      assignmentId,
      employeeId,
      action: "assign_form",
      actorType: "hr",
      actorId: assignedBy,
      meta: { template_id: templateId },
    });

    return NextResponse.json({
      success: true,
      id: assignmentId,
      template_title: template.title,
      template_category: template.category,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Assign failed" },
      { status: 500 }
    );
  }
}
