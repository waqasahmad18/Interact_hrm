import { NextRequest, NextResponse } from "next/server";
import {
  markMonthDeductionsPaid,
  markMonthDeductionsPaidForAll,
  reconcileLegacyFinancialHistory,
} from "@/lib/employee-financial-history";

/**
 * POST { month: "YYYY-MM", employee_id?: number }
 * Marks that month's advance + loan installment as paid (Loan page, Advance page, Financial History).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const month = String(body.month || "").trim();
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json(
        { success: false, message: "month (YYYY-MM) required" },
        { status: 400 },
      );
    }

    await reconcileLegacyFinancialHistory();

    const employeeIdRaw = body.employee_id;
    if (employeeIdRaw != null && String(employeeIdRaw).trim() !== "") {
      const employeeId = Number(employeeIdRaw);
      if (!Number.isFinite(employeeId) || employeeId <= 0) {
        return NextResponse.json(
          { success: false, message: "Invalid employee_id" },
          { status: 400 },
        );
      }
      const result = await markMonthDeductionsPaid(employeeId, month);
      return NextResponse.json({
        success: true,
        month,
        employee_id: employeeId,
        ...result,
        message: `Advance + loan installment for ${month} marked Paid on Loan page, Advance page, and Financial History.`,
      });
    }

    const result = await markMonthDeductionsPaidForAll(month);
    return NextResponse.json({
      success: true,
      month,
      ...result,
      message: `${month}: ${result.advances_marked} advance(s) + ${result.loans_marked} loan installment(s) marked Paid (Loan page, Advance page, Financial History).`,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error?.message || "Internal server error" },
      { status: 500 },
    );
  }
}
