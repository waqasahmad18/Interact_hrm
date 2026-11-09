// Utility to fetch advance salary for employees for a given month
export async function fetchAdvanceSalary(month: string) {
  const response = await fetch(`/api/advance-salary?month=${month}`, { cache: "no-store" });
  const data = await response.json();
  if (!data.success || !Array.isArray(data.records)) return {};

  // Map employee_id to advance_amount
  const map: Record<string, number> = {};
  data.records.forEach((row: any) => {
    if (row.employee_id && row.advance_amount !== undefined) {
      const key = String(row.employee_id);
      if (map[key] === undefined) map[key] = Number(row.advance_amount);
    }
  });

  // Exclude advances already marked paid in Financial History ledger
  try {
    const histRes = await fetch(
      `/api/employee-financial-history/advances?month_from=${encodeURIComponent(month)}&month_to=${encodeURIComponent(month)}`,
      { cache: "no-store" },
    );
    const hist = await histRes.json();
    if (hist?.success && Array.isArray(hist.records)) {
      for (const row of hist.records) {
        if (String(row.status || "").toLowerCase() === "paid") {
          delete map[String(row.employee_id)];
        }
      }
    }
  } catch {
    /* history table may be empty / missing */
  }

  return map;
}
