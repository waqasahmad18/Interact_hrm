import { query } from "@/lib/db";

export type AdvanceRow = {
  id: number;
  employee_id: number;
  payroll_month: string;
  amount: number;
  status: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type LoanInstallmentRow = {
  id: number;
  loan_id: number;
  installment_no: number;
  due_month: string;
  original_amount: number;
  payable_amount: number;
  paid_amount: number;
  status: string;
  paid_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type LoanRow = {
  id: number;
  employee_id: number;
  principal: number;
  installment_count: number;
  start_month: string;
  status: string;
  notes: string | null;
  issued_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  installments?: LoanInstallmentRow[];
  remaining_amount?: number;
  paid_total?: number;
};

function asRows<T>(result: any): T[] {
  if (Array.isArray(result) && Array.isArray(result[0])) return result[0] as T[];
  if (Array.isArray(result)) return result as T[];
  return [];
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function fetchAdvances(opts: {
  employeeId?: number;
  year?: string;
  monthFrom?: string;
  monthTo?: string;
}): Promise<AdvanceRow[]> {
  const where: string[] = ["status <> 'cancelled'"];
  const params: any[] = [];

  if (opts.employeeId != null) {
    where.push("employee_id = ?");
    params.push(opts.employeeId);
  }
  if (opts.year) {
    where.push("LEFT(payroll_month, 4) = ?");
    params.push(opts.year);
  }
  if (opts.monthFrom) {
    where.push("payroll_month >= ?");
    params.push(opts.monthFrom);
  }
  if (opts.monthTo) {
    where.push("payroll_month <= ?");
    params.push(opts.monthTo);
  }

  const [result]: any = await query(
    `SELECT id, employee_id, payroll_month, amount, status, notes, created_by, created_at, updated_at
     FROM employee_advances
     WHERE ${where.join(" AND ")}
     ORDER BY payroll_month DESC, id DESC`,
    params,
  );
  return asRows<AdvanceRow>(result);
}

export async function fetchLoansWithInstallments(opts: {
  employeeId?: number;
  year?: string;
  loanId?: number;
}): Promise<LoanRow[]> {
  const where: string[] = ["1=1"];
  const params: any[] = [];

  if (opts.loanId != null) {
    where.push("id = ?");
    params.push(opts.loanId);
  }
  if (opts.employeeId != null) {
    where.push("employee_id = ?");
    params.push(opts.employeeId);
  }
  if (opts.year) {
    // Loans issued in year OR having any installment due in year
    where.push(`(
      LEFT(start_month, 4) = ?
      OR id IN (
        SELECT loan_id FROM employee_loan_installments WHERE LEFT(due_month, 4) = ?
      )
    )`);
    params.push(opts.year, opts.year);
  }

  const [loanResult]: any = await query(
    `SELECT id, employee_id, principal, installment_count, start_month, status, notes,
            issued_at, created_by, created_at, updated_at
     FROM employee_loans
     WHERE ${where.join(" AND ")}
     ORDER BY start_month DESC, id DESC`,
    params,
  );
  const loans = asRows<LoanRow>(loanResult);
  if (loans.length === 0) return [];

  const ids = loans.map((l) => l.id);
  const placeholders = ids.map(() => "?").join(",");
  const [instResult]: any = await query(
    `SELECT id, loan_id, installment_no, due_month, original_amount, payable_amount,
            paid_amount, status, paid_at, notes, created_at, updated_at
     FROM employee_loan_installments
     WHERE loan_id IN (${placeholders})
     ORDER BY loan_id, installment_no ASC`,
    ids,
  );
  const installments = asRows<LoanInstallmentRow>(instResult);
  const byLoan = new Map<number, LoanInstallmentRow[]>();
  for (const row of installments) {
    const list = byLoan.get(row.loan_id) || [];
    list.push(row);
    byLoan.set(row.loan_id, list);
  }

  return loans.map((loan) => {
    const inst = byLoan.get(loan.id) || [];
    const paidTotal = inst.reduce((s, r) => s + num(r.paid_amount), 0);
    const remaining = inst.reduce((s, r) => {
      const due = Math.max(0, num(r.payable_amount) - num(r.paid_amount));
      return s + (String(r.status).toLowerCase() === "paid" ? 0 : due);
    }, 0);
    return {
      ...loan,
      principal: num(loan.principal),
      installment_count: num(loan.installment_count),
      installments: inst.map((r) => ({
        ...r,
        original_amount: num(r.original_amount),
        payable_amount: num(r.payable_amount),
        paid_amount: num(r.paid_amount),
      })),
      paid_total: paidTotal,
      remaining_amount: remaining,
    };
  });
}

export function buildYearOverview(advances: AdvanceRow[], loans: LoanRow[], year: string) {
  const advanceActive = advances.filter((a) => String(a.status).toLowerCase() !== "cancelled");
  const advancesTakenCount = advanceActive.length;
  const advancesTakenTotal = advanceActive.reduce((s, a) => s + num(a.amount), 0);

  const loansIssued = loans.filter((l) => String(l.start_month || "").startsWith(year));
  const loansTakenCount = loansIssued.length;
  const loansTakenPrincipal = loansIssued.reduce((s, l) => s + num(l.principal), 0);

  let recoveredThisYear = 0;
  let activeRemaining = 0;
  for (const loan of loans) {
    activeRemaining += num(loan.remaining_amount);
    for (const inst of loan.installments || []) {
      if (String(inst.due_month || "").startsWith(year)) {
        recoveredThisYear += num(inst.paid_amount);
      }
    }
  }

  return {
    year,
    advances_taken_count: advancesTakenCount,
    advances_taken_total: advancesTakenTotal,
    loans_taken_count: loansTakenCount,
    loans_taken_principal: loansTakenPrincipal,
    recoveries_this_year: recoveredThisYear,
    active_loan_remaining: activeRemaining,
  };
}

/** Best-effort dual-write so History stays current while old pages still write legacy tables. */
export async function syncAdvanceLedger(opts: {
  employeeId: number | string;
  payrollMonth: string;
  amount: number | null;
  clear?: boolean;
}) {
  try {
    if (opts.clear || opts.amount == null) {
      await query(
        `DELETE FROM employee_advances WHERE employee_id = ? AND payroll_month = ?`,
        [opts.employeeId, opts.payrollMonth],
      );
      return;
    }
    const [existing]: any = await query(
      `SELECT id FROM employee_advances
       WHERE employee_id = ? AND payroll_month = ? AND status <> 'cancelled'
       ORDER BY id DESC LIMIT 1`,
      [opts.employeeId, opts.payrollMonth],
    );
    const rows = asRows<{ id: number }>(existing);
    if (rows.length > 0) {
      await query(
        `UPDATE employee_advances SET amount = ?, status = 'active', updated_at = NOW() WHERE id = ?`,
        [opts.amount, rows[0].id],
      );
      await query(
        `DELETE FROM employee_advances
         WHERE employee_id = ? AND payroll_month = ? AND id <> ?`,
        [opts.employeeId, opts.payrollMonth, rows[0].id],
      );
      return;
    }
    await query(
      `INSERT INTO employee_advances (employee_id, payroll_month, amount, status, notes, created_at, updated_at)
       VALUES (?, ?, ?, 'active', 'Synced from advance page', NOW(), NOW())`,
      [opts.employeeId, opts.payrollMonth, opts.amount],
    );
  } catch {
    // Table may not exist until migration runs; never block legacy save.
  }
}

export async function syncNewLoanFromLegacy(opts: {
  employeeId: number | string;
  principal: number;
  installmentCount: number;
  startMonth: string;
  perMonth: number;
}) {
  try {
    const [result]: any = await query(
      `INSERT INTO employee_loans
         (employee_id, principal, installment_count, start_month, status, notes, issued_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'active', 'Synced from loan page', NOW(), NOW(), NOW())`,
      [opts.employeeId, opts.principal, opts.installmentCount, opts.startMonth],
    );
    const loanId = result?.insertId;
    if (!loanId) return;

    const [y, m] = opts.startMonth.split("-").map(Number);
    for (let i = 0; i < opts.installmentCount; i++) {
      const d = new Date(y, m - 1 + i, 1);
      const dueMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      await query(
        `INSERT INTO employee_loan_installments
           (loan_id, installment_no, due_month, original_amount, payable_amount, paid_amount, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 0, 'pending', NOW(), NOW())`,
        [loanId, i + 1, dueMonth, opts.perMonth, opts.perMonth],
      );
    }
  } catch {
    // ignore until migration applied
  }
}

export async function syncLoanInstallmentFromLegacy(opts: {
  employeeId: number | string;
  month: string;
  payable?: number | null;
  status?: string | null;
  paidAmount?: number | null;
}) {
  try {
    const [rows]: any = await query(
      `SELECT i.id, i.loan_id
       FROM employee_loan_installments i
       INNER JOIN employee_loans l ON l.id = i.loan_id
       WHERE l.employee_id = ? AND i.due_month = ?
       ORDER BY i.id DESC LIMIT 1`,
      [opts.employeeId, opts.month],
    );
    const list = asRows<{ id: number; loan_id: number }>(rows);
    if (list.length === 0) return;

    const updates: string[] = [];
    const params: any[] = [];
    if (opts.payable != null && Number.isFinite(Number(opts.payable))) {
      updates.push("payable_amount = ?");
      params.push(Number(opts.payable));
    }
    if (opts.status) {
      updates.push("status = ?");
      params.push(opts.status);
      if (opts.status === "paid") {
        updates.push("paid_at = NOW()");
        if (opts.paidAmount != null) {
          updates.push("paid_amount = ?");
          params.push(Number(opts.paidAmount));
        }
      } else {
        updates.push("paid_at = NULL");
        updates.push("paid_amount = 0");
      }
    } else if (opts.paidAmount != null) {
      updates.push("paid_amount = ?");
      params.push(Number(opts.paidAmount));
    }
    if (updates.length === 0) return;
    params.push(list[0].id);
    await query(
      `UPDATE employee_loan_installments SET ${updates.join(", ")}, updated_at = NOW() WHERE id = ?`,
      params,
    );

    // Close loan when no pending installments remain
    const [pending]: any = await query(
      `SELECT COUNT(*) AS c FROM employee_loan_installments
       WHERE loan_id = ? AND LOWER(status) = 'pending'`,
      [list[0].loan_id],
    );
    const pendingCount = num(asRows<{ c: number }>(pending)[0]?.c);
    if (pendingCount === 0) {
      await query(
        `UPDATE employee_loans SET status = 'closed', updated_at = NOW() WHERE id = ?`,
        [list[0].loan_id],
      );
    }
  } catch {
    // ignore
  }
}

function nextYm(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Pull missing rows from legacy advance_salary / loan_installments into the
 * history tables so Financial History stays complete even if dual-write missed.
 */
export async function reconcileLegacyFinancialHistory(): Promise<void> {
  try {
    // --- Advances ---
    const [legacyAdv]: any = await query(
      `SELECT employee_id, DATE_FORMAT(created_at, '%Y-%m') AS payroll_month,
              advance_amount, created_at, updated_at
       FROM advance_salary
       WHERE employee_id IS NOT NULL AND advance_amount IS NOT NULL
       ORDER BY created_at ASC, id ASC`,
    );
    const advances = asRows<{
      employee_id: number;
      payroll_month: string;
      advance_amount: number;
      created_at: string;
      updated_at: string;
    }>(legacyAdv);

    for (const a of advances) {
      const month = String(a.payroll_month || "").slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(month)) continue;
      const [exists]: any = await query(
        `SELECT id FROM employee_advances
         WHERE employee_id = ? AND payroll_month = ? AND status <> 'cancelled'
         LIMIT 1`,
        [a.employee_id, month],
      );
      if (asRows(exists).length > 0) continue;
      await query(
        `INSERT INTO employee_advances
           (employee_id, payroll_month, amount, status, notes, created_at, updated_at)
         VALUES (?, ?, ?, 'active', 'Reconciled from advance_salary', ?, ?)`,
        [
          a.employee_id,
          month,
          num(a.advance_amount),
          a.created_at || new Date(),
          a.updated_at || a.created_at || new Date(),
        ],
      );
    }

    // --- Loans: consecutive month blocks per employee ---
    const [legacyLoans]: any = await query(
      `SELECT employee_id, month, original_amount, paid_amount,
              COALESCE(payable_this_month, original_amount) AS payable_this_month,
              status, created_at, updated_at
       FROM loan_installments
       WHERE employee_id IS NOT NULL AND month IS NOT NULL
       ORDER BY employee_id ASC, month ASC, created_at ASC`,
    );
    const loanRows = asRows<{
      employee_id: number;
      month: string;
      original_amount: number;
      paid_amount: number;
      payable_this_month: number;
      status: string;
      created_at: string;
      updated_at: string;
    }>(legacyLoans);

    const byEmp = new Map<number, typeof loanRows>();
    for (const row of loanRows) {
      const id = Number(row.employee_id);
      const list = byEmp.get(id) || [];
      list.push(row);
      byEmp.set(id, list);
    }

    for (const [employeeId, rows] of byEmp) {
      // Skip if every legacy month already exists in new installment table
      const months = rows.map((r) => String(r.month).slice(0, 7));
      const placeholders = months.map(() => "?").join(",");
      const [existingInst]: any = await query(
        `SELECT i.due_month
         FROM employee_loan_installments i
         INNER JOIN employee_loans l ON l.id = i.loan_id
         WHERE l.employee_id = ? AND i.due_month IN (${placeholders})`,
        [employeeId, ...months],
      );
      const have = new Set(asRows<{ due_month: string }>(existingInst).map((r) => r.due_month));
      const missing = rows.filter((r) => !have.has(String(r.month).slice(0, 7)));
      if (missing.length === 0) continue;

      // Split missing into consecutive blocks
      const sorted = [...missing].sort((a, b) => String(a.month).localeCompare(String(b.month)));
      const blocks: (typeof sorted)[] = [];
      let current: typeof sorted = [];
      for (const row of sorted) {
        if (current.length === 0) {
          current = [row];
          continue;
        }
        const prev = String(current[current.length - 1].month).slice(0, 7);
        const cur = String(row.month).slice(0, 7);
        if (cur === nextYm(prev)) current.push(row);
        else {
          blocks.push(current);
          current = [row];
        }
      }
      if (current.length) blocks.push(current);

      for (const block of blocks) {
        const principal = block.reduce((s, r) => s + num(r.original_amount), 0);
        const startMonth = String(block[0].month).slice(0, 7);
        const anyPending = block.some(
          (r) => String(r.status || "pending").toLowerCase() === "pending",
        );
        const [ins]: any = await query(
          `INSERT INTO employee_loans
             (employee_id, principal, installment_count, start_month, status, notes, issued_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'Reconciled from loan_installments', ?, ?, ?)`,
          [
            employeeId,
            principal,
            block.length,
            startMonth,
            anyPending ? "active" : "closed",
            block[0].created_at || new Date(),
            block[0].created_at || new Date(),
            block[block.length - 1].updated_at || block[block.length - 1].created_at || new Date(),
          ],
        );
        const loanId = ins?.insertId;
        if (!loanId) continue;

        for (let i = 0; i < block.length; i++) {
          const r = block[i];
          const st = String(r.status || "pending").toLowerCase();
          const payable = num(r.payable_this_month ?? r.original_amount);
          const paidAmt = st === "paid" ? num(r.paid_amount) || payable : num(r.paid_amount);
          await query(
            `INSERT INTO employee_loan_installments
               (loan_id, installment_no, due_month, original_amount, payable_amount, paid_amount, status, paid_at, notes, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Reconciled from loan_installments', ?, ?)`,
            [
              loanId,
              i + 1,
              String(r.month).slice(0, 7),
              num(r.original_amount),
              payable,
              paidAmt,
              st || "pending",
              st === "paid" ? r.updated_at || r.created_at || new Date() : null,
              r.created_at || new Date(),
              r.updated_at || r.created_at || new Date(),
            ],
          );
        }
      }
    }
  } catch {
    // Tables may not exist yet — history GET should still respond.
  }
}

/** Mark advance + loan installment for an employee/month as paid (legacy + history). */
export async function markMonthDeductionsPaid(
  employeeId: number | string,
  month: string,
): Promise<{ advance: boolean; loan: boolean }> {
  let advance = false;
  let loan = false;
  if (!employeeId || !/^\d{4}-\d{2}$/.test(month)) return { advance, loan };

  try {
    const [advRows]: any = await query(
      `SELECT id, amount FROM employee_advances
       WHERE employee_id = ? AND payroll_month = ? AND LOWER(status) NOT IN ('paid','cancelled')
       ORDER BY id DESC LIMIT 1`,
      [employeeId, month],
    );
    const adv = asRows<{ id: number; amount: number }>(advRows);
    if (adv.length > 0) {
      await query(
        `UPDATE employee_advances
         SET status = 'paid', notes = COALESCE(notes, 'Marked paid from payroll'), updated_at = NOW()
         WHERE id = ?`,
        [adv[0].id],
      );
      advance = true;
    } else {
      // Ensure ledger row exists from legacy then mark paid
      const [legacy]: any = await query(
        `SELECT advance_amount FROM advance_salary
         WHERE employee_id = ? AND DATE_FORMAT(created_at, '%Y-%m') = ?
         ORDER BY id DESC LIMIT 1`,
        [employeeId, month],
      );
      const leg = asRows<{ advance_amount: number }>(legacy);
      if (leg.length > 0 && num(leg[0].advance_amount) > 0) {
        await syncAdvanceLedger({
          employeeId,
          payrollMonth: month,
          amount: num(leg[0].advance_amount),
        });
        await query(
          `UPDATE employee_advances
           SET status = 'paid', updated_at = NOW()
           WHERE employee_id = ? AND payroll_month = ? AND LOWER(status) <> 'cancelled'`,
          [employeeId, month],
        );
        advance = true;
      }
    }
  } catch {
    /* ignore */
  }

  try {
    const [li]: any = await query(
      `SELECT original_amount, payable_this_month, paid_amount, status
       FROM loan_installments WHERE employee_id = ? AND month = ? LIMIT 1`,
      [employeeId, month],
    );
    const rows = asRows<{
      original_amount: number;
      payable_this_month: number;
      paid_amount: number;
      status: string;
    }>(li);
    if (rows.length > 0) {
      const payable = num(rows[0].payable_this_month ?? rows[0].original_amount);
      await query(
        `UPDATE loan_installments
         SET status = 'paid', paid_amount = ?, updated_at = NOW()
         WHERE employee_id = ? AND month = ?`,
        [payable, employeeId, month],
      );
      await syncLoanInstallmentFromLegacy({
        employeeId,
        month,
        payable,
        status: "paid",
        paidAmount: payable,
      });
      // If history installment missing, reconcile then mark
      await reconcileLegacyFinancialHistory();
      await syncLoanInstallmentFromLegacy({
        employeeId,
        month,
        payable,
        status: "paid",
        paidAmount: payable,
      });
      loan = true;
    }
  } catch {
    /* ignore */
  }

  return { advance, loan };
}

export async function markMonthDeductionsPaidForAll(month: string): Promise<number> {
  if (!/^\d{4}-\d{2}$/.test(month)) return 0;
  const ids = new Set<number>();
  try {
    const [a]: any = await query(
      `SELECT DISTINCT employee_id FROM advance_salary WHERE DATE_FORMAT(created_at, '%Y-%m') = ?`,
      [month],
    );
    for (const r of asRows<{ employee_id: number }>(a)) ids.add(Number(r.employee_id));
  } catch {
    /* ignore */
  }
  try {
    const [b]: any = await query(
      `SELECT DISTINCT employee_id FROM loan_installments WHERE month = ?`,
      [month],
    );
    for (const r of asRows<{ employee_id: number }>(b)) ids.add(Number(r.employee_id));
  } catch {
    /* ignore */
  }
  try {
    const [c]: any = await query(
      `SELECT DISTINCT employee_id FROM employee_advances WHERE payroll_month = ?`,
      [month],
    );
    for (const r of asRows<{ employee_id: number }>(c)) ids.add(Number(r.employee_id));
  } catch {
    /* ignore */
  }

  let n = 0;
  for (const id of ids) {
    const res = await markMonthDeductionsPaid(id, month);
    if (res.advance || res.loan) n += 1;
  }
  return n;
}

export async function fetchEmployeeActivitySummary(year: string) {
  const [advResult]: any = await query(
    `SELECT employee_id,
            COUNT(*) AS advance_count,
            COALESCE(SUM(amount), 0) AS advance_total
     FROM employee_advances
     WHERE LEFT(payroll_month, 4) = ? AND status <> 'cancelled'
     GROUP BY employee_id`,
    [year],
  );
  const [loanResult]: any = await query(
    `SELECT employee_id,
            COUNT(*) AS loan_count,
            COALESCE(SUM(principal), 0) AS loan_principal
     FROM employee_loans
     WHERE LEFT(start_month, 4) = ?
        OR id IN (
          SELECT loan_id FROM employee_loan_installments WHERE LEFT(due_month, 4) = ?
        )
     GROUP BY employee_id`,
    [year, year],
  );

  const advRows = asRows<{ employee_id: number; advance_count: number; advance_total: number }>(
    advResult,
  );
  const loanRows = asRows<{ employee_id: number; loan_count: number; loan_principal: number }>(
    loanResult,
  );

  const map = new Map<
    number,
    {
      employee_id: number;
      advance_count: number;
      advance_total: number;
      loan_count: number;
      loan_principal: number;
    }
  >();

  for (const r of advRows) {
    map.set(Number(r.employee_id), {
      employee_id: Number(r.employee_id),
      advance_count: num(r.advance_count),
      advance_total: num(r.advance_total),
      loan_count: 0,
      loan_principal: 0,
    });
  }
  for (const r of loanRows) {
    const id = Number(r.employee_id);
    const cur = map.get(id) || {
      employee_id: id,
      advance_count: 0,
      advance_total: 0,
      loan_count: 0,
      loan_principal: 0,
    };
    cur.loan_count = num(r.loan_count);
    cur.loan_principal = num(r.loan_principal);
    map.set(id, cur);
  }

  return Array.from(map.values()).sort((a, b) => a.employee_id - b.employee_id);
}
