"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import LayoutDashboard from "../../layout-dashboard";
import fh from "../employee-financial-history/financial-history.module.css";
import { MEDICAL_PACKAGES } from "@/lib/medical-package";

type Employee = {
  id: number;
  first_name?: string;
  middle_name?: string;
  last_name?: string;
  pseudonym?: string | null;
  department_name?: string | null;
};

type ClaimRow = {
  id: number;
  employee_id: number;
  claim_year: string;
  claim_type: string;
  title: string | null;
  amount: number;
  claim_date: string;
  status: string;
  notes: string | null;
  employee_name?: string;
  pseudonym?: string | null;
  department_name?: string | null;
  created_by?: string | null;
};

type ClaimBalance = {
  employee_id: number;
  year: string;
  claim_type: string;
  medical_package: string | null;
  entitlement: number;
  entitlement_source: string;
  used: number;
  pending: number;
  remaining: number;
  claims_count: number;
};

type MedicalBalances = {
  opd: ClaimBalance;
  ipd: ClaimBalance;
};

type Summary = {
  year: string;
  total_claims: number;
  total_approved_amount: number;
  total_pending_amount: number;
  employees_with_claims: number;
};

const money = (n: number) =>
  Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

const fullName = (emp?: Partial<Employee> | null) =>
  `${emp?.first_name || ""} ${emp?.middle_name || ""} ${emp?.last_name || ""}`
    .replace(/\s+/g, " ")
    .trim();

