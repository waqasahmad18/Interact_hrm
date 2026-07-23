import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

function parseMoney(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** GET ?month=YYYY-MM — load CTD + fuel adjustments for payroll month */
export async function GET(request: NextRequest) {
  try {
    const month = request.nextUrl.searchParams.get("month");
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ success: false, error: "month (YYYY-MM) is required" }, { status: 400 });
    }

    const connection = await pool.getConnection();
    try {
      const [rows]: any = await connection.query(
        `SELECT employee_id, month, ctd, fuel_allowance
         FROM monthly_payroll_adjustments
         WHERE month = ?
         ORDER BY employee_id ASC`,
        [month]
      );
      return NextResponse.json({ success: true, adjustments: rows || [] });
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error("monthly-payroll-adjustments GET:", error);
    return NextResponse.json({ success: false, error: "Failed to load adjustments" }, { status: 500 });
  }
}

/**
 * PUT { employee_id, month, ctd?, fuel_allowance? }
 * Upserts; only provided fields are overwritten (others kept).
 * fuel_allowance NULL in DB = not set (UI default applies).
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const employeeId = String(body.employee_id ?? "").trim();
    const month = String(body.month ?? "").trim();
    const hasCtd = Object.prototype.hasOwnProperty.call(body, "ctd");
    const hasFuel = Object.prototype.hasOwnProperty.call(body, "fuel_allowance");

    if (!employeeId || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json(
        { success: false, error: "employee_id and month (YYYY-MM) are required" },
        { status: 400 }
      );
    }
    if (!hasCtd && !hasFuel) {
      return NextResponse.json(
        { success: false, error: "Provide ctd and/or fuel_allowance" },
        { status: 400 }
      );
    }

    const connection = await pool.getConnection();
    try {
      const [existingRows]: any = await connection.query(
        `SELECT ctd, fuel_allowance FROM monthly_payroll_adjustments
         WHERE employee_id = ? AND month = ? LIMIT 1`,
        [employeeId, month]
      );
      const existing = existingRows?.[0];
      const ctd = hasCtd
        ? parseMoney(body.ctd)
        : parseMoney(existing?.ctd);
      const fuelAllowance = hasFuel
        ? parseMoney(body.fuel_allowance)
        : existing
          ? existing.fuel_allowance
          : null;

      await connection.query(
        `INSERT INTO monthly_payroll_adjustments (employee_id, month, ctd, fuel_allowance)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           ctd = VALUES(ctd),
           fuel_allowance = VALUES(fuel_allowance)`,
        [employeeId, month, ctd, fuelAllowance]
      );
      return NextResponse.json({
        success: true,
        employee_id: employeeId,
        month,
        ctd,
        fuel_allowance: fuelAllowance,
      });
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error("monthly-payroll-adjustments PUT:", error);
    return NextResponse.json({ success: false, error: "Failed to save adjustment" }, { status: 500 });
  }
}
