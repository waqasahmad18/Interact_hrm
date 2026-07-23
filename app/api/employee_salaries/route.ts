import { NextRequest, NextResponse } from "next/server";
import { pool } from "../../../lib/db";

function parseAmount(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function salaryFields(body: any) {
  return {
    employee_id: body.employee_id ?? body.employeeId,
    component: body.component ?? null,
    payGrade: body.payGrade ?? body.pay_grade ?? null,
    payFrequency: body.payFrequency ?? body.pay_frequency ?? null,
    currency: body.currency ?? null,
    amount: parseAmount(body.amount),
    comments: body.comments ?? null,
    directDeposit: (body.directDeposit ?? body.direct_deposit) ? 1 : 0,
    accountNumber: body.accountNumber ?? body.account_number ?? null,
    accountType: body.accountType ?? body.account_type ?? null,
    routingNumber: body.routingNumber ?? body.routing_number ?? null,
    depositAmount: parseAmount(body.depositAmount ?? body.deposit_amount),
  };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const employeeId = searchParams.get("employeeId");
    if (!employeeId) {
      return NextResponse.json({ success: false, error: "employeeId is required" }, { status: 400 });
    }
    const [rows]: any = await pool.execute(
      "SELECT * FROM employee_salaries WHERE employee_id = ? ORDER BY id DESC LIMIT 1",
      [employeeId]
    );
    if (rows && rows.length > 0) {
      return NextResponse.json({ success: true, salary: rows[0] });
    }
    return NextResponse.json({ success: false, error: "Salary not found" });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

/** Update existing salary row, or insert if employee has none yet. */
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    // Support nested payload from older salary page: { details: { employeeId, salary } }
    const nested = body?.details?.salary
      ? { employee_id: body.details.employeeId ?? body.details.employee_id, ...body.details.salary }
      : body;
    const f = salaryFields(nested);
    if (!f.employee_id) {
      return NextResponse.json({ success: false, error: "employee_id is required" }, { status: 400 });
    }

    const [existing]: any = await pool.execute(
      "SELECT id FROM employee_salaries WHERE employee_id = ? ORDER BY id DESC LIMIT 1",
      [f.employee_id]
    );

    if (existing && existing.length > 0) {
      await pool.execute(
        `UPDATE employee_salaries SET
           component = ?, pay_grade = ?, pay_frequency = ?, currency = ?, amount = ?, comments = ?,
           direct_deposit = ?, account_number = ?, account_type = ?, routing_number = ?, deposit_amount = ?
         WHERE id = ?`,
        [
          f.component,
          f.payGrade,
          f.payFrequency,
          f.currency,
          f.amount,
          f.comments,
          f.directDeposit,
          f.accountNumber,
          f.accountType,
          f.routingNumber,
          f.depositAmount,
          existing[0].id,
        ]
      );
    } else {
      await pool.execute(
        `INSERT INTO employee_salaries
           (employee_id, component, pay_grade, pay_frequency, currency, amount, comments,
            direct_deposit, account_number, account_type, routing_number, deposit_amount)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          f.employee_id,
          f.component,
          f.payGrade,
          f.payFrequency,
          f.currency,
          f.amount,
          f.comments,
          f.directDeposit,
          f.accountNumber,
          f.accountType,
          f.routingNumber,
          f.depositAmount,
        ]
      );
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const nested = body?.details?.salary
      ? { employee_id: body.details.employeeId ?? body.details.employee_id, ...body.details.salary }
      : body;
    const f = salaryFields(nested);
    if (!f.employee_id) {
      return NextResponse.json({ success: false, error: "employee_id is required" }, { status: 400 });
    }

    // Prefer upsert so re-save / edit-without-row both work
    const [existing]: any = await pool.execute(
      "SELECT id FROM employee_salaries WHERE employee_id = ? ORDER BY id DESC LIMIT 1",
      [f.employee_id]
    );

    if (existing && existing.length > 0) {
      await pool.execute(
        `UPDATE employee_salaries SET
           component = ?, pay_grade = ?, pay_frequency = ?, currency = ?, amount = ?, comments = ?,
           direct_deposit = ?, account_number = ?, account_type = ?, routing_number = ?, deposit_amount = ?
         WHERE id = ?`,
        [
          f.component,
          f.payGrade,
          f.payFrequency,
          f.currency,
          f.amount,
          f.comments,
          f.directDeposit,
          f.accountNumber,
          f.accountType,
          f.routingNumber,
          f.depositAmount,
          existing[0].id,
        ]
      );
    } else {
      await pool.execute(
        `INSERT INTO employee_salaries
           (employee_id, component, pay_grade, pay_frequency, currency, amount, comments,
            direct_deposit, account_number, account_type, routing_number, deposit_amount)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          f.employee_id,
          f.component,
          f.payGrade,
          f.payFrequency,
          f.currency,
          f.amount,
          f.comments,
          f.directDeposit,
          f.accountNumber,
          f.accountType,
          f.routingNumber,
          f.depositAmount,
        ]
      );
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