function statusClass(status: string) {
  const s = String(status || "").toLowerCase();
  if (s === "paid" || s === "approved") return fh.statusPaid;
  if (s === "pending") return fh.statusActive;
  if (s === "rejected" || s === "cancelled") return fh.statusCancelled;
  return "";
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function viewerId(): string {
  if (typeof window === "undefined") return "";
  try {
    return (
      localStorage.getItem("hrmEmployeeId") ||
      localStorage.getItem("employeeId") ||
      ""
    );
  } catch {
    return "";
  }
}

export default function ClaimsPage() {
  const [year, setYear] = useState(() => String(new Date().getFullYear()));
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [claims, setClaims] = useState<ClaimRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [nameSearch, setNameSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  const [formEmployeeId, setFormEmployeeId] = useState("");
  const [empPickerOpen, setEmpPickerOpen] = useState(false);
  const [empPickerQuery, setEmpPickerQuery] = useState("");
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const empPickerRef = useRef<HTMLDivElement | null>(null);
  const [formAmount, setFormAmount] = useState("");
  const [formDate, setFormDate] = useState(todayIso);
  const [formType, setFormType] = useState("opd");
  const [formTitle, setFormTitle] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formStatus, setFormStatus] = useState("approved");
  const [balance, setBalance] = useState<ClaimBalance | null>(null);
  const [medicalBalances, setMedicalBalances] = useState<MedicalBalances | null>(
    null,
  );
  const [balanceError, setBalanceError] = useState("");
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  const loadEmployees = useCallback(async () => {
    setEmployeesLoading(true);
    try {
      // Same source as Advance / Loan — /api/hrm_employees is single-lookup only.
      const res = await fetch("/api/employee-list", { cache: "no-store" });
      const data = await res.json();
      const list = Array.isArray(data?.employees)
        ? data.employees
        : Array.isArray(data)
          ? data
          : [];
      setEmployees(list as Employee[]);
    } catch {
      setEmployees([]);
    } finally {
      setEmployeesLoading(false);
    }
  }, []);

  const loadClaims = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const vid = viewerId();
      const q = new URLSearchParams({ year, viewerId: vid });
      if (statusFilter) q.set("status", statusFilter);
      if (typeFilter) q.set("claim_type", typeFilter);
      const res = await fetch(`/api/employee-claims?${q}`, {
        cache: "no-store",
        headers: { "x-employee-id": vid },
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed to load");
      setClaims(Array.isArray(data.claims) ? data.claims : []);
      setSummary(data.summary || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load claims");
      setClaims([]);
    } finally {
      setLoading(false);
    }
  }, [year, statusFilter, typeFilter]);

  const loadBalance = useCallback(async (employeeId: string, claimType: string) => {
    if (!/^\d+$/.test(employeeId)) {
      setBalance(null);
      setMedicalBalances(null);
      setBalanceError("");
      return;
    }
    setBalanceLoading(true);
    setBalanceError("");
    try {
      const vid = viewerId();
      const q = new URLSearchParams({
        balance: "1",
        employee_id: employeeId,
        year: year || String(new Date().getFullYear()),
        claim_type: claimType || "opd",
      });
      if (vid) q.set("viewerId", vid);
      const headers: Record<string, string> = {};
      if (vid) headers["x-employee-id"] = vid;
      const res = await fetch(`/api/employee-claims?${q}`, {
        cache: "no-store",
        headers,
      });
      const data = await res.json().catch(() => ({}));
      if (data.success && data.balances?.opd && data.balances?.ipd) {
        setBalance(data.balance || data.balances.opd);
        setMedicalBalances({
          opd: data.balances.opd,
          ipd: data.balances.ipd,
        });
        setBalanceError("");
      } else if (data.success && data.balance) {
        setBalance(data.balance);
        setMedicalBalances(null);
        setBalanceError("");
      } else {
        setBalance(null);
        setMedicalBalances(null);
        setBalanceError(
          data.error || `Balance failed (${res.status || "network"})`,
        );
      }
    } catch (e) {
      setBalance(null);
      setMedicalBalances(null);
      setBalanceError(e instanceof Error ? e.message : "Balance failed");
    } finally {
      setBalanceLoading(false);
    }
  }, [year]);

  useEffect(() => {
    void loadEmployees();
  }, [loadEmployees]);

  useEffect(() => {
    void loadClaims();
  }, [loadClaims]);

  useEffect(() => {
    void loadBalance(formEmployeeId, formType);
  }, [formEmployeeId, formType, loadBalance]);

  useEffect(() => {
    if (!empPickerOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!empPickerRef.current?.contains(e.target as Node)) {
        setEmpPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [empPickerOpen]);

  const filteredClaims = useMemo(() => {
    const q = nameSearch.trim().toLowerCase();
    if (!q) return claims;
    return claims.filter((c) => {
      const blob = [
        c.employee_name,
        c.pseudonym,
        c.department_name,
        String(c.employee_id),
        c.title,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return blob.includes(q);
    });
  }, [claims, nameSearch]);

  const employeeOptions = useMemo(() => {
    return [...employees].sort((a, b) =>
      fullName(a).localeCompare(fullName(b)),
    );
  }, [employees]);

  const selectedEmployee = useMemo(
    () => employeeOptions.find((e) => String(e.id) === formEmployeeId) || null,
    [employeeOptions, formEmployeeId],
  );

  const filteredEmployeeOptions = useMemo(() => {
    const q = empPickerQuery.trim().toLowerCase();
    if (!q) return employeeOptions;
    return employeeOptions.filter((e) => {
      const blob = [
        fullName(e),
        e.pseudonym,
        e.department_name,
        String(e.id),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return blob.includes(q);
    });
  }, [employeeOptions, empPickerQuery]);

  function pickEmployee(emp: Employee) {
    setFormEmployeeId(String(emp.id));
    setEmpPickerQuery("");
    setEmpPickerOpen(false);
  }

  function clearEmployee() {
    setFormEmployeeId("");
    setEmpPickerQuery("");
    setBalance(null);
    setMedicalBalances(null);
    setBalanceError("");
  }

  function claimTypeLabel(t: string) {
    const v = String(t || "").toLowerCase();
    if (v === "opd" || v === "medical") return "OPD";
    if (v === "ipd") return "IPD";
    if (v === "travel") return "Travel";
    if (v === "other") return "Other";
    return t || "—";
  }

  async function onSaveClaim(e: React.FormEvent) {
    e.preventDefault();
    if (!formEmployeeId) {
      setToast("Select an employee");
      return;
    }
    const amount = Number(formAmount);
    if (!(amount > 0)) {
      setToast("Enter a valid amount");
      return;
    }
    setSaving(true);
    setToast("");
    try {
      const res = await fetch("/api/employee-claims", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-employee-id": viewerId(),
        },
        body: JSON.stringify({
          employee_id: Number(formEmployeeId),
          amount,
          claim_date: formDate,
          claim_type: formType,
          title: formTitle || null,
          notes: formNotes || null,
          status: formStatus,
          viewerId: viewerId(),
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Save failed");
      setToast("Claim added");
      setFormAmount("");
      setFormTitle("");
      setFormNotes("");
      if (data.balance) setBalance(data.balance);
      await loadClaims();
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function setClaimStatus(id: number, status: string) {
    try {
      const res = await fetch(`/api/employee-claims/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-employee-id": viewerId(),
        },
        body: JSON.stringify({ status, viewerId: viewerId() }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Update failed");
      await loadClaims();
      if (formEmployeeId) void loadBalance(formEmployeeId, formType);
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Update failed");
    }
  }

  const activePkg =
    medicalBalances?.ipd?.medical_package ||
    medicalBalances?.opd?.medical_package ||
    balance?.medical_package ||
    null;
  const pkgLabel = activePkg
    ? MEDICAL_PACKAGES.find((p) => p.id === activePkg)?.label || activePkg
    : "—";

  return (
    <LayoutDashboard>
      <div className={fh.page}>
        <div className={fh.hero}>
          <h1 className={fh.heroTitle}>Claims</h1>
          <p className={fh.heroSub}>
            OPD 150k for every employee. IPD by package: Silver 30k · Gold 40k ·
            Platinum 50k. Remaining = entitlement minus approved/paid claims this
            year.
          </p>
        </div>

        <div className={fh.cards}>
          <div className={fh.card}>
            <div className={fh.cardLabel}>Claims ({year})</div>
            <div className={fh.cardValue}>{summary?.total_claims ?? 0}</div>
          </div>
          <div className={fh.card}>
            <div className={fh.cardLabel}>Approved amount</div>
            <div className={fh.cardValue}>
              {money(summary?.total_approved_amount ?? 0)}
            </div>
          </div>
          <div className={fh.card}>
            <div className={fh.cardLabel}>Pending amount</div>
            <div className={fh.cardValue}>
              {money(summary?.total_pending_amount ?? 0)}
            </div>
          </div>
          <div className={fh.card}>
            <div className={fh.cardLabel}>Employees</div>
            <div className={fh.cardValue}>
              {summary?.employees_with_claims ?? 0}
            </div>
          </div>
        </div>

        <div className={fh.panel}>
          <h2 style={{ margin: "0 0 12px", fontSize: "1.05rem" }}>
            Add claim
          </h2>
          <form onSubmit={onSaveClaim}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(220px, 1.4fr) repeat(4, minmax(110px, 1fr))",
                gap: 12,
                alignItems: "end",
              }}
            >
              <div className={fh.field} ref={empPickerRef} style={{ position: "relative" }}>
                <span className={fh.label}>Employee</span>
                <input
                  className={fh.input}
                  value={
                    empPickerOpen
                      ? empPickerQuery
                      : selectedEmployee
                        ? `${fullName(selectedEmployee) || `Employee ${selectedEmployee.id}`}${
                            selectedEmployee.pseudonym
                              ? ` (${selectedEmployee.pseudonym})`
                              : ""
                          }`
                        : empPickerQuery
                  }
                  onChange={(e) => {
                    setEmpPickerQuery(e.target.value);
                    setEmpPickerOpen(true);
                    if (formEmployeeId) setFormEmployeeId("");
                  }}
                  onFocus={() => {
                    setEmpPickerOpen(true);
                    if (selectedEmployee) setEmpPickerQuery("");
                  }}
                  placeholder={
                    employeesLoading
                      ? "Loading employees…"
                      : "Search by name or pseudo…"
                  }
                  autoComplete="off"
                  required={!formEmployeeId}
                />
                {formEmployeeId ? (
                  <button
                    type="button"
                    onClick={clearEmployee}
                    style={{
                      position: "absolute",
                      right: 8,
                      top: 30,
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                      color: "#64748b",
                      fontSize: 14,
                      lineHeight: 1,
                    }}
                    aria-label="Clear employee"
                  >
                    ×
                  </button>
                ) : null}
                {empPickerOpen ? (
                  <div
                    role="listbox"
                    style={{
                      position: "absolute",
                      zIndex: 40,
                      left: 0,
                      right: 0,
                      top: "100%",
                      marginTop: 4,
                      maxHeight: 280,
                      overflowY: "auto",
                      background: "#fff",
                      border: "1px solid #d4d4d8",
                      borderRadius: 8,
                      boxShadow: "0 8px 24px rgba(15,23,42,0.12)",
                    }}
                  >
                    {employeesLoading ? (
                      <div style={{ padding: "10px 12px", color: "#64748b" }}>
                        Loading employees…
                      </div>
                    ) : filteredEmployeeOptions.length === 0 ? (
                      <div style={{ padding: "10px 12px", color: "#64748b" }}>
                        {employees.length === 0
                          ? "No employees found"
                          : "No match — try name or pseudo"}
                      </div>
                    ) : (
                      filteredEmployeeOptions.slice(0, 80).map((e) => (
                        <button
                          key={e.id}
                          type="button"
                          role="option"
                          onClick={() => pickEmployee(e)}
                          style={{
                            display: "block",
                            width: "100%",
                            textAlign: "left",
                            padding: "8px 12px",
                            border: "none",
                            borderBottom: "1px solid #f1f5f9",
                            background:
                              String(e.id) === formEmployeeId ? "#f3e8ff" : "#fff",
                            cursor: "pointer",
                          }}
                        >
                          <div style={{ fontWeight: 600 }}>
                            {fullName(e) || `Employee ${e.id}`}
                            {e.pseudonym ? (
                              <span style={{ fontWeight: 500, color: "#611f69" }}>
                                {" "}
                                · {e.pseudonym}
                              </span>
                            ) : null}
                          </div>
                          <div style={{ fontSize: 12, color: "#64748b" }}>
                            ID {e.id}
                            {e.department_name ? ` · ${e.department_name}` : ""}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                ) : null}
              </div>
              <label className={fh.field}>
                <span className={fh.label}>Type</span>
                <select
                  className={fh.select}
                  value={formType === "ipd" ? "ipd" : "opd"}
                  onChange={(e) => setFormType(e.target.value)}
                >
                  <option value="opd">OPD</option>
                  <option value="ipd">IPD</option>
                </select>
              </label>
              <label className={fh.field}>
                <span className={fh.label}>Amount</span>
                <input
                  className={fh.input}
                  type="number"
                  min={1}
                  step="0.01"
                  value={formAmount}
                  onChange={(e) => setFormAmount(e.target.value)}
                  placeholder="0"
                  required
                />
              </label>
              <label className={fh.field}>
                <span className={fh.label}>Claim date</span>
                <input
                  className={fh.input}
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  required
                />
              </label>
              <label className={fh.field}>
                <span className={fh.label}>Status</span>
                <select
                  className={fh.select}
                  value={formStatus}
                  onChange={(e) => setFormStatus(e.target.value)}
                >
                  <option value="approved">Approved</option>
                  <option value="pending">Pending</option>
                  <option value="paid">Paid</option>
                </select>
              </label>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr auto",
                gap: 12,
                marginTop: 12,
                alignItems: "end",
              }}
            >
              <label className={fh.field}>
                <span className={fh.label}>Title / reason</span>
                <input
                  className={fh.input}
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="e.g. Lab tests, pharmacy"
                />
              </label>
              <label className={fh.field}>
                <span className={fh.label}>Notes</span>
                <input
                  className={fh.input}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Optional"
                />
              </label>
              <button
                type="submit"
                className={fh.clearBtn}
                disabled={saving}
                style={{
                  background: "#611f69",
                  color: "#fff",
                  borderColor: "#611f69",
                  minWidth: 120,
                }}
              >
                {saving ? "Saving…" : "Add claim"}
              </button>
            </div>
          </form>

          {formEmployeeId ? (
            <div className={fh.selectedBar} style={{ marginTop: 14 }}>
              <div className={fh.selectedText}>
                {balanceLoading
                  ? "Loading balance…"
                  : medicalBalances
                    ? (
                      <>
                        Package <strong>{pkgLabel}</strong>
                        {" · "}OPD remaining{" "}
                        <strong
                          style={{
                            color:
                              medicalBalances.opd.remaining <= 0
                                ? "#b91c1c"
                                : "#15803d",
                          }}
                        >
                          {money(medicalBalances.opd.remaining)}
                        </strong>
                        <span style={{ opacity: 0.75 }}>
                          {" "}
                          / {money(medicalBalances.opd.entitlement)}
                        </span>
                        {" · "}IPD remaining{" "}
                        <strong
                          style={{
                            color:
                              medicalBalances.ipd.remaining <= 0
                                ? "#b91c1c"
                                : "#15803d",
                          }}
                        >
                          {money(medicalBalances.ipd.remaining)}
                        </strong>
                        <span style={{ opacity: 0.75 }}>
                          {" "}
                          / {money(medicalBalances.ipd.entitlement)}
                        </span>
                        {formType === "opd" || formType === "ipd" ? (
                          <>
                            {" · "}Selected {claimTypeLabel(formType)} used{" "}
                            <strong>{money(balance?.used ?? 0)}</strong>
                          </>
                        ) : null}
                        {!medicalBalances.ipd.medical_package &&
                        formType === "ipd" ? (
                          <span style={{ fontWeight: 500, opacity: 0.85 }}>
                            {" "}
                            (no package on salary — IPD entitlement is 0)
                          </span>
                        ) : null}
                      </>
                    )
                    : balance
                      ? (
                        <>
                          Package <strong>{pkgLabel}</strong>
                          {" · "}Entitlement{" "}
                          <strong>{money(balance.entitlement)}</strong>
                          {" · "}Remaining{" "}
                          <strong
                            style={{
                              color:
                                balance.remaining <= 0 ? "#b91c1c" : "#15803d",
                            }}
                          >
                            {money(balance.remaining)}
                          </strong>
                        </>
                      )
                      : (
                        <span style={{ color: "#b91c1c" }}>
                          {balanceError || "Balance unavailable"}
                        </span>
                      )}
              </div>
            </div>
          ) : null}

          {toast ? (
            <p style={{ margin: "10px 0 0", color: "#3b0764", fontWeight: 600 }}>
              {toast}
            </p>
          ) : null}
        </div>

        <div className={fh.panel}>
          <div className={fh.filters} style={{ gridTemplateColumns: "110px 1fr 140px 140px auto" }}>
            <label className={fh.field}>
              <span className={fh.label}>Year</span>
              <input
                className={fh.input}
                value={year}
                onChange={(e) => setYear(e.target.value.replace(/[^\d]/g, "").slice(0, 4))}
              />
            </label>
            <label className={fh.field}>
              <span className={fh.label}>Search</span>
              <input
                className={fh.input}
                value={nameSearch}
                onChange={(e) => setNameSearch(e.target.value)}
                placeholder="Name, pseudo, dept…"
              />
            </label>
            <label className={fh.field}>
              <span className={fh.label}>Status</span>
              <select
                className={fh.select}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">All</option>
                <option value="approved">Approved</option>
                <option value="pending">Pending</option>
                <option value="paid">Paid</option>
                <option value="rejected">Rejected</option>
              </select>
            </label>
            <label className={fh.field}>
              <span className={fh.label}>Type</span>
              <select
                className={fh.select}
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
              >
                <option value="">All</option>
                <option value="opd">OPD</option>
                <option value="ipd">IPD</option>
              </select>
            </label>
            <button type="button" className={fh.clearBtn} onClick={() => void loadClaims()}>
              {loading ? "…" : "Refresh"}
            </button>
          </div>

          {error ? (
            <p style={{ color: "#b91c1c", fontWeight: 600 }}>{error}</p>
          ) : null}

          <div className={fh.tableWrap} style={{ marginTop: 12 }}>
            <table className={fh.table}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Employee</th>
                  <th>Dept</th>
                  <th>Type</th>
                  <th>Title</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredClaims.length === 0 ? (
                  <tr>
                    <td colSpan={8} className={fh.empty}>
                      {loading ? "Loading…" : "No claims yet. Add one above."}
                    </td>
                  </tr>
                ) : (
                  filteredClaims.map((c) => (
                    <tr key={c.id}>
                      <td>{c.claim_date}</td>
                      <td>
                        <strong>{c.employee_name || `Employee ${c.employee_id}`}</strong>
                        {c.pseudonym ? (
                          <div style={{ fontSize: 12, color: "#64748b" }}>{c.pseudonym}</div>
                        ) : null}
                      </td>
                      <td>{c.department_name || "—"}</td>
                      <td>{claimTypeLabel(c.claim_type)}</td>
                      <td>{c.title || "—"}</td>
                      <td>{money(c.amount)}</td>
                      <td>
                        <span className={`${fh.statusPill} ${statusClass(c.status)}`}>
                          {c.status}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {c.status === "pending" ? (
                            <button
                              type="button"
                              className={fh.clearBtn}
                              style={{ height: 32, padding: "0 10px", fontSize: 12 }}
                              onClick={() => void setClaimStatus(c.id, "approved")}
                            >
                              Approve
                            </button>
                          ) : null}
                          {c.status === "approved" ? (
                            <button
                              type="button"
                              className={fh.clearBtn}
                              style={{ height: 32, padding: "0 10px", fontSize: 12 }}
                              onClick={() => void setClaimStatus(c.id, "paid")}
                            >
                              Mark paid
                            </button>
                          ) : null}
                          {c.status !== "rejected" && c.status !== "cancelled" ? (
                            <button
                              type="button"
                              className={fh.clearBtn}
                              style={{
                                height: 32,
                                padding: "0 10px",
                                fontSize: 12,
                                color: "#b91c1c",
                              }}
                              onClick={() => void setClaimStatus(c.id, "rejected")}
                            >
                              Reject
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </LayoutDashboard>
  );
}
