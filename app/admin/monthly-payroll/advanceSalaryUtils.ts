/**
 * Unpaid advance amount per employee for a payroll month.
 * Merges advance_salary + employee_advances; skips only paid/cancelled.
 */
export async function fetchAdvanceSalary(month: string) {
  const map: Record<string, number> = {};
  if (!month) return map;

  try {
    const response = await fetch(`/api/advance-salary?month=${encodeURIComponent(month)}`, {
      cache: "no-store",
    });
    const data = await response.json();
    if (data.success && Array.isArray(data.records)) {
      for (const row of data.records) {
        const key = String(row.employee_id ?? "").trim();
        if (!key) continue;
        const status = String(row.status || "active").toLowerCase();
        if (status === "paid" || status === "cancelled") continue;
        const amt = Number(row.advance_amount);
        if (!Number.isFinite(amt) || amt <= 0) continue;
        map[key] = Math.max(map[key] || 0, amt);
      }
    }
  } catch {
    /* ignore */
  }

  // Extra safety: ledger by payroll_month (even if created_at month mismatched)
  try {
    const histRes = await fetch(
      `/api/employee-financial-history/advances?month_from=${encodeURIComponent(month)}&month_to=${encodeURIComponent(month)}`,
      { cache: "no-store" },
    );
    const hist = await histRes.json();
    if (hist?.success && Array.isArray(hist.records)) {
      for (const row of hist.records) {
        const key = String(row.employee_id ?? "").trim();
        if (!key) continue;
        const status = String(row.status || "active").toLowerCase();
        if (status === "paid" || status === "cancelled") continue;
        const amt = Number(row.amount);
        if (!Number.isFinite(amt) || amt <= 0) continue;
        map[key] = Math.max(map[key] || 0, amt);
      }
    }
  } catch {
    /* ignore */
  }

  return map;
}
