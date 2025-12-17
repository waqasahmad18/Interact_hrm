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

    // Fetch all approved leaves for this employee (handle both numeric and string IDs)
    const [leaves]: any = await conn.execute(
      "SELECT leave_category, total_days FROM employee_leaves WHERE (employee_id = ? OR CAST(employee_id AS CHAR) = ?) AND status = 'approved'",
      [employee_id, String(employee_id)]
    );

    await conn.end();

    // Define default allowances for each category
    const categoryAllowances: { [key: string]: number } = {
      annual: 20,
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
    const totalAnnualAllowance = 20;
    const totalApprovedDaysUsed = totalUsedDays - bereavementUsedDays;
    const annualBalance = totalAnnualAllowance - totalApprovedDaysUsed;
    const bereavementBalance = categoryAllowances.bereavement - bereavementUsedDays;

    return NextResponse.json({
      success: true,
      employee_id,
      leavesFound: leaves.length,
      leaves: leaves,
      usedLeave,
      categoryBalance: balance,
      totalUsedDays,
      bereavementUsedDays,
      annualBalance: Math.max(0, annualBalance),
      bereavementBalance: Math.max(0, bereavementBalance)
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
