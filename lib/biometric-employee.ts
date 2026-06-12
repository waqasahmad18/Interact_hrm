import { pool } from "@/lib/db";

export type EmployeeMatchKeys = {
  dbIds: string[];
  names: string[];
};

function collapseSpaces(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/** Collect HRM ids and name variants for the logged-in employee. */
export async function getEmployeeMatchKeys(
  employeeId: string,
  employeeName?: string | null
): Promise<EmployeeMatchKeys> {
  const id = String(employeeId || "").trim();
  const dbIds = new Set<string>();
  const names = new Set<string>();

  if (id) dbIds.add(id);

  const clientName = collapseSpaces(employeeName || "");
  if (clientName) names.add(clientName);

  try {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.execute(
        `SELECT id, employee_code, first_name, pseudonym, last_name
         FROM hrm_employees
         WHERE CAST(id AS CHAR) = ? OR employee_code = ? OR username = ?
         LIMIT 1`,
        [id, id, id]
      );
      const row = (rows as Array<Record<string, unknown>>)[0];
      if (row) {
        if (row.id !== undefined && row.id !== null) dbIds.add(String(row.id));
        if (row.employee_code) dbIds.add(String(row.employee_code).trim());

        const first = String(row.first_name || "").trim();
        const pseudo = String(row.pseudonym || "").trim();
        const last = String(row.last_name || "").trim();

        const full = collapseSpaces(`${first} ${last}`);
        if (full) names.add(full);

        const withPseudo = collapseSpaces(`${first} ${pseudo} ${last}`);
        if (withPseudo) names.add(withPseudo);
      }
    } finally {
      conn.release();
    }
  } catch {
    // Fall back to client-provided values only.
  }

  return { dbIds: Array.from(dbIds).filter(Boolean), names: Array.from(names).filter(Boolean) };
}
