import { pool } from "@/lib/db";
import type { RowDataPacket } from "mysql2";

/** Cycle number as string: "1", "2", "3", … (legacy "1st"/"2nd" normalized on read). */
export type AppraisalCycle = string;

export type PendingAppraisalRow = {
  employee_id: number;
  employee_name: string;
  department_name: string | null;
  joined_date: string;
  cycle: AppraisalCycle;
  cycle_number: number;
  due_after_months: number;
  due_date: string;
  first_appraisal_months: number;
  second_appraisal_months: number;
  has_open_assignment: boolean;
};

function addMonths(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCMonth(dt.getUTCMonth() + months);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function todayIso(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

export function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** Normalize stored cycle keys to "1", "2", "3", … */
export function normalizeCycleKey(raw: string): string | null {
  const s = String(raw || "").trim().toLowerCase();
  if (!s) return null;
  if (s === "1st" || s === "1") return "1";
  if (s === "2nd" || s === "2") return "2";
  const m = s.match(/^(\d+)(st|nd|rd|th)?$/);
  if (m) {
    const n = Number(m[1]);
    return n >= 1 ? String(n) : null;
  }
  return null;
}

/**
 * Due dates from Date of Joining:
 *  1st = join + firstMonths (3|6)
 *  2nd = join + secondMonths (7|8|12)
 *  3rd+ = previous due + secondMonths (same loop forever)
 *     ≡ join + (n-1)*secondMonths for n >= 2
 */
export function dueDateForCycle(
  joinedDate: string,
  cycleNumber: number,
  firstMonths: number,
  secondMonths: number
): string {
  if (cycleNumber <= 1) return addMonths(joinedDate, firstMonths);
  return addMonths(joinedDate, (cycleNumber - 1) * secondMonths);
}

export function cycleLabel(cycle: AppraisalCycle | number, intervalMonths: number): string {
  const n = typeof cycle === "number" ? cycle : Number(normalizeCycleKey(String(cycle)) || cycle);
  const ord = ordinal(n);
  if (n === 1) return `${ord} appraisal (${intervalMonths} months)`;
  if (intervalMonths === 12) {
    return n === 2 ? `${ord} appraisal (Annual)` : `${ord} appraisal (every 12 months)`;
  }
  return n === 2
    ? `${ord} appraisal (${intervalMonths} months)`
    : `${ord} appraisal (every ${intervalMonths} months)`;
}

async function loadAppraisalCycleSets(
  statuses: string[]
): Promise<Map<number, Set<string>>> {
  const map = new Map<number, Set<string>>();
  const placeholders = statuses.map(() => "?").join(",");
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT a.employee_id, a.form_data
     FROM hrm_form_assignments a
     JOIN hrm_form_templates t ON t.id = a.template_id
     WHERE t.category = 'appraisal'
       AND a.status IN (${placeholders})`,
    statuses
  );
  for (const row of rows) {
    const empId = Number(row.employee_id);
    let cycle = "";
    try {
      const data =
        typeof row.form_data === "string" ? JSON.parse(row.form_data) : row.form_data || {};
      cycle = String(data.appraisal_cycle || "").trim();
    } catch {
      cycle = "";
    }
    const key = normalizeCycleKey(cycle);
    if (!key) continue;
    if (!map.has(empId)) map.set(empId, new Set());
    map.get(empId)!.add(key);
  }
  return map;
}

export async function getPendingAppraisals(): Promise<PendingAppraisalRow[]> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT
       e.id AS employee_id,
       TRIM(CONCAT(COALESCE(e.first_name,''), ' ', COALESCE(e.last_name,''))) AS employee_name,
       d.name AS department_name,
       DATE_FORMAT(j.joined_date, '%Y-%m-%d') AS joined_date,
       j.first_appraisal_months,
       j.second_appraisal_months
     FROM employee_jobs j
     JOIN hrm_employees e ON e.id = j.employee_id
     LEFT JOIN departments d ON d.id = j.department_id
     WHERE j.joined_date IS NOT NULL
       AND j.first_appraisal_months IN (3, 6)
       AND j.second_appraisal_months IN (7, 8, 12)
       AND (e.status IS NULL OR LOWER(e.status) IN ('active','enabled'))
     ORDER BY j.joined_date ASC`
  );

  const openMap = await loadAppraisalCycleSets(["pending", "in_progress", "draft"]);
  const doneMap = await loadAppraisalCycleSets(["submitted", "archived"]);
  const today = todayIso();
  const out: PendingAppraisalRow[] = [];

  for (const row of rows) {
    const empId = Number(row.employee_id);
    const joined = String(row.joined_date || "").slice(0, 10);
    if (!joined) continue;
    const firstM = Number(row.first_appraisal_months);
    const secondM = Number(row.second_appraisal_months);
    const open = openMap.get(empId) || new Set();
    const done = doneMap.get(empId) || new Set();

    // Next incomplete cycle only (1 → 2 → 3 → … looping on second interval)
    let n = 1;
    while (done.has(String(n))) n += 1;

    const intervalMonths = n === 1 ? firstM : secondM;
    const due = dueDateForCycle(joined, n, firstM, secondM);
    if (due > today) continue;

    const cycleKey = String(n);
    out.push({
      employee_id: empId,
      employee_name: String(row.employee_name || "").trim() || `Employee #${empId}`,
      department_name: row.department_name ? String(row.department_name) : null,
      joined_date: joined,
      cycle: cycleKey,
      cycle_number: n,
      due_after_months: intervalMonths,
      due_date: due,
      first_appraisal_months: firstM,
      second_appraisal_months: secondM,
      has_open_assignment: open.has(cycleKey),
    });
  }

  out.sort((a, b) => a.due_date.localeCompare(b.due_date));
  return out;
}

export async function getBlankAppraisalTemplateId(): Promise<number | null> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT id FROM hrm_form_templates
     WHERE category = 'appraisal' AND is_active = 1
     ORDER BY
       CASE WHEN title = 'Blank Appraisal Form' THEN 0 ELSE 1 END,
       id ASC
     LIMIT 1`
  );
  const id = Number(rows[0]?.id);
  return id > 0 ? id : null;
}
