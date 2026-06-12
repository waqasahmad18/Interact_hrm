import { pool } from "@/lib/db";

/** Map login id / employee_code / username to canonical hrm_employees.id */
export async function resolveEmployeeDbId(
  employeeIdOrCode: string
): Promise<string | null> {
  const key = String(employeeIdOrCode || "").trim();
  if (!key) return null;

  const [rows] = await pool.execute(
    `SELECT id FROM hrm_employees
     WHERE CAST(id AS CHAR) = ? OR employee_code = ? OR username = ?
     LIMIT 1`,
    [key, key, key]
  );
  const row = (rows as Array<Record<string, unknown>>)[0];
  return row?.id != null ? String(row.id) : key;
}
