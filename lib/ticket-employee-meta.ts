import { query } from "@/lib/db";

export async function getEmployeePseudonym(employeeId: string): Promise<string | null> {
  try {
    const id = String(employeeId ?? "").trim();
    if (!id) return null;
    const [rows]: any = await query(
      `SELECT TRIM(pseudonym) AS pseudonym
       FROM hrm_employees
       WHERE CAST(id AS CHAR) = ? OR employee_code = ?
       LIMIT 1`,
      [id, id]
    );
    const pseudonym = rows?.[0]?.pseudonym;
    return typeof pseudonym === "string" && pseudonym.trim() ? pseudonym.trim() : null;
  } catch {
    return null;
  }
}
