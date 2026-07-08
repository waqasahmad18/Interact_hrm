import type { RowDataPacket } from "mysql2";
import { pool } from "@/lib/db";

export type EmployeeDocumentRow = {
  id: number;
  employee_id: number;
  folder_type: string;
  source_type: string;
  assignment_id: number | null;
  template_id: number | null;
  file_name: string;
  file_path: string;
  mime_type: string;
  file_size: number;
  uploaded_by_employee_id: number | null;
  uploaded_by_hr: string | null;
  is_readonly: number;
  deleted_at: string | null;
  created_at: string;
  tags?: string[];
};

export type FormTemplateRow = {
  id: number;
  title: string;
  description: string | null;
  scope: "company" | "department";
  department_id: number | null;
  department_name?: string | null;
  category: string;
  form_schema: unknown;
  template_file_name: string | null;
  template_file_path: string | null;
  is_fillable_online: number;
  is_active: number;
  created_at: string;
};

export type FormAssignmentRow = {
  id: number;
  template_id: number;
  employee_id: number;
  template_title?: string;
  template_category?: string;
  employee_name?: string;
  assigned_by: string | null;
  assigned_note: string | null;
  status: string;
  form_data: Record<string, unknown> | null;
  form_schema?: unknown;
  submitted_at: string | null;
  result_document_id: number | null;
  created_at: string;
  updated_at: string;
};

export async function resolveEmployeeNumericId(
  loginOrId: string
): Promise<number | null> {
  const key = loginOrId.trim();
  if (!key) return null;
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT e.id FROM hrm_employees e
     WHERE CAST(e.id AS CHAR) = ? OR e.employee_code = ? OR e.username = ?
     OR EXISTS (
       SELECT 1 FROM employee_contacts ec
       WHERE ec.employee_id = e.id AND (ec.email_work = ? OR ec.email_other = ?)
     )
     LIMIT 1`,
    [key, key, key, key, key]
  );
  return rows[0]?.id != null ? Number(rows[0].id) : null;
}

export async function getEmployeeProfileForAutofill(employeeId: number) {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT e.id, e.first_name, e.last_name, e.employee_code, e.pseudonym,
            d.name AS department_name, j.job_title, j.joined_date
     FROM hrm_employees e
     LEFT JOIN employee_jobs j ON j.employee_id = e.id
     LEFT JOIN departments d ON d.id = j.department_id
     WHERE e.id = ?
     LIMIT 1`,
    [employeeId]
  );
  const row = rows[0];
  if (!row) return null;
  const fullName = `${row.first_name || ""} ${row.last_name || ""}`.trim();
  return {
    id: String(row.id),
    employee_code: row.employee_code ? String(row.employee_code) : String(row.id),
    full_name: fullName,
    pseudonym: row.pseudonym ? String(row.pseudonym) : "",
    department: row.department_name ? String(row.department_name) : "",
    job_title: row.job_title ? String(row.job_title) : "",
    joined_date: row.joined_date ? String(row.joined_date).slice(0, 10) : "",
  };
}

export function applyAutofillToSchema(
  schema: unknown,
  profile: NonNullable<Awaited<ReturnType<typeof getEmployeeProfileForAutofill>>>
): Record<string, unknown> {
  const fields = Array.isArray(schema) ? schema : [];
  const out: Record<string, unknown> = {};
  const today = new Date().toISOString().slice(0, 10);
  const map: Record<string, string> = {
    "employee.full_name": profile.full_name,
    "employee.id": profile.id,
    "employee.employee_code": profile.employee_code,
    "employee.department": profile.department,
    "employee.job_title": profile.job_title,
    "employee.joined_date": profile.joined_date,
    today,
  };
  for (const raw of fields) {
    if (!raw || typeof raw !== "object") continue;
    const field = raw as { key?: string; autofill?: string; type?: string };
    if (!field.key) continue;
    if (field.autofill && map[field.autofill] != null) {
      out[field.key] = map[field.autofill];
    } else if (field.type === "date" && field.autofill === "today") {
      out[field.key] = today;
    } else {
      out[field.key] = "";
    }
  }
  return out;
}

export async function logDocumentAudit(params: {
  documentId?: number | null;
  assignmentId?: number | null;
  employeeId?: number | null;
  action: string;
  actorType: "employee" | "hr" | "admin" | "system";
  actorId?: string | null;
  actorName?: string | null;
  meta?: Record<string, unknown>;
}) {
  try {
    await pool.execute(
      `INSERT INTO hrm_document_audit_log
        (document_id, assignment_id, employee_id, action, actor_type, actor_id, actor_name, meta)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        params.documentId ?? null,
        params.assignmentId ?? null,
        params.employeeId ?? null,
        params.action,
        params.actorType,
        params.actorId ?? null,
        params.actorName ?? null,
        params.meta ? JSON.stringify(params.meta) : null,
      ]
    );
  } catch {
    // audit is best-effort
  }
}

export function parseJsonField<T>(value: unknown): T | null {
  if (value == null) return null;
  if (typeof value === "object") return value as T;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }
  return null;
}
