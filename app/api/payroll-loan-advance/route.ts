import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

function asRows<T>(result: any): T[] {
  if (Array.isArray(result) && Array.isArray(result[0])) return result[0] as T[];
  if (Array.isArray(result)) return result as T[];
  return [];
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function idKeys(raw: string | number): string[] {
  const s = String(raw ?? "").trim();
  if (!s) return [];
  const keys = [s];
  if (/^\d+$/.test(s)) {
    const n = String(Number(s));
    if (n !== s) keys.push(n);
  }
  return keys;
}

function putAmount(map: Record<string, number>, employeeId: string | number, amount: number) {
  if (!(amount > 0)) return;
  for (const k of idKeys(employeeId)) {
    map[k] = Math.max(map[k] || 0, amount);
  }
}

/**
 * GET ?month=YYYY-MM
 * Returns unpaid advance + unpaid loan installment maps for Monthly Payroll
 * Loan/Advance column = advance + loan (sum).
 */
export async function GET(req: NextRequest) {
  try {
    const month = req.nextUrl.searchParams.get("month") || "";
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json(
        { success: false, message: "month (YYYY-MM) required" },
        { status: 400 },
      );
    }

    const advances: Record<string, number> = {};
    const loans: Record<string, number> = {};
    const combined: Record<string, number> = {};
    const breakdown: Record<
      string,
      { advance: number; loan: number; total: number }
    > = {};

    // 1) Legacy advance_salary by created_at OR updated_at month
    try {
      const [rows]: any = await query(
        `SELECT employee_id, advance_amount
         FROM advance_salary
         WHERE DATE_FORMAT(created_at, '%Y-%m') = ?
            OR DATE_FORMAT(updated_at, '%Y-%m') = ?
         ORDER BY id DESC`,
        [month, month],
      );
      for (const row of asRows<any>(rows)) {
        putAmount(advances, row.employee_id, num(row.advance_amount));
      }
    } catch {
      /* ignore */
    }

    // 2) History ledger by payroll_month (unpaid only)
    try {
      const [rows]: any = await query(
        `SELECT employee_id, amount, status
         FROM employee_advances
         WHERE payroll_month = ?`,
        [month],
      );
      for (const row of asRows<any>(rows)) {
        const st = String(row.status || "active").toLowerCase();
        if (st === "paid" || st === "cancelled") continue;
        putAmount(advances, row.employee_id, num(row.amount));
      }
    } catch {
      /* ignore */
    }

    // 3) Loan installments for this month (unpaid only)
    try {
      const [rows]: any = await query(
        `SELECT employee_id, original_amount, payable_this_month, status
         FROM loan_installments
         WHERE month = ?`,
        [month],
      );
      for (const row of asRows<any>(rows)) {
        const st = String(row.status || "pending").toLowerCase();
        if (st === "paid") continue;
        const val = num(row.payable_this_month ?? row.original_amount);
        if (!(val > 0)) continue;
        for (const k of idKeys(row.employee_id)) {
          loans[k] = (loans[k] || 0) + val;
        }
      }
    } catch {
      /* ignore */
    }

    const allIds = new Set([...Object.keys(advances), ...Object.keys(loans)]);
    for (const id of allIds) {
      // Prefer canonical numeric key for breakdown
      const canonical = /^\d+$/.test(id) ? String(Number(id)) : id;
      const adv = Math.max(advances[id] || 0, advances[canonical] || 0);
      const loan = Math.max(loans[id] || 0, loans[canonical] || 0);
      const total = adv + loan;
      if (total <= 0) continue;
      for (const k of idKeys(canonical === id ? id : canonical)) {
        combined[k] = total;
      }
      breakdown[canonical] = { advance: adv, loan, total };
    }

    return NextResponse.json({
      success: true,
      month,
      advances,
      loans,
      combined,
      breakdown,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error?.message || "Internal server error" },
      { status: 500 },
    );
  }
}
