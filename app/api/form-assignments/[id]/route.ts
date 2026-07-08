import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import { v4 as uuidv4 } from "uuid";
import type { RowDataPacket } from "mysql2";
import { pool } from "@/lib/db";
import { EMPLOYEE_FILES_DIR } from "@/lib/document-constants";
import { buildFormPrintHtml } from "@/lib/form-print-html";
import { regenerateSubmittedFormDocument } from "@/lib/form-submission";
import {
  mergeFormDataForAudience,
  validateRequiredFields,
} from "@/lib/form-schema";
import {
  logDocumentAudit,
  parseJsonField,
} from "@/lib/employee-documents";

type Ctx = { params: Promise<{ id: string }> };

async function loadAssignment(id: number) {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT a.*, t.title AS template_title, t.category AS template_category, t.form_schema,
            CONCAT(e.first_name, ' ', e.last_name) AS employee_name
     FROM hrm_form_assignments a
     JOIN hrm_form_templates t ON t.id = a.template_id
     JOIN hrm_employees e ON e.id = a.employee_id
     WHERE a.id = ? LIMIT 1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const row = await loadAssignment(Number(id));
    if (!row) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({
      success: true,
      assignment: {
        ...row,
        form_data: parseJsonField(row.form_data),
        form_schema: parseJsonField(row.form_schema),
      },
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const assignmentId = Number(id);
    const body = await req.json();
    const row = await loadAssignment(assignmentId);
    if (!row) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }

    const action = body.action ? String(body.action) : "save";

    if (action === "cancel") {
      await pool.execute(
        `UPDATE hrm_form_assignments SET status = 'cancelled', updated_at = NOW() WHERE id = ?`,
        [assignmentId]
      );
      await logDocumentAudit({
        assignmentId,
        employeeId: Number(row.employee_id),
        action: "cancel_form",
        actorType: "hr",
        actorId: body.actorLogin || "hr",
      });
      return NextResponse.json({ success: true });
    }

    if (action === "archive") {
      await pool.execute(
        `UPDATE hrm_form_assignments SET status = 'archived', reviewed_at = NOW(), reviewed_by = ? WHERE id = ?`,
        [body.actorLogin || "hr", assignmentId]
      );
      return NextResponse.json({ success: true });
    }

    const formData = body.form_data as Record<string, unknown> | undefined;
    const schema = parseJsonField(row.form_schema);
    const existingData = parseJsonField<Record<string, unknown>>(row.form_data) || {};

    if (action === "manager_review") {
      if (row.status !== "submitted" && row.status !== "archived") {
        return NextResponse.json(
          { success: false, error: "Employee must submit the form first." },
          { status: 400 }
        );
      }
      if (!formData || typeof formData !== "object") {
        return NextResponse.json({ success: false, error: "form_data required" }, { status: 400 });
      }
      const merged = mergeFormDataForAudience(schema, "manager", existingData, formData);
      const validationError = validateRequiredFields(schema, merged, "manager");
      if (validationError) {
        return NextResponse.json({ success: false, error: validationError }, { status: 400 });
      }

      const docId = await regenerateSubmittedFormDocument({
        assignmentId,
        employeeId: Number(row.employee_id),
        templateTitle: String(row.template_title),
        templateCategory: String(row.template_category),
        employeeName: String(row.employee_name),
        formData: merged,
        schema,
        submittedAt: row.submitted_at ? String(row.submitted_at) : null,
        hrMessage: row.assigned_note ? String(row.assigned_note) : null,
        resultDocumentId: row.result_document_id ? Number(row.result_document_id) : null,
      });

      await pool.execute(
        `UPDATE hrm_form_assignments
         SET form_data = ?, result_document_id = COALESCE(?, result_document_id), updated_at = NOW()
         WHERE id = ?`,
        [JSON.stringify(merged), docId, assignmentId]
      );

      await logDocumentAudit({
        assignmentId,
        employeeId: Number(row.employee_id),
        action: "manager_review",
        actorType: "hr",
        actorId: body.actorLogin ? String(body.actorLogin) : "hr",
      });

      return NextResponse.json({ success: true, documentId: docId });
    }

    if (!formData || typeof formData !== "object") {
      return NextResponse.json({ success: false, error: "form_data required" }, { status: 400 });
    }

    const mergedEmployee = mergeFormDataForAudience(schema, "employee", existingData, formData);

    if (action === "submit") {
      const validationError = validateRequiredFields(schema, mergedEmployee, "employee");
      if (validationError) {
        return NextResponse.json({ success: false, error: validationError }, { status: 400 });
      }

      const html = buildFormPrintHtml({
        template: {
          title: String(row.template_title),
          category: String(row.template_category),
        },
        employeeName: String(row.employee_name),
        employeeId: String(row.employee_id),
        formData: mergedEmployee,
        schema,
        submittedAt: new Date().toISOString(),
        hrMessage: row.assigned_note ? String(row.assigned_note) : null,
        audience: "all",
      });

      const uploadRoot = path.join(process.cwd(), "public", "uploads", EMPLOYEE_FILES_DIR);
      await fs.mkdir(uploadRoot, { recursive: true });
      const safeTitle = String(row.template_title).replace(/[^\w\-]+/g, "_").slice(0, 40);
      const fileName = `${safeTitle}-${row.employee_id}-${Date.now()}.html`;
      const relPath = `/uploads/${EMPLOYEE_FILES_DIR}/${uuidv4()}-${fileName}`;
      const absPath = path.join(process.cwd(), "public", relPath.replace(/^\//, ""));
      await fs.writeFile(absPath, html, "utf8");
      const buf = Buffer.from(html, "utf8");

      const [docResult] = await pool.execute(
        `INSERT INTO hrm_employee_documents
          (employee_id, folder_type, source_type, assignment_id, template_id,
           file_name, file_path, mime_type, file_size, is_readonly)
         VALUES (?, 'form_submitted', 'form_submission', ?, ?, ?, ?, 'text/html', ?, 1)`,
        [
          row.employee_id,
          assignmentId,
          row.template_id,
          fileName,
          relPath,
          buf.length,
        ]
      );
      const docId = (docResult as { insertId: number }).insertId;

      await pool.execute(
        `UPDATE hrm_form_assignments
         SET status = 'submitted', form_data = ?, submitted_at = NOW(),
             result_document_id = ?, updated_at = NOW()
         WHERE id = ?`,
        [JSON.stringify(mergedEmployee), docId, assignmentId]
      );

      await logDocumentAudit({
        documentId: docId,
        assignmentId,
        employeeId: Number(row.employee_id),
        action: "submit_form",
        actorType: "employee",
        actorId: String(row.employee_id),
      });

      return NextResponse.json({ success: true, documentId: docId });
    }

    const status =
      action === "start" ? "in_progress" : action === "draft" ? "draft" : row.status;
    await pool.execute(
      `UPDATE hrm_form_assignments SET form_data = ?, status = ?, updated_at = NOW() WHERE id = ?`,
      [JSON.stringify(mergedEmployee), status, assignmentId]
    );
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Update failed" },
      { status: 500 }
    );
  }
}
