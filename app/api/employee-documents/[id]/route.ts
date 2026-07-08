import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import type { RowDataPacket } from "mysql2";
import { pool } from "@/lib/db";
import { logDocumentAudit, parseJsonField } from "@/lib/employee-documents";
import { buildFormDocxBuffer, safeFormDocxFilename } from "@/lib/form-docx";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const docId = Number(id);
    const { searchParams } = new URL(req.url);
    const actorLogin = searchParams.get("actorLogin") || "";
    const isHr = searchParams.get("isHr") === "1";
    const employeeIdParam = searchParams.get("employeeId");

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM hrm_employee_documents WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
      [docId]
    );
    const doc = rows[0];
    if (!doc) {
      return NextResponse.json({ success: false, error: "Document not found" }, { status: 404 });
    }

    if (!isHr) {
      if (doc.source_type !== "employee_upload") {
        return NextResponse.json(
          { success: false, error: "You can only delete your own uploads." },
          { status: 403 }
        );
      }
      if (employeeIdParam && Number(employeeIdParam) !== Number(doc.employee_id)) {
        return NextResponse.json({ success: false, error: "Not allowed" }, { status: 403 });
      }
    }

    await pool.execute(
      `UPDATE hrm_employee_documents SET deleted_at = NOW(), deleted_by = ? WHERE id = ?`,
      [actorLogin || (isHr ? "hr" : String(employeeIdParam || "")), docId]
    );

    await logDocumentAudit({
      documentId: docId,
      employeeId: Number(doc.employee_id),
      action: "delete",
      actorType: isHr ? "hr" : "employee",
      actorId: actorLogin || String(employeeIdParam || ""),
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Delete failed" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const docId = Number(id);
    const { searchParams } = new URL(req.url);
    const action = searchParams.get("action") || "download";
    const actorLogin = searchParams.get("actorLogin") || "";

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM hrm_employee_documents WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
      [docId]
    );
    const doc = rows[0];
    if (!doc) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }

    const inline = action === "preview";
    const isFormSubmission = doc.source_type === "form_submission" && doc.assignment_id;

    if (isFormSubmission && !inline) {
      const [aRows] = await pool.execute<RowDataPacket[]>(
        `SELECT a.*, t.title AS template_title, t.category AS template_category, t.form_schema,
                CONCAT(e.first_name, ' ', e.last_name) AS employee_name
         FROM hrm_form_assignments a
         JOIN hrm_form_templates t ON t.id = a.template_id
         JOIN hrm_employees e ON e.id = a.employee_id
         WHERE a.id = ? LIMIT 1`,
        [Number(doc.assignment_id)]
      );
      const assignment = aRows[0];
      if (assignment) {
        const formData = parseJsonField<Record<string, unknown>>(assignment.form_data) || {};
        const schema = parseJsonField(assignment.form_schema);
        const buffer = await buildFormDocxBuffer({
          template: {
            title: String(assignment.template_title),
            category: String(assignment.template_category),
          },
          employeeName: String(assignment.employee_name),
          employeeId: String(assignment.employee_id),
          formData,
          schema,
          submittedAt: assignment.submitted_at ? String(assignment.submitted_at) : null,
          hrMessage: assignment.assigned_note ? String(assignment.assigned_note) : null,
        });
        const fileName = safeFormDocxFilename(String(assignment.template_title));

        await logDocumentAudit({
          documentId: docId,
          assignmentId: Number(doc.assignment_id),
          employeeId: Number(doc.employee_id),
          action: "download",
          actorType: searchParams.get("isHr") === "1" ? "hr" : "employee",
          actorId: actorLogin,
          meta: { format: "docx" },
        });

        return new NextResponse(new Uint8Array(buffer), {
          headers: {
            "Content-Type":
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
          },
        });
      }
    }

    const absPath = path.join(process.cwd(), "public", doc.file_path.replace(/^\//, ""));
    const buf = await fs.readFile(absPath);

    await logDocumentAudit({
      documentId: docId,
      employeeId: Number(doc.employee_id),
      action: action === "preview" ? "view" : action === "print" ? "print" : "download",
      actorType: searchParams.get("isHr") === "1" ? "hr" : "employee",
      actorId: actorLogin,
    });

    const disposition = inline
      ? "inline"
      : `attachment; filename="${encodeURIComponent(doc.file_name)}"`;

    return new NextResponse(buf, {
      headers: {
        "Content-Type": doc.mime_type || "application/octet-stream",
        "Content-Disposition": disposition,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Download failed" },
      { status: 500 }
    );
  }
}
