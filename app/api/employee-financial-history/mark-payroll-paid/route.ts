import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { isFinanceDepartment } from "@/lib/access-control/hr-access";
import { resolveEmployeeAccessRoleSlug } from "@/lib/access-control/store";
import {
  markMonthDeductionsPaid,
  markMonthDeductionsPaidForAll,
  reconcileLegacyFinancialHistory,
} from "@/lib/employee-financial-history";

function asRows<T>(result: any): T[] {
  if (Array.isArray(result) && Array.isArray(result[0])) return result[0] as T[];
  if (Array.isArray(result)) return result as T[];
  return [];
}

function isFinanceAccessRole(slugs: string[] | null | undefined): boolean {
  return (slugs || []).some((slug) => {
    const s = String(slug || "").trim().toLowerCase();
    return (
      s === "finance_manager" ||
      s === "team_lead_finance" ||
      s === "accountant_billing" ||
      s === "mp_finance" ||
      s.includes("finance_manager") ||
      s.includes("team_lead_finance")
    );
  });
}

async function resolveViewerDepartment(viewerId: string): Promise<string | null> {
  try {
    const [rows]: any = await query(
      `SELECT d.name AS department_name
       FROM hrm_employees e
       LEFT JOIN employee_jobs j ON j.employee_id = e.id
       LEFT JOIN departments d ON d.id = j.department_id
       WHERE e.id = ?
       LIMIT 1`,
      [Number(viewerId)],
    );
    const row = asRows<{ department_name?: string | null }>(rows)[0];
    return row?.department_name ? String(row.department_name) : null;
  } catch {
    return null;
  }
}

/**
 * POST { month: "YYYY-MM", employee_id?: number, viewer_id?: number }
 * Finance department only — marks advance + loan installment Paid everywhere.
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

    const viewerRaw =
      body.viewer_id ??
      req.headers.get("x-hrm-employee-id") ??
      req.headers.get("x-employee-id") ??
      "";
    const viewerId = String(viewerRaw || "").trim();
    if (!/^\d+$/.test(viewerId)) {
      return NextResponse.json(
        {
          success: false,
          message: "Finance employee login required to mark Loan/Advance Paid.",
        },
        { status: 403 },
      );
    }

    const deptName = await resolveViewerDepartment(viewerId);
    let financeRole = false;
    try {
      const access = await resolveEmployeeAccessRoleSlug(viewerId);
      financeRole = isFinanceAccessRole(access.roleSlugs);
    } catch {
      financeRole = false;
    }
    if (!isFinanceDepartment(deptName) && !financeRole) {
      return NextResponse.json(
        {
          success: false,
          message: "Only Finance department / Finance Manager can mark Loan/Advance as Paid.",
        },
        { status: 403 },
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
        marked_by: Number(viewerId),
        ...result,
        message: `Advance + loan installment for ${month} marked Paid on Loan page, Advance page, and Financial History.`,
      });
    }

    const result = await markMonthDeductionsPaidForAll(month);
    return NextResponse.json({
      success: true,
      month,
      marked_by: Number(viewerId),
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
