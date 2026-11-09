"use client";

import React, { useEffect, useMemo, useState } from "react";
import LayoutDashboard from "../../layout-dashboard";
import styles from "../../break-summary/break-summary.module.css";
import { EmployeeTableNameCell } from "../../components/EmployeeTableNameCell";
import { useEmployeeDetailPopup } from "../../components/use-employee-detail-popup";

type Employee = {
  id: number;
  first_name?: string;
  middle_name?: string;
  last_name?: string;
  pseudonym?: string;
  department_name?: string;
  employee_code?: string;
};

type Overview = {
  year: string;
  advances_taken_count: number;
  advances_taken_total: number;
  loans_taken_count: number;
  loans_taken_principal: number;
  recoveries_this_year: number;
  active_loan_remaining: number;
};

type AdvanceRecord = {
  id: number;
  employee_id: number;
  payroll_month: string;
  amount: number;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type Installment = {
  id: number;
  installment_no: number;
  due_month: string;
  original_amount: number;
  payable_amount: number;
  paid_amount: number;
  status: string;
  paid_at: string | null;
};

type LoanRecord = {
  id: number;
  employee_id: number;
  principal: number;
  installment_count: number;
  start_month: string;
  status: string;
  notes: string | null;
  issued_at: string | null;
  remaining_amount?: number;
  paid_total?: number;
  installments?: Installment[];
};

type ActivityEmployee = {
  employee_id: number;
  employee_name: string;
  pseudonym: string | null;
  advance_count: number;
  advance_total: number;
  loan_count: number;
  loan_principal: number;
};

const money = (n: number) =>
  Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

const fullName = (emp: Employee) =>
  `${emp.first_name || ""} ${emp.middle_name || ""} ${emp.last_name || ""}`
    .replace(/\s+/g, " ")
    .trim();

export default function EmployeeFinancialHistoryPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [year, setYear] = useState(() => String(new Date().getFullYear()));
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"overview" | "advances" | "loans">("overview");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [advances, setAdvances] = useState<AdvanceRecord[]>([]);
  const [loans, setLoans] = useState<LoanRecord[]>([]);
  const [activityEmployees, setActivityEmployees] = useState<ActivityEmployee[]>([]);
  const [expandedLoanIds, setExpandedLoanIds] = useState<Record<number, boolean>>({});
  const [selectedName, setSelectedName] = useState("");
  const { openFromRow, popup, getPhoto } = useEmployeeDetailPopup();

  useEffect(() => {
    fetch("/api/employee-list")
      .then((r) => r.json())
      .then((data) => {
        if (data.success && Array.isArray(data.employees)) {
          const seen = new Set<number>();
          setEmployees(
            data.employees.filter((e: Employee) => {
              if (seen.has(e.id)) return false;
              seen.add(e.id);
              return true;
            }),
          );
        }
      })
      .catch(() => {});
  }, []);

  const filteredEmployees = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return employees.slice(0, 80);
    return employees
      .filter((e) => {
        const name = fullName(e).toLowerCase();
        return (
          name.includes(q) ||
          String(e.id).includes(q) ||
          String(e.employee_code || "").toLowerCase().includes(q) ||
          String(e.pseudonym || "")
            .toLowerCase()
            .includes(q)
        );
      })
      .slice(0, 80);
  }, [employees, search]);

  const loadHistory = async (empId: string, yr: string) => {
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams({ year: yr });
      if (empId) qs.set("employee_id", empId);
      const res = await fetch(`/api/employee-financial-history?${qs.toString()}`);
      const data = await res.json();
      if (!data.success) {
        setError(data.message || "Failed to load financial history");
        setOverview(null);
        setAdvances([]);
        setLoans([]);
        setActivityEmployees([]);
        return;
      }
      setOverview(data.overview || null);
      setAdvances(Array.isArray(data.advances) ? data.advances : []);
      setLoans(Array.isArray(data.loans) ? data.loans : []);
      setActivityEmployees(Array.isArray(data.employees) ? data.employees : []);
      setSelectedName(data.employee_name || "");
      if (Array.isArray(data.loans)) {
        const open: Record<number, boolean> = {};
        for (const loan of data.loans) open[loan.id] = true;
        setExpandedLoanIds(open);
      }
    } catch {
      setError("Failed to load financial history");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadHistory(employeeId, year);
  }, [employeeId, year]);

  const cardStyle: React.CSSProperties = {
    flex: "1 1 180px",
    minWidth: 160,
    padding: "14px 16px",
    borderRadius: 8,
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
  };

  const tabBtn = (id: typeof tab, label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => setTab(id)}
      style={{
        padding: "8px 14px",
        borderRadius: 6,
        border: tab === id ? "1px solid #0052CC" : "1px solid #cbd5e1",
        background: tab === id ? "#0052CC" : "#fff",
        color: tab === id ? "#fff" : "#334155",
        fontWeight: 600,
        cursor: "pointer",
        fontSize: 14,
      }}
    >
      {label}
    </button>
  );

  return (
    <LayoutDashboard>
      <div className={styles.breakSummaryContainer} style={{ maxWidth: 1200, margin: "0 auto" }}>
        <h1 className={styles.pageTitle}>Employee Financial History</h1>
        <p style={{ marginTop: -8, marginBottom: 16, color: "#64748b", fontSize: 14 }}>
          Complete advance and loan detail — yearly totals, month-wise advances, and installment
          timelines. Existing Advance / Loan entry pages stay unchanged.
        </p>

        <div
          className={styles.breakSummaryFilters}
          style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 16, alignItems: "center" }}
        >
          <label style={{ fontWeight: 600 }}>Year</label>
          <input
            type="number"
            min={2000}
            max={2100}
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className={styles.breakSummaryInput}
            style={{ width: 100 }}
          />
          <label style={{ fontWeight: 600 }}>Employee</label>
          <select
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            className={styles.breakSummaryInput}
            style={{ minWidth: 260 }}
          >
            <option value="">All employees (year summary)</option>
            {filteredEmployees.map((e) => (
              <option key={e.id} value={String(e.id)}>
                #{e.id} — {fullName(e)}
                {e.pseudonym ? ` (${e.pseudonym})` : ""}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Filter employee list..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={styles.breakSummaryInput}
            style={{ width: 200 }}
          />
        </div>

        {error && (
          <div style={{ color: "#b91c1c", marginBottom: 12, fontWeight: 600 }}>{error}</div>
        )}
        {loading && <div style={{ marginBottom: 12, color: "#64748b" }}>Loading...</div>}

        {overview && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 18 }}>
            <div style={cardStyle}>
              <div style={{ fontSize: 12, color: "#64748b" }}>Advances taken</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{overview.advances_taken_count}</div>
              <div style={{ fontSize: 13, color: "#334155" }}>
                Total {money(overview.advances_taken_total)}
              </div>
            </div>
            <div style={cardStyle}>
              <div style={{ fontSize: 12, color: "#64748b" }}>Loans taken</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{overview.loans_taken_count}</div>
              <div style={{ fontSize: 13, color: "#334155" }}>
                Principal {money(overview.loans_taken_principal)}
              </div>
            </div>
            <div style={cardStyle}>
              <div style={{ fontSize: 12, color: "#64748b" }}>Recoveries this year</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>
                {money(overview.recoveries_this_year)}
              </div>
              <div style={{ fontSize: 13, color: "#334155" }}>Paid installments</div>
            </div>
            <div style={cardStyle}>
              <div style={{ fontSize: 12, color: "#64748b" }}>Active loan remaining</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>
                {money(overview.active_loan_remaining)}
              </div>
              <div style={{ fontSize: 13, color: "#334155" }}>
                {employeeId ? selectedName || `Employee #${employeeId}` : "Selected scope"}
              </div>
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          {tabBtn("overview", "Overview")}
          {tabBtn("advances", "Advances")}
          {tabBtn("loans", "Loans")}
        </div>

        {!employeeId && tab === "overview" && (
          <div className={styles.breakSummaryTableWrapper} style={{ overflowY: "auto", maxHeight: "62vh" }}>
            <table className={styles.breakSummaryTable} style={{ minWidth: 900 }}>
              <thead style={{ position: "sticky", top: 0, zIndex: 12 }}>
                <tr>
                  <th>ID</th>
                  <th>Employee</th>
                  <th>P.Name</th>
                  <th>Advances (count)</th>
                  <th>Advances (total)</th>
                  <th>Loans (count)</th>
                  <th>Loans (principal)</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {activityEmployees.length === 0 ? (
                  <tr>
                    <td colSpan={8} className={styles.breakSummaryNoRecords}>
                      No advance/loan activity for {year}.
                    </td>
                  </tr>
                ) : (
                  activityEmployees.map((row) => (
                    <tr key={row.employee_id}>
                      <td>{row.employee_id}</td>
                      <td>
                        <EmployeeTableNameCell
                          name={row.employee_name}
                          employeeId={row.employee_id}
                          photo={getPhoto(row.employee_id)}
                          onOpen={() =>
                            openFromRow({
                              employee_id: row.employee_id,
                              employee_name: row.employee_name,
                              pseudonym: row.pseudonym,
                            })
                          }
                        />
                      </td>
                      <td>{row.pseudonym || "--"}</td>
                      <td>{row.advance_count}</td>
                      <td>{money(row.advance_total)}</td>
                      <td>{row.loan_count}</td>
                      <td>{money(row.loan_principal)}</td>
                      <td>
                        <button
                          type="button"
                          onClick={() => {
                            setEmployeeId(String(row.employee_id));
                            setTab("loans");
                          }}
                          style={{
                            padding: "4px 10px",
                            borderRadius: 4,
                            border: "none",
                            background: "#0052CC",
                            color: "#fff",
                            fontWeight: 600,
                            cursor: "pointer",
                            fontSize: 13,
                          }}
                        >
                          Open detail
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {employeeId && tab === "overview" && (
          <div style={{ color: "#475569", fontSize: 14, lineHeight: 1.6 }}>
            <p>
              <strong>{selectedName || `Employee #${employeeId}`}</strong> — {year} detail is in the
              Advances and Loans tabs. Overview cards above show count, totals, recoveries, and
              remaining balance.
            </p>
            <p>
              Advances this year: <strong>{advances.length}</strong> · Loans in scope:{" "}
              <strong>{loans.length}</strong>
            </p>
          </div>
        )}

        {tab === "advances" && (
          <div className={styles.breakSummaryTableWrapper} style={{ overflowY: "auto", maxHeight: "62vh" }}>
            {!employeeId ? (
              <div className={styles.breakSummaryNoRecords} style={{ padding: 24 }}>
                Select an employee to see month-wise advance history.
              </div>
            ) : (
              <table className={styles.breakSummaryTable} style={{ minWidth: 860 }}>
                <thead style={{ position: "sticky", top: 0, zIndex: 12 }}>
                  <tr>
                    <th>ID</th>
                    <th>Payroll month</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Notes</th>
                    <th>Created</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {advances.length === 0 ? (
                    <tr>
                      <td colSpan={7} className={styles.breakSummaryNoRecords}>
                        No advances for this employee in {year}.
                      </td>
                    </tr>
                  ) : (
                    advances.map((a) => (
                      <tr key={a.id}>
                        <td>{a.id}</td>
                        <td>{a.payroll_month}</td>
                        <td>{money(a.amount)}</td>
                        <td>{a.status}</td>
                        <td>{a.notes || "--"}</td>
                        <td>{a.created_at ? String(a.created_at).slice(0, 19).replace("T", " ") : "--"}</td>
                        <td>{a.updated_at ? String(a.updated_at).slice(0, 19).replace("T", " ") : "--"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        )}

        {tab === "loans" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {!employeeId ? (
              <div className={styles.breakSummaryNoRecords} style={{ padding: 24 }}>
                Select an employee to see loan masters and installment timelines.
              </div>
            ) : loans.length === 0 ? (
              <div className={styles.breakSummaryNoRecords} style={{ padding: 24 }}>
                No loans for this employee in {year}.
              </div>
            ) : (
              loans.map((loan) => {
                const open = !!expandedLoanIds[loan.id];
                return (
                  <div
                    key={loan.id}
                    style={{
                      border: "1px solid #e2e8f0",
                      borderRadius: 8,
                      background: "#fff",
                      overflow: "hidden",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedLoanIds((prev) => ({ ...prev, [loan.id]: !prev[loan.id] }))
                      }
                      style={{
                        width: "100%",
                        textAlign: "left",
                        padding: "12px 14px",
                        border: "none",
                        background: "#f8fafc",
                        cursor: "pointer",
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 12,
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <div style={{ fontWeight: 700, color: "#0f172a" }}>
                        Loan #{loan.id} · {loan.start_month} · {loan.installment_count} installments ·{" "}
                        {loan.status}
                      </div>
                      <div style={{ fontSize: 13, color: "#334155" }}>
                        Principal {money(loan.principal)} · Paid {money(loan.paid_total || 0)} ·
                        Remaining {money(loan.remaining_amount || 0)} {open ? "▲" : "▼"}
                      </div>
                    </button>
                    {open && (
                      <div className={styles.breakSummaryTableWrapper} style={{ padding: 8 }}>
                        <table className={styles.breakSummaryTable} style={{ minWidth: 820 }}>
                          <thead>
                            <tr>
                              <th>#</th>
                              <th>Due month</th>
                              <th>Original</th>
                              <th>Payable</th>
                              <th>Paid</th>
                              <th>Status</th>
                              <th>Paid at</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(loan.installments || []).length === 0 ? (
                              <tr>
                                <td colSpan={7} className={styles.breakSummaryNoRecords}>
                                  No installment rows.
                                </td>
                              </tr>
                            ) : (
                              (loan.installments || []).map((inst) => (
                                <tr key={inst.id}>
                                  <td>{inst.installment_no}</td>
                                  <td>{inst.due_month}</td>
                                  <td>{money(inst.original_amount)}</td>
                                  <td>{money(inst.payable_amount)}</td>
                                  <td>{money(inst.paid_amount)}</td>
                                  <td>{inst.status}</td>
                                  <td>
                                    {inst.paid_at
                                      ? String(inst.paid_at).slice(0, 19).replace("T", " ")
                                      : "--"}
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                        {loan.notes ? (
                          <div style={{ padding: "6px 10px 10px", fontSize: 13, color: "#64748b" }}>
                            Notes: {loan.notes}
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
      {popup}
    </LayoutDashboard>
  );
}
