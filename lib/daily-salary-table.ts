import type { PoolConnection } from "mysql2/promise";
import type { DailySalaryDayRow, DailySalarySummary } from "./daily-salary-calc";

export async function ensureDailySalaryTables(conn: {
  execute: (sql: string, params?: unknown[]) => Promise<unknown>;
  query?: (sql: string, params?: unknown[]) => Promise<unknown>;
}) {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS daily_salary_summaries (
      id INT AUTO_INCREMENT PRIMARY KEY,
      employee_id VARCHAR(64) NOT NULL,
      month VARCHAR(7) NOT NULL,
      basic_salary DECIMAL(12,2) NOT NULL DEFAULT 0.00,
      working_days INT NOT NULL DEFAULT 0,
      daily_rate DECIMAL(12,2) NOT NULL DEFAULT 0.00,
      total_earned DECIMAL(12,2) NOT NULL DEFAULT 0.00,
      total_deducted DECIMAL(12,2) NOT NULL DEFAULT 0.00,
      unpaid_days DECIMAL(8,2) NOT NULL DEFAULT 0.00,
      generated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY employee_month_unique (employee_id, month),
      KEY idx_month (month)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS daily_salary_days (
      id INT AUTO_INCREMENT PRIMARY KEY,
      employee_id VARCHAR(64) NOT NULL,
      month VARCHAR(7) NOT NULL,
      work_date DATE NOT NULL,
      is_working_day TINYINT(1) NOT NULL DEFAULT 1,
      status_label VARCHAR(64) NOT NULL DEFAULT '',
      tardy_count INT DEFAULT NULL,
      deduction_percent DECIMAL(5,2) NOT NULL DEFAULT 0.00,
      daily_rate DECIMAL(12,2) NOT NULL DEFAULT 0.00,
      deducted_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
      earned_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
      clock_in VARCHAR(64) DEFAULT NULL,
      clock_out VARCHAR(64) DEFAULT NULL,
      is_manual TINYINT(1) NOT NULL DEFAULT 0,
      notes VARCHAR(500) DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY employee_date_unique (employee_id, work_date),
      KEY idx_month_emp (month, employee_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

function formatDate(value: unknown): string {
  if (!value) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s;
}

export async function loadSavedSummaries(
  conn: PoolConnection,
  month: string,
  employeeId?: string | null,
): Promise<
  Array<{
    employee_id: string;
    month: string;
    basic_salary: number;
    working_days: number;
    daily_rate: number;
    total_earned: number;
    total_deducted: number;
    unpaid_days: number;
    updated_at: string | null;
  }>
> {
  const params: string[] = [month];
  let sql = `SELECT employee_id, month, basic_salary, working_days, daily_rate,
              total_earned, total_deducted, unpaid_days, updated_at
              FROM daily_salary_summaries WHERE month = ?`;
  if (employeeId) {
    sql += ` AND employee_id = ?`;
    params.push(employeeId);
  }
  sql += ` ORDER BY employee_id ASC`;
  const [rows]: any = await conn.query(sql, params);
  return (rows || []).map((r: any) => ({
    employee_id: String(r.employee_id),
    month: String(r.month),
    basic_salary: Number(r.basic_salary) || 0,
    working_days: Number(r.working_days) || 0,
    daily_rate: Number(r.daily_rate) || 0,
    total_earned: Number(r.total_earned) || 0,
    total_deducted: Number(r.total_deducted) || 0,
    unpaid_days: Number(r.unpaid_days) || 0,
    updated_at: r.updated_at ? String(r.updated_at) : null,
  }));
}

export async function loadSavedDays(
  conn: PoolConnection,
  month: string,
  employeeId: string,
): Promise<DailySalaryDayRow[]> {
  const [rows]: any = await conn.query(
    `SELECT work_date, is_working_day, status_label, tardy_count, deduction_percent,
            daily_rate, deducted_amount, earned_amount, clock_in, clock_out, is_manual, notes
     FROM daily_salary_days
     WHERE month = ? AND employee_id = ?
     ORDER BY work_date ASC`,
    [month, employeeId],
  );
  return (rows || []).map((r: any) => ({
    work_date: formatDate(r.work_date),
    is_working_day: Boolean(r.is_working_day),
    status_label: String(r.status_label || ""),
    tardy_count: r.tardy_count == null ? null : Number(r.tardy_count),
    deduction_percent: Number(r.deduction_percent) || 0,
    daily_rate: Number(r.daily_rate) || 0,
    deducted_amount: Number(r.deducted_amount) || 0,
    earned_amount: Number(r.earned_amount) || 0,
    clock_in: r.clock_in ? String(r.clock_in) : null,
    clock_out: r.clock_out ? String(r.clock_out) : null,
    is_manual: Boolean(r.is_manual),
    notes: r.notes != null ? String(r.notes) : null,
  }));
}

export async function loadManualDaysMap(
  conn: PoolConnection,
  month: string,
  employeeId: string,
): Promise<Map<string, DailySalaryDayRow>> {
  const days = await loadSavedDays(conn, month, employeeId);
  const map = new Map<string, DailySalaryDayRow>();
  for (const d of days) {
    if (d.is_manual) map.set(d.work_date, d);
  }
  return map;
}

export async function saveEmployeeDailySalary(conn: PoolConnection, summary: DailySalarySummary) {
  await conn.query(
    `INSERT INTO daily_salary_summaries
      (employee_id, month, basic_salary, working_days, daily_rate, total_earned, total_deducted, unpaid_days)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
      basic_salary = VALUES(basic_salary),
      working_days = VALUES(working_days),
      daily_rate = VALUES(daily_rate),
      total_earned = VALUES(total_earned),
      total_deducted = VALUES(total_deducted),
      unpaid_days = VALUES(unpaid_days)`,
    [
      summary.employee_id,
      summary.month,
      summary.basic_salary,
      summary.working_days,
      summary.daily_rate,
      summary.total_earned,
      summary.total_deducted,
      summary.unpaid_days,
    ],
  );

  // Replace all days for this employee/month
  await conn.query(`DELETE FROM daily_salary_days WHERE employee_id = ? AND month = ?`, [
    summary.employee_id,
    summary.month,
  ]);

  if (!summary.days.length) return;

  const values: unknown[] = [];
  const placeholders: string[] = [];
  for (const d of summary.days) {
    placeholders.push("(?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
    values.push(
      summary.employee_id,
      summary.month,
      d.work_date,
      d.is_working_day ? 1 : 0,
      d.status_label,
      d.tardy_count,
      d.deduction_percent,
      d.daily_rate,
      d.deducted_amount,
      d.earned_amount,
      d.clock_in,
      d.clock_out,
      d.is_manual ? 1 : 0,
      d.notes,
    );
  }
  await conn.query(
    `INSERT INTO daily_salary_days
      (employee_id, month, work_date, is_working_day, status_label, tardy_count, deduction_percent,
       daily_rate, deducted_amount, earned_amount, clock_in, clock_out, is_manual, notes)
     VALUES ${placeholders.join(",")}`,
    values,
  );
}

/** Sync unpaid days into monthly payroll adjustments so Monthly Payroll picks it up. */
export async function syncUnpaidDaysToPayroll(
  conn: PoolConnection,
  employeeId: string,
  month: string,
  unpaidDays: number,
) {
  try {
    await conn.query(
      `INSERT INTO monthly_payroll_adjustments (employee_id, month, ctd, fuel_allowance, unpaid_days)
       VALUES (?, ?, 0, NULL, ?)
       ON DUPLICATE KEY UPDATE unpaid_days = VALUES(unpaid_days)`,
      [employeeId, month, unpaidDays],
    );
  } catch (err) {
    console.warn("syncUnpaidDaysToPayroll skipped:", err);
  }
}
