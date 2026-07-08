import path from "path";
import fs from "fs/promises";
import { v4 as uuidv4 } from "uuid";
import type { RowDataPacket } from "mysql2";
import { pool } from "@/lib/db";
import { EMPLOYEE_FILES_DIR } from "@/lib/document-constants";
import { buildFormPrintHtml } from "@/lib/form-print-html";

export async function regenerateSubmittedFormDocument(params: {
  assignmentId: number;
  employeeId: number;
  templateTitle: string;
  templateCategory: string;
  employeeName: string;
  formData: Record<string, unknown>;
  schema: unknown;
  submittedAt: string | null;
  hrMessage?: string | null;
  resultDocumentId: number | null;
}): Promise<number | null> {
  const html = buildFormPrintHtml({
    template: {
      title: params.templateTitle,
      category: params.templateCategory,
    },
    employeeName: params.employeeName,
    employeeId: String(params.employeeId),
    formData: params.formData,
    schema: params.schema,
    submittedAt: params.submittedAt,
    hrMessage: params.hrMessage,
    audience: "all",
  });

  const buf = Buffer.from(html, "utf8");

  if (params.resultDocumentId) {
    const [docRows] = await pool.execute<RowDataPacket[]>(
      `SELECT file_path FROM hrm_employee_documents WHERE id = ? LIMIT 1`,
      [params.resultDocumentId]
    );
    const relPath = docRows[0]?.file_path ? String(docRows[0].file_path) : "";
    if (relPath) {
      const absPath = path.join(process.cwd(), "public", relPath.replace(/^\//, ""));
      await fs.writeFile(absPath, html, "utf8");
      await pool.execute(
        `UPDATE hrm_employee_documents SET file_size = ? WHERE id = ?`,
        [buf.length, params.resultDocumentId]
      );
      return params.resultDocumentId;
    }
  }

  const uploadRoot = path.join(process.cwd(), "public", "uploads", EMPLOYEE_FILES_DIR);
  await fs.mkdir(uploadRoot, { recursive: true });
  const safeTitle = params.templateTitle.replace(/[^\w\-]+/g, "_").slice(0, 40);
  const fileName = `${safeTitle}-${params.employeeId}-${Date.now()}.html`;
  const relPath = `/uploads/${EMPLOYEE_FILES_DIR}/${uuidv4()}-${fileName}`;
  const absPath = path.join(process.cwd(), "public", relPath.replace(/^\//, ""));
  await fs.writeFile(absPath, html, "utf8");

  const [docResult] = await pool.execute(
    `INSERT INTO hrm_employee_documents
      (employee_id, folder_type, source_type, assignment_id, template_id,
       file_name, file_path, mime_type, file_size, is_readonly)
     VALUES (?, 'form_submitted', 'form_submission', ?, NULL, ?, ?, 'text/html', ?, 1)`,
    [params.employeeId, params.assignmentId, fileName, relPath, buf.length]
  );
  return (docResult as { insertId: number }).insertId;
}
