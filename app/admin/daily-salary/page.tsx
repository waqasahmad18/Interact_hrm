"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import LayoutDashboard from "../../layout-dashboard";
import styles from "../../break-summary/break-summary.module.css";
import { EmployeeTableNameCell } from "../../components/EmployeeTableNameCell";
import { useEmployeeDetailPopup } from "../../components/use-employee-detail-popup";
import { DAILY_SALARY_STATUS_OPTIONS } from "../../../lib/daily-salary-calc";
import { uiStatusTextColor } from "../../../lib/attendance-status";

type SummaryRow = {
  employee_id: string;
  employee_name: string;
  pseudonym: string;
  department_name: string;
  basic_salary: number;
  working_days: number;
  daily_rate: number;
  total_earned: number;
  total_deducted: number;
  unpaid_days: number;
  updated_at?: string | null;
};

type DayRow = {
  work_date: string;
  is_working_day: boolean;
  status_label: string;
  tardy_count: number | null;
  deduction_percent: number;
  daily_rate: number;
  deducted_amount: number;
  earned_amount: number;
  clock_in: string | null;
  clock_out: string | null;
  is_manual: boolean;
  notes: string | null;
};

function money(n: number) {
  return Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function defaultMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default function DailySalaryPage() {
  const { openFromRow, popup: employeeDetailPopup, getPhoto } = useEmployeeDetailPopup();
  const [selectedMonth, setSelectedMonth] = useState(defaultMonth);
  const [searchName, setSearchName] = useState("");
  const [selectedDepartment, setSelectedDepartment] = useState("");
  const [departments, setDepartments] = useState<any[]>([]);
  const [summaries, setSummaries] = useState<SummaryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [detail, setDetail] = useState<(SummaryRow & { days: DayRow[] }) | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [savingDate, setSavingDate] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/departments")
      .then((r) => r.json())
      .then((d) => {
        if (d.success || Array.isArray(d.departments)) {
          setDepartments(d.departments || d || []);
        }
      })
      .catch(() => {});
  }, []);

  const loadSummaries = useCallback(async () => {
    if (!selectedMonth) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/daily-salary?month=${encodeURIComponent(selectedMonth)}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed to load");
      setSummaries(data.summaries || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setSummaries([]);
    } finally {
      setLoading(false);
    }
  }, [selectedMonth]);

  useEffect(() => {
    void loadSummaries();
    setSelectedEmployeeId(null);
    setDetail(null);
  }, [loadSummaries]);

  const loadDetail = useCallback(
    async (employeeId: string) => {
      setDetailLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/daily-salary?month=${encodeURIComponent(selectedMonth)}&employee_id=${encodeURIComponent(employeeId)}`,
          { cache: "no-store" },
        );
        const data = await res.json();
        if (!data.success) throw new Error(data.error || "Failed to load detail");
        if (!data.summary) {
          setDetail(null);
          setMessage("No saved record yet — click Generate from Attendance.");
          return;
        }
        setDetail(data.summary);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load detail");
        setDetail(null);
      } finally {
        setDetailLoading(false);
      }
    },
    [selectedMonth],
  );

  const openEmployee = (employeeId: string) => {
    setSelectedEmployeeId(employeeId);
    void loadDetail(employeeId);
  };

  const generate = async (employeeId?: string | null) => {
    setGenerating(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/daily-salary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          month: selectedMonth,
          employee_id: employeeId || undefined,
          preserve_manual: true,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Generate failed");
      setMessage(
        employeeId
          ? `Recalculated daily salary for this employee (${data.count}).`
          : `Generated daily salary for ${data.count} employees. Manual edits kept.`,
      );
      await loadSummaries();
      if (employeeId || selectedEmployeeId) {
        await loadDetail(employeeId || selectedEmployeeId!);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generate failed");
    } finally {
      setGenerating(false);
    }
  };

  const saveDay = async (
    workDate: string,
    patch: {
      status_label?: string;
      deduction_percent?: number;
      money_override?: boolean;
      earned_amount?: number;
      deducted_amount?: number;
      notes?: string | null;
    },
  ) => {
    if (!selectedEmployeeId) return;
    setSavingDate(workDate);
    setError(null);
    try {
      const res = await fetch("/api/daily-salary", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee_id: selectedEmployeeId,
          month: selectedMonth,
          work_date: workDate,
          ...patch,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Save failed");
      setDetail(data.summary);
      setSummaries((prev) =>
        prev.map((s) =>
          s.employee_id === selectedEmployeeId
            ? {
                ...s,
                total_earned: data.summary.total_earned,
                total_deducted: data.summary.total_deducted,
                unpaid_days: data.summary.unpaid_days,
                daily_rate: data.summary.daily_rate,
                working_days: data.summary.working_days,
                basic_salary: data.summary.basic_salary,
              }
            : s,
        ),
      );
      setMessage("Day updated — month totals & payroll unpaid days synced.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavingDate(null);
    }
  };

  const filtered = useMemo(() => {
    const term = searchName.trim().toLowerCase();
    return summaries.filter((s) => {
      const matchesName =
        !term ||
        (s.employee_name || "").toLowerCase().includes(term) ||
        (s.pseudonym || "").toLowerCase().includes(term) ||
        String(s.employee_id).includes(term);
      const matchesDept =
        !selectedDepartment ||
        (s.department_name || "").toLowerCase() === selectedDepartment.toLowerCase();
      return matchesName && matchesDept;
    });
  }, [summaries, searchName, selectedDepartment]);

  return (
    <LayoutDashboard>
      <div className={styles.breakSummaryContainer}>
        <div style={{ marginBottom: 20 }}>
          <h1 className={styles.pageTitle}>Daily Salary Calculator</h1>
          <p style={{ color: "#64748b", fontSize: "0.9rem", marginTop: 4 }}>
            Full-month day-by-day salary from attendance (same tardy rules as Monthly Attendance).
            Edit any day — totals and Monthly Payroll unpaid days update automatically.
          </p>
        </div>

        <div className={styles.breakSummaryFilters}>
          <input
            type="text"
            placeholder="Search by name / ID..."
            value={searchName}
            onChange={(e) => setSearchName(e.target.value)}
            className={styles.breakSummaryInput}
          />
          <select
            value={selectedDepartment}
            onChange={(e) => setSelectedDepartment(e.target.value)}
            className={styles.breakSummaryInput}
          >
            <option value="">All Departments</option>
            {departments.map((dept) => (
              <option key={dept.id || dept.name} value={dept.name || dept.department_name}>
                {dept.name || dept.department_name}
              </option>
            ))}
          </select>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <label style={{ color: "#64748b", fontWeight: 500, whiteSpace: "nowrap" }}>Month:</label>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className={styles.breakSummaryDate}
              style={{ minWidth: 160 }}
            />
          </div>
          <button
            type="button"
            className={styles.breakSummaryXLSButton}
            onClick={() => void loadSummaries()}
            disabled={loading}
          >
            Refresh
          </button>
          <button
            type="button"
            className={styles.breakSummaryXLSButton}
            onClick={() => void generate(null)}
            disabled={generating}
            style={{ background: "linear-gradient(135deg, #611f69 0%, #8b3a93 100%)" }}
          >
            {generating ? "Generating…" : "Generate from Attendance"}
          </button>
        </div>

        {message ? (
          <div style={{ marginBottom: 12, color: "#047857", fontSize: 14 }}>{message}</div>
        ) : null}
        {error ? (
          <div style={{ marginBottom: 12, color: "#b91c1c", fontSize: 14 }}>{error}</div>
        ) : null}

        {loading ? (
          <div style={{ padding: 20, color: "#64748b", textAlign: "center" }}>Loading…</div>
        ) : (
          <div className={styles.breakSummaryTableWrapper}>
            <table className={styles.breakSummaryTable}>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Employee</th>
                  <th>Department</th>
                  <th>Basic</th>
                  <th>W.Days</th>
                  <th>Daily Rate</th>
                  <th>Unpaid Days</th>
                  <th>Earned</th>
                  <th>Deducted</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ textAlign: "center", color: "#64748b", padding: 24 }}>
                      No records for this month. Click <strong>Generate from Attendance</strong>.
                    </td>
                  </tr>
                ) : (
                  filtered.map((s) => (
                    <tr
                      key={s.employee_id}
                      style={{
                        background:
                          selectedEmployeeId === s.employee_id ? "rgba(97,31,105,0.06)" : undefined,
                      }}
                    >
                      <td>{s.employee_id}</td>
                      <td>
                        <EmployeeTableNameCell
                          employeeId={s.employee_id}
                          name={s.employee_name}
                          photo={getPhoto(s.employee_id)}
                          onOpen={() =>
                            openFromRow({
                              employee_id: s.employee_id,
                              employee_name: s.employee_name,
                              pseudonym: s.pseudonym,
                              department_name: s.department_name,
                            })
                          }
                        />
                      </td>
                      <td>{s.department_name || "—"}</td>
                      <td>{money(s.basic_salary)}</td>
                      <td>{s.working_days}</td>
                      <td>{money(s.daily_rate)}</td>
                      <td style={{ color: "#dc2626", fontWeight: 600 }}>{s.unpaid_days}</td>
                      <td style={{ color: "#047857", fontWeight: 600 }}>{money(s.total_earned)}</td>
                      <td style={{ color: "#dc2626" }}>{money(s.total_deducted)}</td>
                      <td>
                        <button
                          type="button"
                          className={styles.breakSummaryXLSButton}
                          style={{ padding: "6px 12px", fontSize: 12 }}
                          onClick={() => openEmployee(s.employee_id)}
                        >
                          Days
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {selectedEmployeeId ? (
          <div style={{ marginTop: 28 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
                marginBottom: 12,
              }}
            >
              <h3 className={styles.pageTitle} style={{ fontSize: "1.1rem", margin: 0 }}>
                {detail?.employee_name || selectedEmployeeId} — day records ({selectedMonth})
              </h3>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  className={styles.breakSummaryXLSButton}
                  onClick={() => void generate(selectedEmployeeId)}
                  disabled={generating}
                >
                  Recalc this employee
                </button>
                <button
                  type="button"
                  className={styles.breakSummaryXLSButton}
                  style={{ background: "#64748b" }}
                  onClick={() => {
                    setSelectedEmployeeId(null);
                    setDetail(null);
                  }}
                >
                  Close
                </button>
              </div>
            </div>

            {detail ? (
              <div
                style={{
                  display: "flex",
                  gap: 16,
                  flexWrap: "wrap",
                  marginBottom: 12,
                  fontSize: 14,
                  color: "#334155",
                }}
              >
                <span>
                  Basic: <strong>{money(detail.basic_salary)}</strong>
                </span>
                <span>
                  Working days: <strong>{detail.working_days}</strong>
                </span>
                <span>
                  Daily rate: <strong>{money(detail.daily_rate)}</strong>
                </span>
                <span>
                  Unpaid days: <strong style={{ color: "#dc2626" }}>{detail.unpaid_days}</strong>
                </span>
                <span>
                  Earned: <strong style={{ color: "#047857" }}>{money(detail.total_earned)}</strong>
                </span>
                <span>
                  Deducted: <strong style={{ color: "#dc2626" }}>{money(detail.total_deducted)}</strong>
                </span>
              </div>
            ) : null}

            {detailLoading ? (
              <div style={{ padding: 16, color: "#64748b" }}>Loading days…</div>
            ) : detail?.days?.length ? (
              <div className={styles.breakSummaryTableWrapper}>
                <table className={styles.breakSummaryTable} style={{ minWidth: 1100 }}>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Status</th>
                      <th>Tardy #</th>
                      <th>Deduction %</th>
                      <th>Daily Rate</th>
                      <th>Earned</th>
                      <th>Deducted</th>
                      <th>Clock In</th>
                      <th>Clock Out</th>
                      <th>Notes</th>
                      <th>Edit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.days.map((day) => (
                      <DayEditRow
                        key={day.work_date}
                        day={day}
                        saving={savingDate === day.work_date}
                        onSave={(patch) => void saveDay(day.work_date, patch)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ color: "#64748b" }}>No day rows. Generate first.</div>
            )}
          </div>
        ) : null}
      </div>
      {employeeDetailPopup}
    </LayoutDashboard>
  );
}

function defaultDeductionForStatus(status: string, tardyCount: number | null): number {
  const s = String(status || "").trim();
  if (s === "Absent") return 100;
  if (s === "1st-Half Day" || s === "2nd-Half Day") return 50;
  if (s === "Tardy") {
    const n = Number(tardyCount);
    if (Number.isFinite(n) && n >= 5) return 100;
    if (n === 4) return 50;
    return 0;
  }
  return 0;
}

function DayEditRow({
  day,
  saving,
  onSave,
}: {
  day: DayRow;
  saving: boolean;
  onSave: (patch: {
    status_label?: string;
    deduction_percent?: number;
    money_override?: boolean;
    earned_amount?: number;
    deducted_amount?: number;
    notes?: string | null;
  }) => void;
}) {
  const [status, setStatus] = useState(day.status_label);
  const [deduction, setDeduction] = useState(String(day.deduction_percent));
  const [earned, setEarned] = useState(String(day.earned_amount));
  const [deducted, setDeducted] = useState(String(day.deducted_amount));
  const [notes, setNotes] = useState(day.notes || "");
  const [dirty, setDirty] = useState(false);
  const [moneyDirty, setMoneyDirty] = useState(false);

  useEffect(() => {
    setStatus(day.status_label);
    setDeduction(String(day.deduction_percent));
    setEarned(String(day.earned_amount));
    setDeducted(String(day.deducted_amount));
    setNotes(day.notes || "");
    setDirty(false);
    setMoneyDirty(false);
  }, [day]);

  const muted = !day.is_working_day;

  const previewMoney = (pct: number) => {
    if (!day.is_working_day || day.daily_rate <= 0) {
      setEarned("0");
      setDeducted("0");
      return;
    }
    const fraction = Math.max(0, Math.min(100, pct)) / 100;
    setDeducted(String(Math.round(day.daily_rate * fraction * 100) / 100));
    setEarned(String(Math.round(day.daily_rate * (1 - fraction) * 100) / 100));
  };

  return (
    <tr style={{ opacity: muted ? 0.72 : 1, background: day.is_manual ? "rgba(232,145,45,0.08)" : undefined }}>
      <td>
        {day.work_date}
        {day.is_manual ? (
          <span style={{ marginLeft: 6, fontSize: 11, color: "#c05600", fontWeight: 600 }}>edited</span>
        ) : null}
      </td>
      <td>
        <select
          value={status}
          disabled={saving}
          onChange={(e) => {
            const next = e.target.value;
            setStatus(next);
            const pct = defaultDeductionForStatus(next, day.tardy_count);
            setDeduction(String(pct));
            previewMoney(pct);
            setMoneyDirty(false);
            setDirty(true);
          }}
          className={styles.breakSummaryInput}
          style={{ padding: "4px 8px", minWidth: 120, color: uiStatusTextColor(status), fontWeight: 600 }}
        >
          {DAILY_SALARY_STATUS_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
          {!DAILY_SALARY_STATUS_OPTIONS.includes(status as (typeof DAILY_SALARY_STATUS_OPTIONS)[number]) &&
          status ? (
            <option value={status}>{status}</option>
          ) : null}
        </select>
      </td>
      <td>{day.tardy_count ?? "—"}</td>
      <td>
        <input
          type="number"
          min={0}
          max={100}
          step={50}
          value={deduction}
          disabled={saving || muted}
          onChange={(e) => {
            setDeduction(e.target.value);
            previewMoney(Number(e.target.value) || 0);
            setMoneyDirty(false);
            setDirty(true);
          }}
          className={styles.breakSummaryInput}
          style={{ width: 72, padding: "4px 8px" }}
        />
      </td>
      <td>{money(day.daily_rate)}</td>
      <td>
        <input
          type="number"
          min={0}
          step={0.01}
          value={earned}
          disabled={saving || muted}
          onChange={(e) => {
            setEarned(e.target.value);
            setMoneyDirty(true);
            setDirty(true);
          }}
          className={styles.breakSummaryInput}
          style={{ width: 96, padding: "4px 8px" }}
        />
      </td>
      <td>
        <input
          type="number"
          min={0}
          step={0.01}
          value={deducted}
          disabled={saving || muted}
          onChange={(e) => {
            setDeducted(e.target.value);
            setMoneyDirty(true);
            setDirty(true);
          }}
          className={styles.breakSummaryInput}
          style={{ width: 96, padding: "4px 8px" }}
        />
      </td>
      <td style={{ fontSize: 12, color: "#64748b" }}>
        {day.clock_in ? String(day.clock_in).slice(11, 19) || day.clock_in : "—"}
      </td>
      <td style={{ fontSize: 12, color: "#64748b" }}>
        {day.clock_out ? String(day.clock_out).slice(11, 19) || day.clock_out : "—"}
      </td>
      <td>
        <input
          type="text"
          value={notes}
          disabled={saving}
          placeholder="Note"
          onChange={(e) => {
            setNotes(e.target.value);
            setDirty(true);
          }}
          className={styles.breakSummaryInput}
          style={{ width: 120, padding: "4px 8px" }}
        />
      </td>
      <td>
        <button
          type="button"
          disabled={!dirty || saving}
          className={styles.breakSummaryXLSButton}
          style={{ padding: "6px 10px", fontSize: 12, opacity: dirty ? 1 : 0.5 }}
          onClick={() =>
            onSave({
              status_label: status,
              deduction_percent: Number(deduction),
              money_override: moneyDirty,
              earned_amount: Number(earned),
              deducted_amount: Number(deducted),
              notes: notes || null,
            })
          }
        >
          {saving ? "…" : "Save"}
        </button>
      </td>
    </tr>
  );
}
