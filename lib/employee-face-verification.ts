import { pool } from "@/lib/db";
import { ensureFaceEnrollmentTable } from "@/lib/face-enrollment-table";
import { isFaceVerificationEnabled } from "@/lib/face-matching";
import { resolveEmployeeDbId } from "@/lib/resolve-employee-id";

let columnReady: Promise<void> | null = null;

export async function ensureFaceVerificationColumn(): Promise<void> {
  if (columnReady) return columnReady;
  columnReady = (async () => {
    try {
      await pool.execute(
        `ALTER TABLE hrm_employees
         ADD COLUMN face_verification_enabled TINYINT(1) NOT NULL DEFAULT 1`
      );
    } catch {
      // column already exists
    }
  })();
  return columnReady;
}

export async function isEmployeeFaceVerificationEnabled(
  employeeId: string
): Promise<boolean> {
  if (!isFaceVerificationEnabled()) return false;

  await ensureFaceVerificationColumn();
  const id = (await resolveEmployeeDbId(employeeId)) || String(employeeId).trim();
  if (!id) return false;

  try {
    const [rows] = await pool.execute(
      `SELECT face_verification_enabled FROM hrm_employees WHERE id = ? LIMIT 1`,
      [id]
    );
    const row = (rows as Array<{ face_verification_enabled?: number }>)[0];
    if (!row) return true;
    return Number(row.face_verification_enabled ?? 1) === 1;
  } catch {
    return true;
  }
}

export async function setEmployeeFaceVerificationEnabled(
  employeeId: string,
  enabled: boolean
): Promise<boolean> {
  await ensureFaceVerificationColumn();
  const id = (await resolveEmployeeDbId(employeeId)) || String(employeeId).trim();
  if (!id) return false;

  try {
    const [result] = await pool.execute(
      `UPDATE hrm_employees SET face_verification_enabled = ? WHERE id = ?`,
      [enabled ? 1 : 0, id]
    );
    return Number((result as { affectedRows?: number }).affectedRows ?? 0) > 0;
  } catch {
    return false;
  }
}

/** Bulk Active / Inactive for face verification. */
export async function setEmployeesFaceVerificationEnabled(
  employeeIds: Array<string | number>,
  enabled: boolean
): Promise<number> {
  await ensureFaceVerificationColumn();
  const ids = [
    ...new Set(
      employeeIds
        .map((v) => String(v ?? "").trim())
        .filter((v) => v.length > 0 && /^\d+$/.test(v))
    ),
  ];
  if (ids.length === 0) return 0;

  const placeholders = ids.map(() => "?").join(",");
  try {
    const [result] = await pool.execute(
      `UPDATE hrm_employees SET face_verification_enabled = ? WHERE id IN (${placeholders})`,
      [enabled ? 1 : 0, ...ids]
    );
    return Number((result as { affectedRows?: number }).affectedRows ?? 0);
  } catch {
    return 0;
  }
}

export type EmployeeFaceVerificationRow = {
  id: number;
  name: string;
  pseudonym: string | null;
  employee_code: string | null;
  department: string | null;
  face_verification_enabled: boolean;
  photo_count: number;
  descriptor_count: number;
};

type BaseEmployeeRow = {
  id: number;
  first_name: string | null;
  last_name: string | null;
  pseudonym: string | null;
  employee_code: string | null;
  department_name: string | null;
};

async function loadBaseEmployees(): Promise<BaseEmployeeRow[]> {
  const [rows] = await pool.query(`
    SELECT
      e.id,
      e.first_name,
      e.last_name,
      e.pseudonym,
      e.employee_code,
      d.name AS department_name
    FROM hrm_employees e
    LEFT JOIN employee_jobs j ON e.id = j.employee_id
    LEFT JOIN departments d ON j.department_id = d.id
    ORDER BY e.id ASC
  `);

  const seen = new Set<number>();
  const unique: BaseEmployeeRow[] = [];
  for (const raw of rows as Array<Record<string, unknown>>) {
    const id = Number(raw.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    unique.push({
      id,
      first_name: raw.first_name != null ? String(raw.first_name) : null,
      last_name: raw.last_name != null ? String(raw.last_name) : null,
      pseudonym: raw.pseudonym != null ? String(raw.pseudonym) : null,
      employee_code: raw.employee_code != null ? String(raw.employee_code) : null,
      department_name: raw.department_name != null ? String(raw.department_name) : null,
    });
  }
  return unique;
}

async function loadVerificationFlags(): Promise<Map<number, boolean>> {
  const map = new Map<number, boolean>();
  await ensureFaceVerificationColumn();
  try {
    const [rows] = await pool.query(
      `SELECT id, COALESCE(face_verification_enabled, 1) AS face_verification_enabled
       FROM hrm_employees`
    );
    for (const raw of rows as Array<Record<string, unknown>>) {
      const id = Number(raw.id);
      if (!id) continue;
      map.set(id, Number(raw.face_verification_enabled ?? 1) === 1);
    }
  } catch {
    // default all enabled
  }
  return map;
}

async function loadEnrollmentCounts(): Promise<
  Map<number, { photo_count: number; descriptor_count: number }>
> {
  const map = new Map<number, { photo_count: number; descriptor_count: number }>();
  try {
    await ensureFaceEnrollmentTable();
    const [rows] = await pool.query(`
      SELECT
        employee_id,
        COUNT(*) AS photo_count,
        SUM(CASE WHEN face_descriptor IS NOT NULL THEN 1 ELSE 0 END) AS descriptor_count
      FROM employee_face_enrollment
      GROUP BY employee_id
    `);
    for (const raw of rows as Array<Record<string, unknown>>) {
      const id = Number(raw.employee_id);
      if (!id) continue;
      map.set(id, {
        photo_count: Number(raw.photo_count ?? 0),
        descriptor_count: Number(raw.descriptor_count ?? 0),
      });
    }
  } catch {
    // no enrollment data
  }
  return map;
}

export async function listEmployeesFaceVerification(): Promise<EmployeeFaceVerificationRow[]> {
  const [baseEmployees, verificationFlags, enrollmentCounts] = await Promise.all([
    loadBaseEmployees(),
    loadVerificationFlags(),
    loadEnrollmentCounts(),
  ]);

  return baseEmployees.map((row) => {
    const name = [row.first_name, row.last_name]
      .map((v) => String(v || "").trim())
      .filter(Boolean)
      .join(" ");
    const counts = enrollmentCounts.get(row.id) ?? { photo_count: 0, descriptor_count: 0 };

    return {
      id: row.id,
      name: name || `Employee ${row.id}`,
      pseudonym: row.pseudonym,
      employee_code: row.employee_code,
      department: row.department_name,
      face_verification_enabled: verificationFlags.get(row.id) ?? true,
      photo_count: counts.photo_count,
      descriptor_count: counts.descriptor_count,
    };
  });
}
