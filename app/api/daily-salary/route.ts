import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { ATTENDANCE_TABLE, ensureAttendanceTable } from "@/lib/attendance-table";
import {
  applyDayEdit,
  buildEmployeeDailySalary,
  monthDateKeys,
  recordDateKey,
  type DailySalarySummary,
} from "@/lib/daily-salary-calc";
import {
  ensureDailySalaryTables,
  loadManualDaysMap,
  loadSavedDays,
  loadSavedSummaries,
  saveEmployeeDailySalary,
  syncUnpaidDaysToPayroll,
} from "@/lib/daily-salary-table";

function parseMonth(raw: string | null): string | null {
  const m = String(raw || "").trim();
  return /^\d{4}-\d{2}$/.test(m) ? m : null;
}

function monthRange(month: string): { from: string; to: string } {
  const keys = monthDateKeys(month);
  return { from: keys[0], to: keys[keys.length - 1] };
}

async function loadCalendarOverrides(
  conn: any,
  from: string,
  to: string,
): Promise<Record<string, "off" | "working">> {
  try {
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS company_calendar_days (
        id INT AUTO_INCREMENT PRIMARY KEY,
        date DATE NOT NULL UNIQUE,
        status VARCHAR(20) NOT NULL,
        note VARCHAR(255) NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  } catch {
    /* ignore */
  }
  const [rows]: any = await conn.query(
    `SELECT date, status FROM company_calendar_days WHERE date BETWEEN ? AND ?`,
    [from, to],
  );
  const map: Record<string, "off" | "working"> = {};
  for (const r of rows || []) {
    const dk =
      r.date instanceof Date
        ? `${r.date.getFullYear()}-${String(r.date.getMonth() + 1).padStart(2, "0")}-${String(r.date.getDate()).padStart(2, "0")}`
        : String(r.date).slice(0, 10);
    if (r.status === "off" || r.status === "working") map[dk] = r.status;
  }
  return map;
}

async function loadApprovedLeaves(
  conn: any,
  from: string,
  to: string,
  employeeIds?: string[],
): Promise<Record<string, Set<string>>> {
  let sql = `SELECT employee_id, start_date, end_date FROM employee_leaves
             WHERE status = 'approved' AND start_date <= ? AND end_date >= ?`;
  const params: any[] = [to, from];
  if (employeeIds && employeeIds.length) {
    sql += ` AND employee_id IN (${employeeIds.map(() => "?").join(",")})`;
    params.push(...employeeIds);
  }
  const [rows]: any = await conn.query(sql, params);
  const map: Record<string, Set<string>> = {};
  for (const leave of rows || []) {
    const empId = String(leave.employee_id);
    if (!map[empId]) map[empId] = new Set();
    const start = new Date(leave.start_date);
    const end = new Date(leave.end_date);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
    const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const endLocal = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    while (cur <= endLocal) {
      const dk = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`;
      if (dk >= from && dk <= to) map[empId].add(dk);
      cur.setDate(cur.getDate() + 1);
    }
  }
  return map;
}

async function loadEmployeesWithSalary(conn: any, employeeId?: string | null) {
  // Split queries: mongo SQL adapter often fails JOIN+SUM (and id number vs string).
  // Match salaries in JS via String(employee_id).
  let empSql = `
    SELECT e.id as employee_id,
           e.first_name,
           e.last_name,
           e.pseudonym,
           e.gender,
           d.name AS department_name
    FROM hrm_employees e
    LEFT JOIN employee_jobs j ON e.id = j.employee_id
    LEFT JOIN departments d ON j.department_id = d.id
  `;
  const empParams: any[] = [];
  if (employeeId) {
    empSql += ` WHERE e.id = ?`;
    empParams.push(employeeId);
    // Also try string id for mongo mixed types
    if (String(employeeId) !== String(Number(employeeId)) || Number.isNaN(Number(employeeId))) {
      /* keep as-is */
    }
  }
  empSql += ` ORDER BY e.id ASC`;
  const [empRows]: any = await conn.query(empSql, empParams);

  // If filtered by id and empty (type mismatch), retry without WHERE and filter in JS
  let employees: any[] = empRows || [];
  if (employeeId && employees.length === 0) {
    const [all]: any = await conn.query(
      `SELECT e.id as employee_id, e.first_name, e.last_name, e.pseudonym, e.gender, d.name AS department_name
       FROM hrm_employees e
       LEFT JOIN employee_jobs j ON e.id = j.employee_id
       LEFT JOIN departments d ON j.department_id = d.id
       ORDER BY e.id ASC`,
      [],
    );
    employees = (all || []).filter((e: any) => String(e.employee_id) === String(employeeId));
  }

  const [salRows]: any = await conn.query(
    `SELECT employee_id, amount FROM employee_salaries`,
    [],
  );
  const salaryByEmp = new Map<string, number>();
  for (const s of salRows || []) {
    const key = String(s.employee_id ?? "").trim();
    if (!key) continue;
    const amt = Number(s.amount);
    if (!Number.isFinite(amt) || amt === 0) continue;
    salaryByEmp.set(key, (salaryByEmp.get(key) || 0) + amt);
  }

  return employees.map((e: any) => {
    const id = String(e.employee_id);
    const name = `${e.first_name || ""} ${e.last_name || ""}`.trim() || id;
    return {
      employee_id: id,
      employee_name: name,
      pseudonym: e.pseudonym || "",
      gender: e.gender,
      department_name: e.department_name || "",
      basic_salary: salaryByEmp.get(id) || 0,
    };
  });
}

async function loadAttendanceByEmployee(
  conn: any,
  from: string,
  to: string,
  employeeId?: string | null,
): Promise<Record<string, Record<string, any[]>>> {
  await ensureAttendanceTable(conn);
  let sql = `
    SELECT ea.*,
           sa.start_time AS shift_start_time,
           sa.end_time AS shift_end_time,
           e.gender AS gender
    FROM ${ATTENDANCE_TABLE} ea
    LEFT JOIN hrm_employees e ON ea.employee_id = e.id
    LEFT JOIN shift_assignments sa
      ON sa.employee_id = ea.employee_id
     AND sa.assigned_date = (
       SELECT MAX(sa2.assigned_date)
       FROM shift_assignments sa2
       WHERE sa2.employee_id = ea.employee_id
         AND sa2.assigned_date <= ea.date
     )
    WHERE ea.date BETWEEN ? AND ?
  `;
  const params: any[] = [from, to];
  if (employeeId) {
    sql += ` AND ea.employee_id = ?`;
    params.push(employeeId);
  }
  const [rows]: any = await conn.query(sql, params);
  const map: Record<string, Record<string, any[]>> = {};
  for (const row of rows || []) {
    const empId = String(row.employee_id);
    const dk = recordDateKey(row);
    if (!dk) continue;
    if (!map[empId]) map[empId] = {};
    if (!map[empId][dk]) map[empId][dk] = [];
    map[empId][dk].push(row);
  }
  return map;
}

async function generateForMonth(
  conn: any,
  month: string,
  employeeId: string | null,
  preserveManual: boolean,
): Promise<DailySalarySummary[]> {
  const { from, to } = monthRange(month);
  const employees = await loadEmployeesWithSalary(conn, employeeId);
  const empIds = employees.map((e: any) => String(e.employee_id));
  const calendar = await loadCalendarOverrides(conn, from, to);
  const leaves = await loadApprovedLeaves(conn, from, to, empIds.length ? empIds : undefined);
  const attendance = await loadAttendanceByEmployee(conn, from, to, employeeId);

  const results: DailySalarySummary[] = [];
  for (const emp of employees) {
    const id = String(emp.employee_id);
    const previousManual = preserveManual ? await loadManualDaysMap(conn, month, id) : undefined;
    const summary = buildEmployeeDailySalary({
      employeeId: id,
      employeeName: String(emp.employee_name || id),
      pseudonym: emp.pseudonym || "",
      departmentName: emp.department_name || "",
      month,
      basicSalary: Number(emp.basic_salary) || 0,
      gender: emp.gender,
      attendanceByDate: attendance[id] || {},
      approvedLeaveDates: leaves[id] || new Set(),
      calendarOverrides: calendar,
      previousManualDays: previousManual,
    });
    await saveEmployeeDailySalary(conn, summary);
    await syncUnpaidDaysToPayroll(conn, id, month, summary.unpaid_days);
    results.push(summary);
  }
  return results;
}

/** GET ?month=YYYY-MM&employee_id= — list summaries or one employee with days */
export async function GET(request: NextRequest) {
  try {
    const month = parseMonth(request.nextUrl.searchParams.get("month"));
    if (!month) {
      return NextResponse.json({ success: false, error: "month (YYYY-MM) is required" }, { status: 400 });
    }
    const employeeId = request.nextUrl.searchParams.get("employee_id")?.trim() || null;

    const conn = await pool.getConnection();
    try {
      await ensureDailySalaryTables(conn);
      const summaries = await loadSavedSummaries(conn, month, employeeId);

      if (employeeId) {
        const id = String(employeeId);
        const days = await loadSavedDays(conn, month, id);
        const empRows = await loadEmployeesWithSalary(conn, id);
        const emp =
          empRows.find((e: any) => String(e.employee_id) === id) || empRows[0];
        const base =
          summaries.find((s) => String(s.employee_id) === id) || summaries[0];
        // Never return another employee's summary for this id.
        if (base && String(base.employee_id) !== id) {
          return NextResponse.json({
            success: true,
            month,
            summary: null,
          });
        }
        return NextResponse.json({
          success: true,
          month,
          summary: base
            ? {
                ...base,
                employee_id: id,
                employee_name: emp?.employee_name || id,
                pseudonym: emp?.pseudonym || "",
                department_name: emp?.department_name || "",
                days,
              }
            : null,
        });
      }

      // Enrich list with names
      const empRows = await loadEmployeesWithSalary(conn, null);
      const nameMap = new Map<string, any>(
        empRows.map((e: any) => [String(e.employee_id), e]),
      );
      const list = summaries.map((s) => {
        const emp = nameMap.get(s.employee_id);
        return {
          ...s,
          employee_name: emp?.employee_name || s.employee_id,
          pseudonym: emp?.pseudonym || "",
          department_name: emp?.department_name || "",
        };
      });
      return NextResponse.json({ success: true, month, summaries: list });
    } finally {
      conn.release();
    }
  } catch (error) {
    console.error("daily-salary GET:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to load" },
      { status: 500 },
    );
  }
}

/**
 * POST { month, employee_id?, regenerate?: true, preserve_manual?: true }
 * Generate (or regenerate) daily salary records from attendance.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const month = parseMonth(String(body.month || ""));
    if (!month) {
      return NextResponse.json({ success: false, error: "month (YYYY-MM) is required" }, { status: 400 });
    }
    const employeeId = body.employee_id ? String(body.employee_id).trim() : null;
    const preserveManual = body.preserve_manual !== false;

    const conn = await pool.getConnection();
    try {
      await ensureDailySalaryTables(conn);
      await conn.beginTransaction();
      const results = await generateForMonth(conn, month, employeeId, preserveManual);
      await conn.commit();
      return NextResponse.json({
        success: true,
        month,
        count: results.length,
        summaries: results.map((r) => ({
          employee_id: r.employee_id,
          employee_name: r.employee_name,
          pseudonym: r.pseudonym,
          department_name: r.department_name,
          basic_salary: r.basic_salary,
          working_days: r.working_days,
          daily_rate: r.daily_rate,
          total_earned: r.total_earned,
          total_deducted: r.total_deducted,
          unpaid_days: r.unpaid_days,
        })),
      });
    } catch (err) {
      try {
        await conn.rollback();
      } catch {
        /* ignore */
      }
      throw err;
    } finally {
      conn.release();
    }
  } catch (error) {
    console.error("daily-salary POST:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to generate" },
      { status: 500 },
    );
  }
}

/**
 * PUT { employee_id, month, work_date, status_label?, deduction_percent?, earned_amount?, deducted_amount?, notes? }
 * Edit one day; recalculate month totals; sync unpaid_days to Monthly Payroll.
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const employeeId = String(body.employee_id || "").trim();
    const month = parseMonth(String(body.month || ""));
    const workDate = String(body.work_date || "").trim();
    if (!employeeId || !month || !/^\d{4}-\d{2}-\d{2}$/.test(workDate)) {
      return NextResponse.json(
        { success: false, error: "employee_id, month, and work_date are required" },
        { status: 400 },
      );
    }

    const conn = await pool.getConnection();
    try {
      await ensureDailySalaryTables(conn);
      const summaries = await loadSavedSummaries(conn, month, employeeId);
      let days = await loadSavedDays(conn, month, employeeId);

      if (!summaries.length || !days.length) {
        // Auto-generate first if missing
        await generateForMonth(conn, month, employeeId, true);
        days = await loadSavedDays(conn, month, employeeId);
      }

      const saved = (await loadSavedSummaries(conn, month, employeeId))[0];
      const empRows = await loadEmployeesWithSalary(conn, employeeId);
      const emp = empRows[0];
      if (!saved || !days.length) {
        return NextResponse.json({ success: false, error: "No daily salary record found" }, { status: 404 });
      }

      const current: DailySalarySummary = {
        employee_id: employeeId,
        employee_name: emp?.employee_name || employeeId,
        pseudonym: emp?.pseudonym || "",
        department_name: emp?.department_name || "",
        month,
        basic_salary: saved.basic_salary,
        working_days: saved.working_days,
        daily_rate: saved.daily_rate,
        total_earned: saved.total_earned,
        total_deducted: saved.total_deducted,
        unpaid_days: saved.unpaid_days,
        days,
      };

      const updated = applyDayEdit(current, workDate, {
        status_label: body.status_label,
        deduction_percent: body.deduction_percent != null ? Number(body.deduction_percent) : undefined,
        money_override: body.money_override === true,
        earned_amount: body.earned_amount != null ? Number(body.earned_amount) : undefined,
        deducted_amount: body.deducted_amount != null ? Number(body.deducted_amount) : undefined,
        notes: body.notes !== undefined ? (body.notes == null ? null : String(body.notes)) : undefined,
      });

      await saveEmployeeDailySalary(conn, updated);
      await syncUnpaidDaysToPayroll(conn, employeeId, month, updated.unpaid_days);

      return NextResponse.json({ success: true, summary: updated });
    } finally {
      conn.release();
    }
  } catch (error) {
    console.error("daily-salary PUT:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to update" },
      { status: 500 },
    );
  }
}
