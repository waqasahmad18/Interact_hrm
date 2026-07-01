import { NextRequest, NextResponse } from "next/server";
import { pool, query } from "@/lib/db";
import {
  ensureFinancialRequestsTable,
  broadcastFinancialRequestUpdate,
  FINANCIAL_REQUESTS_TABLE,
} from "@/lib/financial-requests-table";
import {
  employeeInitials,
  loadEmployeePhotoMaps,
  resolveEmployeePhoto,
} from "@/lib/employee-photo";

function nextMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

async function enrichWithPhotos<T extends { employee_id: string }>(rows: T[]) {
  const maps = await loadEmployeePhotoMaps();
  return rows.map((row) => ({
    ...row,
    photo: resolveEmployeePhoto(row.employee_id, maps.employeePhotos, maps.shellAvatars),
    initials: employeeInitials((row as { employee_name?: string }).employee_name || "Employee"),
  }));
}

async function fetchEmployeePayrollMeta(employeeId: string) {
  const [rows]: any = await query(
    `SELECT e.id, e.pseudonym, d.name AS department_name,
            TRIM(CONCAT(COALESCE(e.first_name,''), ' ', COALESCE(e.last_name,''))) AS employee_name
     FROM hrm_employees e
     LEFT JOIN departments d ON e.department_id = d.id
     WHERE CAST(e.id AS CHAR) = ? OR e.employee_code = ?
     LIMIT 1`,
    [employeeId, employeeId]
  );
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

async function createLoanInstallments(
  employeeId: string,
  loanAmount: number,
  installments: number,
  startMonth: string
) {
  const perMonth = Math.round((loanAmount / installments) * 100) / 100;
  const [y, m] = startMonth.split("-").map(Number);
  for (let i = 0; i < installments; i++) {
    const d = new Date(y, m - 1 + i, 1);
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    await pool.query(
      `INSERT INTO loan_installments
       (employee_id, month, original_amount, paid_amount, payable_this_month, status, created_at, updated_at)
       VALUES (?, ?, ?, 0, ?, 'pending', NOW(), NOW())`,
      [employeeId, month, perMonth, perMonth]
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    await ensureFinancialRequestsTable();
    const { searchParams } = new URL(req.url);
    const employeeId = searchParams.get("employeeId");
    const status = searchParams.get("status");
    const requestType = searchParams.get("requestType");

    let sql = `SELECT * FROM ${FINANCIAL_REQUESTS_TABLE} WHERE 1=1`;
    const params: (string | number)[] = [];

    if (employeeId) {
      sql += " AND employee_id = ?";
      params.push(employeeId);
    }
    if (status) {
      sql += " AND status = ?";
      params.push(status);
    }
    if (requestType) {
      sql += " AND request_type = ?";
      params.push(requestType);
    }

    sql += " ORDER BY requested_at DESC";
    const [rows]: any = await query(sql, params);
    const list = Array.isArray(rows) ? rows : [];
    const requests = await enrichWithPhotos(list);
    return NextResponse.json({ success: true, requests });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureFinancialRequestsTable();
    const body = await req.json();
    const {
      employee_id,
      employee_name,
      request_type,
      amount,
      installments,
      start_month,
      reason,
    } = body;

    if (!employee_id || !request_type || !amount) {
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 });
    }
    if (!["advance", "loan"].includes(request_type)) {
      return NextResponse.json({ success: false, error: "Invalid request type" }, { status: 400 });
    }
    const parsedAmount = parseFloat(String(amount));
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return NextResponse.json({ success: false, error: "Invalid amount" }, { status: 400 });
    }
    if (request_type === "loan") {
      const n = parseInt(String(installments), 10);
      if (isNaN(n) || n < 1) {
        return NextResponse.json({ success: false, error: "Installments required for loan" }, { status: 400 });
      }
      if (!start_month || !/^\d{4}-\d{2}$/.test(start_month)) {
        return NextResponse.json({ success: false, error: "Valid start month (YYYY-MM) required" }, { status: 400 });
      }
    }

    await query(
      `INSERT INTO ${FINANCIAL_REQUESTS_TABLE}
       (employee_id, employee_name, request_type, amount, installments, start_month, reason, status, requested_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', NOW(), NOW())`,
      [
        String(employee_id),
        employee_name || "Employee",
        request_type,
        parsedAmount,
        request_type === "loan" ? parseInt(String(installments), 10) : null,
        request_type === "loan" ? start_month : null,
        reason || "",
      ]
    );

    broadcastFinancialRequestUpdate();
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await ensureFinancialRequestsTable();
    const { id, status, admin_remark } = await req.json();
    if (!id || !["approved", "rejected"].includes(status)) {
      return NextResponse.json({ success: false, error: "Invalid data" }, { status: 400 });
    }

    const [existingRows]: any = await query(
      `SELECT * FROM ${FINANCIAL_REQUESTS_TABLE} WHERE id = ? LIMIT 1`,
      [id]
    );
    const existing = Array.isArray(existingRows) ? existingRows[0] : null;
    if (!existing) {
      return NextResponse.json({ success: false, error: "Request not found" }, { status: 404 });
    }
    if (existing.status !== "pending") {
      return NextResponse.json({ success: false, error: "Request already processed" }, { status: 400 });
    }

    if (status === "approved") {
      const meta = await fetchEmployeePayrollMeta(String(existing.employee_id));
      if (existing.request_type === "advance") {
        const month = new Date().toISOString().slice(0, 7);
        await query(
          `INSERT INTO advance_salary (employee_id, employee_name, pseudonym, department, advance_amount, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
          [
            String(existing.employee_id),
            existing.employee_name || meta?.employee_name || "Employee",
            meta?.pseudonym || null,
            meta?.department_name || "—",
            existing.amount,
          ]
        );
      } else if (existing.request_type === "loan") {
        const installments = Number(existing.installments) || 1;
        const startMonth = existing.start_month || nextMonth(new Date().toISOString().slice(0, 7));
        await createLoanInstallments(
          String(existing.employee_id),
          parseFloat(String(existing.amount)),
          installments,
          startMonth
        );
      }
    }

    await query(
      `UPDATE ${FINANCIAL_REQUESTS_TABLE}
       SET status = ?, admin_remark = ?, updated_at = NOW()
       WHERE id = ?`,
      [status, admin_remark || "", id]
    );

    broadcastFinancialRequestUpdate();
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
