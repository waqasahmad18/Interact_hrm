import type { PoolConnection } from "mysql2/promise";
import { resolveEmployeeDbId } from "@/lib/resolve-employee-id";

/**
 * breaks / prayer_breaks FK → employees(id), but staff live in hrm_employees.
 * Ensure a matching legacy row exists before inserting child rows.
 */
export async function ensureLegacyEmployeeRow(
  conn: PoolConnection,
  employeeIdOrCode: string,
  employeeName?: string | null
): Promise<number> {
  const resolved = await resolveEmployeeDbId(employeeIdOrCode);
  const id = Number(resolved || employeeIdOrCode);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error("Invalid employee id");
  }

  const [existing] = await conn.execute("SELECT id FROM employees WHERE id = ? LIMIT 1", [id]);
  if ((existing as Array<{ id: number }>).length > 0) {
    return id;
  }

  const [hrmRows] = await conn.execute(
    `SELECT id, first_name, last_name, employee_code, gender, nationality,
            username, password, profile_img, status
     FROM hrm_employees WHERE id = ? LIMIT 1`,
    [id]
  );
  const hrm = (hrmRows as Array<Record<string, unknown>>)[0];
  if (!hrm) {
    throw new Error(`Employee not found (id ${id})`);
  }

  let employeeCode = String(hrm.employee_code || id).trim() || String(id);
  const [codeClash] = await conn.execute(
    "SELECT id FROM employees WHERE employee_id = ? AND id <> ? LIMIT 1",
    [employeeCode, id]
  );
  if ((codeClash as unknown[]).length > 0) {
    employeeCode = `HR${id}`;
  }

  const firstName = String(hrm.first_name || employeeName?.split(" ")[0] || "Employee");
  const lastName = String(hrm.last_name || "");

  await conn.execute(
    `INSERT INTO employees (id, first_name, last_name, employee_id, gender, nationality, username, password, profile_img, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      firstName,
      lastName,
      employeeCode,
      hrm.gender ?? null,
      hrm.nationality ?? null,
      hrm.username ?? null,
      hrm.password ?? null,
      hrm.profile_img ?? null,
      hrm.status ?? "active",
    ]
  );

  return id;
}
