import { NextRequest, NextResponse } from "next/server";
import { pool } from "../../../lib/db";
import { getLeaveCycleStartYmd } from "../../../lib/leave-cycle";

function toYmd(value: any): string | null {
  if (!value) return null;
  if (typeof value === "string") {
    const m = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
    if (m) return m[1];
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function GET(req: NextRequest) {
  let conn: any;
  try {
    const { searchParams } = new URL(req.url);
    const employee_id = searchParams.get("employee_id");

    if (!employee_id) {
      return NextResponse.json({ success: false, error: "employee_id is required" });
    }

    conn = await pool.getConnection();

    // Resolve employee first (input can be numeric id, employee_code, or username).
    const [empRows]: any = await conn.execute(
      "SELECT id, employee_code, employment_status FROM hrm_employees WHERE employee_code = ? OR CAST(id AS CHAR) = ? OR username = ?",
      [employee_id, employee_id, employee_id]
    );
    const emp = empRows.length > 0 ? empRows[0] : null;
    const resolvedEmployeeId = emp?.id ? Number(emp.id) : null;

    const [jobRows]: any = await conn.execute(
      "SELECT employment_status, joined_date FROM employee_jobs WHERE employee_id = ?",
      [resolvedEmployeeId]
    );
    const job = jobRows.length > 0 ? jobRows[0] : null;

    const empStatusRaw: string = emp?.employment_status || job?.employment_status || "";

    // Determine effective status
    let effectiveStatus: "Probation" | "Permanent" = empStatusRaw === "Probation" ? "Probation" : "Permanent";
    
    // Fetch custom leave allowance and adjustments from database using correct employee_id
    const [allowanceResult]: any = await conn.execute(
      "SELECT * FROM employee_leave_allowances WHERE employee_id = ?",
      [resolvedEmployeeId]
    );
    
    const allowanceRows = (allowanceResult && allowanceResult.length > 0) ? allowanceResult : [];
    const customAllowance = allowanceRows.length > 0 ? allowanceRows[0] : null;
    
    // Use fixed allowance based on employment status
    let annualAllowance = effectiveStatus === "Probation" ? 3 : 20;
    let bereavementAllowance = 3;
    
    const leaveCycleStart = getLeaveCycleStartYmd(job?.joined_date || null);

    // Apply manual adjustments only if they were set in the current leave cycle.
    const adjustmentUpdatedAt = toYmd(customAllowance?.updated_at);
    const isCurrentCycleAdjustment =
      !leaveCycleStart || (adjustmentUpdatedAt !== null && adjustmentUpdatedAt >= leaveCycleStart);
    const annualBalanceAdjustment = isCurrentCycleAdjustment
      ? (customAllowance?.annual_balance_adjustment ?? 0)
      : 0;
    const bereavementBalanceAdjustment = isCurrentCycleAdjustment
      ? (customAllowance?.bereavement_balance_adjustment ?? 0)
      : 0;

    // Fetch all approved leaves for this employee (handle both numeric and string IDs)
    let leavesQuery =
      "SELECT leave_category, total_days, start_date FROM employee_leaves WHERE (employee_id = ? OR CAST(employee_id AS CHAR) = ?) AND status = 'approved'";
    const leaveId = resolvedEmployeeId ?? employee_id;
    const leaveParams: any[] = [leaveId, String(leaveId)];
    if (leaveCycleStart) {
      leavesQuery += " AND start_date >= ?";
      leaveParams.push(leaveCycleStart);
    }
    const [leaves]: any = await conn.execute(leavesQuery, leaveParams);

    // Define default allowances for each category
    const categoryAllowances: { [key: string]: number } = {
      annual: annualAllowance,
      casual: 10,
      sick: 15,
      bereavement: bereavementAllowance,
      other: 5
    };

    // Calculate used leave for each category
    const usedLeave: { [key: string]: number } = {};
    let totalUsedDays = 0;
    
    leaves.forEach((leave: any) => {
      const category = leave.leave_category;
      const days = parseInt(leave.total_days || 0);
      usedLeave[category] = (usedLeave[category] || 0) + days;
      totalUsedDays += days;
    });

    // Calculate remaining balance for each category
    const balance: { [key: string]: number } = {};
    Object.keys(categoryAllowances).forEach((category) => {
      balance[category] = categoryAllowances[category] - (usedLeave[category] || 0);
    });

    // Annual balance = total allowance - all approved leaves used (except bereavement) + adjustment
    const bereavementUsedDays = usedLeave.bereavement || 0;
    const totalAnnualAllowance = annualAllowance;
    const totalApprovedDaysUsed = totalUsedDays - bereavementUsedDays;
    const annualBalance = totalAnnualAllowance - totalApprovedDaysUsed + annualBalanceAdjustment;
    const bereavementBalance = bereavementAllowance - bereavementUsedDays + bereavementBalanceAdjustment;

    return NextResponse.json({
      success: true,
      employee_id,
      employment_status: effectiveStatus,
      probationEndsOn: null,
      leaveCycleStart,
      leavesFound: leaves.length,
      leaves: leaves,
      usedLeave,
      categoryBalance: balance,
      totalUsedDays,
      bereavementUsedDays,
      annualBalance: Math.max(0, annualBalance),
      annualAllowance: totalAnnualAllowance,
      bereavementBalance: Math.max(0, bereavementBalance),
      annualBalanceAdjustment,
      bereavementBalanceAdjustment
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  } finally {
    if (conn) conn.release();
  }
}

