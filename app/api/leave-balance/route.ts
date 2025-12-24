import { NextRequest, NextResponse } from "next/server";
import mysql from "mysql2/promise";

const dbConfig = {
  host: "localhost",
  user: "root",
  password: "",
  database: "interact_hrm"
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const employee_id = searchParams.get("employee_id");

    if (!employee_id) {
      return NextResponse.json({ success: false, error: "employee_id is required" });
    }

    const conn = await mysql.createConnection(dbConfig);

    // Fetch employment status from hrm_employees and employee_jobs (manual control only)
    const [empResult, jobResult]: any = await Promise.all([
      conn.execute(
        "SELECT id, employee_code, employment_status FROM hrm_employees WHERE employee_code = ? OR CAST(id AS CHAR) = ? OR username = ?",
        [employee_id, employee_id, employee_id]
      ),
      conn.execute(
        "SELECT employment_status FROM employee_jobs WHERE employee_id = ?",
        [employee_id]
      )
    ]);

    const empRows = (empResult && empResult[0]) || [];
    const jobRows = (jobResult && jobResult[0]) || [];

    const emp = empRows.length > 0 ? empRows[0] : null;
    const job = jobRows.length > 0 ? jobRows[0] : null;

    const empStatusRaw: string = emp?.employment_status || job?.employment_status || "";

    // Determine effective status + allowance (manual status only)
    let effectiveStatus: "Probation" | "Permanent" = empStatusRaw === "Probation" ? "Probation" : "Permanent";
    let annualAllowance = effectiveStatus === "Probation" ? 3 : 20;

    // Fetch all approved leaves for this employee (handle both numeric and string IDs)
    const [leaves]: any = await conn.execute(
      "SELECT leave_category, total_days FROM employee_leaves WHERE (employee_id = ? OR CAST(employee_id AS CHAR) = ?) AND status = 'approved'",
      [employee_id, String(employee_id)]
    );

    await conn.end();

    // Define default allowances for each category
    const categoryAllowances: { [key: string]: number } = {
      annual: annualAllowance,
      casual: 10,
      sick: 15,
      bereavement: 3,
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

    // Annual balance = total 20 days - all approved leaves used (except bereavement which is separate)
    const bereavementUsedDays = usedLeave.bereavement || 0;
    const totalAnnualAllowance = annualAllowance;
    const totalApprovedDaysUsed = totalUsedDays - bereavementUsedDays;
    const annualBalance = totalAnnualAllowance - totalApprovedDaysUsed;
    const bereavementBalance = categoryAllowances.bereavement - bereavementUsedDays;

    return NextResponse.json({
      success: true,
      employee_id,
      employment_status: effectiveStatus,
      probationEndsOn: null,
      leavesFound: leaves.length,
      leaves: leaves,
      usedLeave,
      categoryBalance: balance,
      totalUsedDays,
      bereavementUsedDays,
      annualBalance: Math.max(0, annualBalance),
      annualAllowance: totalAnnualAllowance,
      bereavementBalance: Math.max(0, bereavementBalance)
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

