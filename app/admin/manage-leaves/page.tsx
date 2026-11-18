"use client";

import React, { Suspense, useDeferredValue, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import OptionalAdminShell from "@/app/components/OptionalAdminShell";
import styles from "./manage-leaves.module.css";
import leaveStyles from "../../leave/leave.module.css";
import adminStyles from "../admin-page.module.css";
import { EmployeeTableNameCell } from "../../components/EmployeeTableNameCell";
import { useEmployeeDetailPopup } from "../../components/use-employee-detail-popup";
import { ModalPortal } from "@/app/components/ModalPortal";
import { toastError, toastSuccess } from "@/lib/app-toast";
import LeaveRequestsPanel from "./LeaveRequestsPanel";
import LeaveSummaryPanel from "./LeaveSummaryPanel";
import { normalizeEmployeeGender } from "@/lib/leave-categories";
import { fetchAccessControlMe } from "@/lib/access-control/me-client-cache";
import { permissionSetHas } from "@/lib/access-control/permission-scope";

type LeaveDashTab = "balances" | "requests" | "summary";

const MANAGE_LEAVES_TAB_KEY = "manage-leaves-tab";

function tabFromParam(raw: string | null): LeaveDashTab | null {
  if (raw === "balances" || raw === "requests" || raw === "summary") return raw;
  return null;
}

function persistLeaveTab(tab: LeaveDashTab) {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    sessionStorage.setItem(MANAGE_LEAVES_TAB_KEY, tab);
  } catch {
    /* ignore */
  }
}

function readPersistedLeaveTab(): LeaveDashTab | null {
  try {
    const fromUrl = tabFromParam(
      new URLSearchParams(window.location.search).get("tab"),
    );
    if (fromUrl) return fromUrl;
    return tabFromParam(sessionStorage.getItem(MANAGE_LEAVES_TAB_KEY));
  } catch {
    return null;
  }
}

interface Employee {
  id: number;
  first_name: string;
  last_name: string;
  employee_code: string;
  employment_status: string;
  gender?: string | null;
  annual_allowance: number;
  bereavement_allowance: number;
  maternity_allowance?: number;
  paternity_allowance?: number;
  annual_used: number;
  bereavement_used: number;
  maternity_used?: number;
  paternity_used?: number;
  annual_current_balance: number;
  bereavement_current_balance: number;
  maternity_current_balance?: number;
  paternity_current_balance?: number;
  annual_balance_adjustment: number;
  bereavement_balance_adjustment: number;
  department_name?: string;
  pseudonym?: string;
}

function isLeaveDaysInput(value: string): boolean {
  return value === "" || /^\d*\.?\d{0,2}$/.test(value);
}

function parseLeaveDays(value: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 2) / 2;
}

function formatLeaveDays(value: number): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function formatLeaveDelta(next: number, current: number): string {
  const delta = Math.round((next - current) * 2) / 2;
  if (delta === 0) return "";
  const abs = formatLeaveDays(Math.abs(delta));
  return delta > 0 ? `+${abs} leaves added` : `-${abs} leaves removed`;
}

export default function ManageLeavesPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Loading leaves…</div>}>
      <ManageLeavesPageInner />
    </Suspense>
  );
}

function ManageLeavesPageInner() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    annual_current_balance: "20",
    bereavement_current_balance: "3",
    maternity_current_balance: "90",
    paternity_current_balance: "5",
  });
  const [saving, setSaving] = useState(false);
  const [searchName, setSearchName] = useState("");
  const deferredSearchName = useDeferredValue(searchName);
  const [selectedDepartment, setSelectedDepartment] = useState("");
  const [employmentStatusFilter, setEmploymentStatusFilter] = useState("");
  const [lowBalanceOnly, setLowBalanceOnly] = useState(false);
  /** "" = all months; YYYY-MM filters employees with leave activity that month */
  const [monthFilter, setMonthFilter] = useState("");
  const [monthActiveIds, setMonthActiveIds] = useState<Set<string> | null>(null);
  /** Clickable legend: all | annual | bereavement (opens Requests filtered by category) */
  const [balanceFocus, setBalanceFocus] = useState<"all" | "annual" | "bereavement">("all");
  const [departments, setDepartments] = useState<{ id: number | string; name?: string; department_name?: string }[]>([]);
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<LeaveDashTab>("requests");
  /** HR Admin / HR Manager only — leave.balances.edit */
  const [canEditBalances, setCanEditBalances] = useState(false);
  const { openFromRow, popup, getPhoto } = useEmployeeDetailPopup();

  useEffect(() => {
    const eid =
      typeof window !== "undefined"
        ? String(localStorage.getItem("employeeId") || "").trim()
        : "";
    if (!eid) {
      setCanEditBalances(false);
      return;
    }
    let cancelled = false;
    void fetchAccessControlMe(eid)
      .then((data) => {
        if (cancelled) return;
        const perms = Array.isArray(data?.permissions)
          ? (data.permissions as string[])
          : [];
        setCanEditBalances(permissionSetHas(perms, "leave.balances.edit"));
      })
      .catch(() => {
        if (!cancelled) setCanEditBalances(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectTab = (tab: LeaveDashTab) => {
    setActiveTab(tab);
    persistLeaveTab(tab);
  };

  useEffect(() => {
    const fromUrl = tabFromParam(searchParams?.get("tab") ?? null);
    if (fromUrl) {
      setActiveTab(fromUrl);
      try {
        sessionStorage.setItem(MANAGE_LEAVES_TAB_KEY, fromUrl);
      } catch {
        /* ignore */
      }
      return;
    }
    const next = readPersistedLeaveTab() || "requests";
    setActiveTab(next);
    persistLeaveTab(next);
  }, [searchParams]);

  useEffect(() => {
    fetchEmployees();
  }, []);

  useEffect(() => {
    fetch("/api/departments")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.departments)) {
          setDepartments(data.departments);
        }
      })
      .catch((err) => console.error("Error fetching departments:", err));
  }, []);

  useEffect(() => {
    if (!monthFilter) {
      setMonthActiveIds(null);
      return;
    }
    let cancelled = false;
    const [year, monthNum] = monthFilter.split("-");
    const fromDate = `${year}-${monthNum}-01`;
    const lastDay = new Date(Number(year), Number(monthNum), 0).getDate();
    const toDate = `${year}-${monthNum}-${String(lastDay).padStart(2, "0")}`;
    void (async () => {
      try {
        const res = await fetch(
          `/api/leaves?fromDate=${encodeURIComponent(fromDate)}&toDate=${encodeURIComponent(toDate)}&ts=${Date.now()}`,
          { cache: "no-store" },
        );
        const data = await res.json();
        if (cancelled) return;
        const ids = new Set<string>();
        for (const l of data?.leaves || []) {
          const id = String(l?.employee_id ?? "").trim();
          if (id) ids.add(id);
        }
        setMonthActiveIds(ids);
      } catch {
        if (!cancelled) setMonthActiveIds(new Set());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [monthFilter]);

  async function fetchEmployees() {
    try {
      setLoading(true);
      const viewerId =
        typeof window !== "undefined"
          ? String(localStorage.getItem("employeeId") || "").trim()
          : "";
      const viewerQs = viewerId ? `&viewerId=${encodeURIComponent(viewerId)}` : "";
      const viewerHeaders: HeadersInit = viewerId
        ? { "x-employee-id": viewerId, "x-hrm-employee-id": viewerId }
        : {};
      const res = await fetch(
        `/api/employee-leave-allowances?ts=${Date.now()}${viewerQs}`,
        { cache: "no-store", headers: viewerHeaders },
      );
      const data = await res.json();
      if (data.success) {
        const empDetailsMap = new Map<
          number,
          { pseudonym: string; department_name: string }
        >();

        try {
          const listRes = await fetch(
            `/api/employee-list?ts=${Date.now()}${viewerQs}`,
            { cache: "no-store", headers: viewerHeaders },
          );
          const listData = await listRes.json();
          const list = Array.isArray(listData?.employees)
            ? listData.employees
            : Array.isArray(listData)
              ? listData
              : [];
          for (const row of list) {
            const empId = Number(row.id);
            if (!Number.isFinite(empId) || empDetailsMap.has(empId)) continue;
            empDetailsMap.set(empId, {
              pseudonym: row.pseudonym || "-",
              department_name: row.department_name || "-",
            });
          }
        } catch (err) {
          console.error("Error fetching employee list:", err);
        }

        const enrichedEmployees = data.employees.map((emp: Employee) => ({
          ...emp,
          department_name:
            emp.department_name ||
            empDetailsMap.get(emp.id)?.department_name ||
            "-",
          pseudonym: empDetailsMap.get(emp.id)?.pseudonym || "-",
        }));
        setEmployees(enrichedEmployees);
      } else {
        toastError("Failed to fetch employees: " + data.error);
      }
    } catch (error) {
      toastError("Error fetching employees: " + String(error));
    } finally {
      setLoading(false);
    }
  }

  function handleEdit(employee: Employee) {
    if (!canEditBalances) return;
    setEditingEmployee(employee);
    setFormData({
      annual_current_balance: formatLeaveDays(employee.annual_current_balance),
      bereavement_current_balance: formatLeaveDays(employee.bereavement_current_balance),
      maternity_current_balance: formatLeaveDays(
        employee.maternity_current_balance ?? employee.maternity_allowance ?? 90,
      ),
      paternity_current_balance: formatLeaveDays(
        employee.paternity_current_balance ?? employee.paternity_allowance ?? 5,
      ),
    });
    setShowModal(true);
  }

  async function handleSave() {
    if (!editingEmployee) return;

    try {
      setSaving(true);
      const viewerId = String(localStorage.getItem("employeeId") || "").trim();
      const res = await fetch("/api/employee-leave-allowances", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(viewerId
            ? { "x-employee-id": viewerId, "x-hrm-employee-id": viewerId }
            : {}),
        },
        body: JSON.stringify({
          employee_id: editingEmployee.id,
          viewerId: viewerId || undefined,
          annual_current_balance: parseLeaveDays(formData.annual_current_balance),
          bereavement_current_balance: parseLeaveDays(formData.bereavement_current_balance),
          maternity_current_balance: parseLeaveDays(formData.maternity_current_balance),
          paternity_current_balance: parseLeaveDays(formData.paternity_current_balance),
        })
      });

      const data = await res.json();
      if (data.success) {
        toastSuccess("Leave balance updated successfully!");
        setShowModal(false);
        setEditingEmployee(null);
        fetchEmployees();
      } else {
        toastError("Failed to update: " + data.error);
      }
    } catch (error) {
      toastError("Error updating: " + String(error));
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setShowModal(false);
    setEditingEmployee(null);
  }

  const getFullName = (employee: Employee) => {
    return `${employee.first_name || ""} ${employee.last_name || ""}`.trim();
  };

  const employmentStatusKey = (emp: Employee) => {
    const s = String(emp.employment_status || "").toLowerCase();
    if (s.includes("probation")) return "Probation";
    return "Confirmed";
  };

  /** Real balances from API (allowance − used + adjustment) — never invent static used. */
  const balanceFor = (emp: Employee) => {
    const gender = normalizeEmployeeGender(emp.gender);
    const annualAllow = Number(emp.annual_allowance) || 20;
    const berAllow = Number(emp.bereavement_allowance) || 3;
    const matAllow =
      gender === "female" ? Number(emp.maternity_allowance) || 90 : 0;
    const patAllow =
      gender === "male" ? Number(emp.paternity_allowance) || 5 : 0;
    const annualCurrent = Number.isFinite(Number(emp.annual_current_balance))
      ? Number(emp.annual_current_balance)
      : annualAllow;
    const berCurrent = Number.isFinite(Number(emp.bereavement_current_balance))
      ? Number(emp.bereavement_current_balance)
      : berAllow;
    const matCurrent =
      gender === "female" &&
      Number.isFinite(Number(emp.maternity_current_balance))
        ? Number(emp.maternity_current_balance)
        : matAllow;
    const patCurrent =
      gender === "male" &&
      Number.isFinite(Number(emp.paternity_current_balance))
        ? Number(emp.paternity_current_balance)
        : patAllow;
    const annualUsed = Number.isFinite(Number(emp.annual_used))
      ? Number(emp.annual_used)
      : Math.max(0, annualAllow - annualCurrent);
    const berUsed = Number.isFinite(Number(emp.bereavement_used))
      ? Number(emp.bereavement_used)
      : Math.max(0, berAllow - berCurrent);
    const matUsed = Number.isFinite(Number(emp.maternity_used))
      ? Number(emp.maternity_used)
      : Math.max(0, matAllow - matCurrent);
    const patUsed = Number.isFinite(Number(emp.paternity_used))
      ? Number(emp.paternity_used)
      : Math.max(0, patAllow - patCurrent);
    const parentalCurrent = gender === "female" ? matCurrent : gender === "male" ? patCurrent : 0;
    const available =
      Math.round((annualCurrent + Math.max(0, berCurrent) + Math.max(0, parentalCurrent)) * 2) / 2;
    const annualPct =
      annualAllow > 0
        ? Math.min(100, (Math.max(0, annualAllow - annualCurrent) / annualAllow) * 100)
        : 0;
    const berPct =
      berAllow > 0
        ? Math.min(100, (Math.max(0, berAllow - berCurrent) / berAllow) * 100)
        : 0;
    const matPct =
      matAllow > 0
        ? Math.min(100, (Math.max(0, matAllow - matCurrent) / matAllow) * 100)
        : 0;
    const patPct =
      patAllow > 0
        ? Math.min(100, (Math.max(0, patAllow - patCurrent) / patAllow) * 100)
        : 0;
    return {
      gender,
      annualAllow,
      berAllow,
      matAllow,
      patAllow,
      annualCurrent,
      berCurrent,
      matCurrent,
      patCurrent,
      annualUsed,
      berUsed,
      matUsed,
      patUsed,
      available,
      annualPct,
      berPct,
      matPct,
      patPct,
    };
  };

  /** Stay on Balances — toggle which leave type column is focused (no tab switch). */
  const toggleBalanceFocus = (category: "annual" | "bereavement") => {
    setBalanceFocus((prev) => (prev === category ? "all" : category));
  };

  const filteredEmployees = useMemo(() => {
    let rows = employees;
    const term = deferredSearchName.trim().toLowerCase();
    if (term) {
      rows = rows.filter((emp) => {
        const fullName = getFullName(emp).toLowerCase();
        const pseudo = (emp.pseudonym || "").toLowerCase();
        const id = String(emp.id || "");
        return fullName.includes(term) || pseudo.includes(term) || id.includes(term);
      });
    }
    if (selectedDepartment) {
      rows = rows.filter(
        (emp) =>
          (emp.department_name || "").toLowerCase() === selectedDepartment.toLowerCase()
      );
    }
    if (employmentStatusFilter) {
      rows = rows.filter((emp) => employmentStatusKey(emp) === employmentStatusFilter);
    }
    if (lowBalanceOnly) {
      rows = rows.filter((emp) => balanceFor(emp).available < 4);
    }
    if (monthActiveIds) {
      rows = rows.filter((emp) => monthActiveIds.has(String(emp.id)));
    }
    return rows;
  }, [
    employees,
    deferredSearchName,
    selectedDepartment,
    employmentStatusFilter,
    lowBalanceOnly,
    monthActiveIds,
  ]);

  return (
    <OptionalAdminShell>
      <div className={`${adminStyles.page} ${styles.pageWhite}`}>
        <div className={`${adminStyles.inner} ${styles.pageWide}`}>
          <h1 className={adminStyles.title}>Leaves</h1>
          <p className={adminStyles.subtitle}>
            Requests, balances, and monthly summary — one place (scoped to your hierarchy).
          </p>

          <div className={styles.dashTabs} role="tablist" aria-label="Leave sections">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "requests"}
              className={`${styles.dashTab}${activeTab === "requests" ? ` ${styles.dashTabActive}` : ""}`}
              onClick={() => selectTab("requests")}
            >
              Requests
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "balances"}
              className={`${styles.dashTab}${activeTab === "balances" ? ` ${styles.dashTabActive}` : ""}`}
              onClick={() => selectTab("balances")}
            >
              Balances
              <span className={styles.dashTabCount}>{employees.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "summary"}
              className={`${styles.dashTab}${activeTab === "summary" ? ` ${styles.dashTabActive}` : ""}`}
              onClick={() => selectTab("summary")}
            >
              Summary
            </button>
          </div>

          {activeTab === "requests" ? <LeaveRequestsPanel /> : null}
          {activeTab === "summary" ? <LeaveSummaryPanel /> : null}

          {activeTab === "balances" ? (
            <>
              <p className={leaveStyles.subtitle} style={{ marginTop: 0 }}>
                Live annual and bereavement balances from the database. Click Annual or
                Bereavement to focus that column (click again for both).
              </p>
              <div className={leaveStyles.toolbar}>
                <div className={leaveStyles.searchWrap}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <circle cx="11" cy="11" r="7" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <input
                    type="search"
                    className={leaveStyles.toolbarSearch}
                    placeholder="Search by name, pseudo name, or ID"
                    value={searchName}
                    onChange={(e) => setSearchName(e.target.value)}
                    autoComplete="off"
                  />
                </div>
                <select
                  className={leaveStyles.toolbarSelect}
                  value={selectedDepartment}
                  onChange={(e) => setSelectedDepartment(e.target.value)}
                  aria-label="Filter by department"
                >
                  <option value="">All departments</option>
                  {departments.map((dept) => {
                    const name = dept.name || dept.department_name || "";
                    return (
                      <option key={dept.id} value={name}>
                        {name}
                      </option>
                    );
                  })}
                </select>
                <select
                  className={leaveStyles.toolbarSelect}
                  value={employmentStatusFilter}
                  onChange={(e) => setEmploymentStatusFilter(e.target.value)}
                  aria-label="Filter by employment status"
                >
                  <option value="">All statuses</option>
                  <option value="Confirmed">Confirmed</option>
                  <option value="Probation">Probation</option>
                </select>
                <label
                  className={`${leaveStyles.toggleChip}${lowBalanceOnly ? ` ${leaveStyles.toggleChipOn}` : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={lowBalanceOnly}
                    onChange={(e) => setLowBalanceOnly(e.target.checked)}
                  />
                  Low balance only (&lt; 4 days)
                </label>
                <input
                  type="month"
                  className={leaveStyles.toolbarSelect}
                  value={monthFilter}
                  onChange={(e) => setMonthFilter(e.target.value)}
                  aria-label="Filter by month"
                />
                {monthFilter ? (
                  <button
                    type="button"
                    className={leaveStyles.clearFilters}
                    onClick={() => setMonthFilter("")}
                  >
                    All months
                  </button>
                ) : null}
                <div className={styles.legend}>
                  <button
                    type="button"
                    className={`${styles.legendBtn}${balanceFocus === "annual" ? ` ${styles.legendBtnOn}` : ""}`}
                    onClick={() => toggleBalanceFocus("annual")}
                    title="Focus annual balances"
                  >
                    <i className={`${styles.legendDot} ${styles.legendAnnual}`} />
                    Annual
                  </button>
                  <button
                    type="button"
                    className={`${styles.legendBtn}${balanceFocus === "bereavement" ? ` ${styles.legendBtnOn}` : ""}`}
                    onClick={() => toggleBalanceFocus("bereavement")}
                    title="Focus bereavement balances"
                  >
                    <i className={`${styles.legendDot} ${styles.legendBer}`} />
                    Bereavement
                  </button>
                </div>
              </div>

              <div className={leaveStyles.reqTableShell}>
                <div className={leaveStyles.reqTableScroll}>
                  {loading ? (
                    <p className={leaveStyles.loading}>Loading employees…</p>
                  ) : (
                    <table className={`${leaveStyles.reqTable} ${leaveStyles.balTable}`}>
                      <thead>
                        <tr>
                          <th>ID</th>
                          <th>Employee</th>
                          <th>Department</th>
                          <th>Status</th>
                          {balanceFocus !== "bereavement" ? <th>Annual</th> : null}
                          {balanceFocus !== "annual" ? <th>Bereavement</th> : null}
                          {balanceFocus === "all" ? <th>Maternity / Paternity</th> : null}
                          <th>Available</th>
                          {canEditBalances ? <th>Action</th> : null}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredEmployees.length === 0 ? (
                          <tr>
                            <td
                              colSpan={
                                (balanceFocus === "all" ? 7 : 6) +
                                (canEditBalances ? 1 : 0)
                              }
                              className={leaveStyles.reqEmpty}
                            >
                              No employees match these filters.
                            </td>
                          </tr>
                        ) : (
                          filteredEmployees.map((emp) => {
                            const statusKey = employmentStatusKey(emp);
                            const bal = balanceFor(emp);
                            const focusAvail =
                              balanceFocus === "annual"
                                ? bal.annualCurrent
                                : balanceFocus === "bereavement"
                                  ? bal.berCurrent
                                  : bal.available;
                            const availClass =
                              focusAvail < 2
                                ? styles.availLow
                                : focusAvail < 5
                                  ? styles.availMid
                                  : "";
                            return (
                              <tr key={emp.id}>
                                <td className={leaveStyles.reqId}>{emp.id}</td>
                                <td>
                                  <div className={leaveStyles.personCell}>
                                    <EmployeeTableNameCell
                                      name={getFullName(emp)}
                                      employeeId={emp.id}
                                      photo={getPhoto(emp.id)}
                                      onOpen={() =>
                                        openFromRow({
                                          employee_id: emp.id,
                                          first_name: emp.first_name,
                                          last_name: emp.last_name,
                                          pseudonym: emp.pseudonym,
                                          department_name: emp.department_name,
                                        })
                                      }
                                    />
                                    {emp.pseudonym && emp.pseudonym !== "-" ? (
                                      <div className={leaveStyles.pseudoLine}>{emp.pseudonym}</div>
                                    ) : null}
                                  </div>
                                </td>
                                <td className={leaveStyles.sumDeptCell} title={emp.department_name || ""}>
                                  {emp.department_name || "—"}
                                </td>
                                <td>
                                  <span
                                    className={`${leaveStyles.badge} ${
                                      statusKey === "Confirmed"
                                        ? styles.badgeConfirmed
                                        : styles.badgeProbation
                                    }`}
                                  >
                                    {statusKey}
                                  </span>
                                </td>
                                {balanceFocus !== "bereavement" ? (
                                  <td>
                                    <div className={styles.equity}>
                                      <div className={styles.equityBar}>
                                        <div
                                          className={styles.segAnnual}
                                          style={{ width: `${bal.annualPct}%` }}
                                        />
                                      </div>
                                      <div className={styles.equityLabel}>
                                        <span>
                                          {formatLeaveDays(bal.annualCurrent)} /{" "}
                                          {formatLeaveDays(bal.annualAllow)}
                                        </span>
                                        <b>
                                          {formatLeaveDays(bal.annualUsed)} used
                                        </b>
                                      </div>
                                    </div>
                                  </td>
                                ) : null}
                                {balanceFocus !== "annual" ? (
                                  <td>
                                    <div className={styles.equity}>
                                      <div className={styles.equityBar}>
                                        <div
                                          className={styles.segBer}
                                          style={{ width: `${bal.berPct}%` }}
                                        />
                                      </div>
                                      <div className={styles.equityLabel}>
                                        <span>
                                          {formatLeaveDays(bal.berCurrent)} /{" "}
                                          {formatLeaveDays(bal.berAllow)}
                                        </span>
                                        <b>
                                          {formatLeaveDays(bal.berUsed)} used
                                        </b>
                                      </div>
                                    </div>
                                  </td>
                                ) : null}
                                {balanceFocus === "all" ? (
                                  <td>
                                    {bal.gender === "female" ? (
                                      <div className={styles.equity}>
                                        <div className={styles.equityBar}>
                                          <div
                                            className={styles.segAnnual}
                                            style={{ width: `${bal.matPct}%` }}
                                          />
                                        </div>
                                        <div className={styles.equityLabel}>
                                          <span>
                                            Mat {formatLeaveDays(bal.matCurrent)} /{" "}
                                            {formatLeaveDays(bal.matAllow)}
                                          </span>
                                          <b>
                                            {formatLeaveDays(bal.matUsed)} used
                                          </b>
                                        </div>
                                      </div>
                                    ) : bal.gender === "male" ? (
                                      <div className={styles.equity}>
                                        <div className={styles.equityBar}>
                                          <div
                                            className={styles.segBer}
                                            style={{ width: `${bal.patPct}%` }}
                                          />
                                        </div>
                                        <div className={styles.equityLabel}>
                                          <span>
                                            Pat {formatLeaveDays(bal.patCurrent)} /{" "}
                                            {formatLeaveDays(bal.patAllow)}
                                          </span>
                                          <b>
                                            {formatLeaveDays(bal.patUsed)} used
                                          </b>
                                        </div>
                                      </div>
                                    ) : (
                                      <span className={leaveStyles.reqEmpty}>—</span>
                                    )}
                                  </td>
                                ) : null}
                                <td>
                                  <span className={`${styles.availableCell} ${availClass}`}>
                                    {formatLeaveDays(focusAvail)}d
                                  </span>
                                </td>
                                {canEditBalances ? (
                                  <td>
                                    <button
                                      type="button"
                                      className={styles.editBtn}
                                      onClick={() => handleEdit(emp)}
                                    >
                                      Edit
                                    </button>
                                  </td>
                                ) : null}
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </>
          ) : null}

        {/* Edit Modal — HR Admin only */}
        {showModal && editingEmployee && canEditBalances ? (
          <ModalPortal>
          <div className={styles.modalOverlay} data-hrm-modal-overlay>
            <div className={styles.modal}>
              <h2 className={styles.modalTitle}>
                Update Leave Allowance
              </h2>
              <p className={styles.modalSubtitle}>
                {editingEmployee.first_name} {editingEmployee.last_name} ({editingEmployee.employment_status || "Permanent"})
              </p>

              <p className={styles.infoText}>
                Total Allowance: <strong>{editingEmployee.annual_allowance}</strong> Annual,{" "}
                <strong>{editingEmployee.bereavement_allowance}</strong> Bereavement
                {normalizeEmployeeGender(editingEmployee.gender) === "female" ? (
                  <>
                    , <strong>{editingEmployee.maternity_allowance ?? 90}</strong> Maternity
                  </>
                ) : null}
                {normalizeEmployeeGender(editingEmployee.gender) === "male" ? (
                  <>
                    , <strong>{editingEmployee.paternity_allowance ?? 5}</strong> Paternity
                  </>
                ) : null}{" "}
                (Fixed)
              </p>

              <div className={styles.currentBalances}>
                <div className={styles.balanceCard}>
                  <div className={styles.balanceLabel}>Current Annual Leave</div>
                  <div className={styles.balanceValue}>
                    <span className={styles.remaining}>{formatLeaveDays(editingEmployee.annual_current_balance)}</span>
                    <span className={styles.separator}>/</span>
                    <span className={styles.total}>{formatLeaveDays(editingEmployee.annual_allowance)}</span>
                  </div>
                </div>
                
                <div className={styles.balanceCard}>
                  <div className={styles.balanceLabel}>Current Bereavement Leave</div>
                  <div className={styles.balanceValue}>
                    <span className={styles.remaining}>{formatLeaveDays(editingEmployee.bereavement_current_balance)}</span>
                    <span className={styles.separator}>/</span>
                    <span className={styles.total}>{formatLeaveDays(editingEmployee.bereavement_allowance)}</span>
                  </div>
                </div>

                {normalizeEmployeeGender(editingEmployee.gender) === "female" ? (
                  <div className={styles.balanceCard}>
                    <div className={styles.balanceLabel}>Current Maternity Leave</div>
                    <div className={styles.balanceValue}>
                      <span className={styles.remaining}>
                        {formatLeaveDays(
                          editingEmployee.maternity_current_balance ??
                            editingEmployee.maternity_allowance ??
                            90,
                        )}
                      </span>
                      <span className={styles.separator}>/</span>
                      <span className={styles.total}>
                        {formatLeaveDays(editingEmployee.maternity_allowance ?? 90)}
                      </span>
                    </div>
                  </div>
                ) : null}

                {normalizeEmployeeGender(editingEmployee.gender) === "male" ? (
                  <div className={styles.balanceCard}>
                    <div className={styles.balanceLabel}>Current Paternity Leave</div>
                    <div className={styles.balanceValue}>
                      <span className={styles.remaining}>
                        {formatLeaveDays(
                          editingEmployee.paternity_current_balance ??
                            editingEmployee.paternity_allowance ??
                            5,
                        )}
                      </span>
                      <span className={styles.separator}>/</span>
                      <span className={styles.total}>
                        {formatLeaveDays(editingEmployee.paternity_allowance ?? 5)}
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className={styles.formGroup}>
                <label>Update Annual Current Balance</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={formData.annual_current_balance}
                  onChange={(e) => {
                    const raw = e.target.value.replace(",", ".");
                    if (!isLeaveDaysInput(raw)) return;
                    setFormData({ ...formData, annual_current_balance: raw });
                  }}
                  className={styles.input}
                />
                <div className={styles.helpText}>
                  {formatLeaveDelta(
                    parseLeaveDays(formData.annual_current_balance),
                    editingEmployee.annual_current_balance
                  ) ? (
                    <span
                      style={{
                        color:
                          parseLeaveDays(formData.annual_current_balance) >
                          editingEmployee.annual_current_balance
                            ? "#10b981"
                            : "#ef4444"
                      }}
                    >
                      {formatLeaveDelta(
                        parseLeaveDays(formData.annual_current_balance),
                        editingEmployee.annual_current_balance
                      )}
                    </span>
                  ) : (
                    <span>No change</span>
                  )}
                </div>
              </div>

              <div className={styles.formGroup}>
                <label>Update Bereavement Current Balance</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={formData.bereavement_current_balance}
                  onChange={(e) => {
                    const raw = e.target.value.replace(",", ".");
                    if (!isLeaveDaysInput(raw)) return;
                    setFormData({ ...formData, bereavement_current_balance: raw });
                  }}
                  className={styles.input}
                />
                <div className={styles.helpText}>
                  {formatLeaveDelta(
                    parseLeaveDays(formData.bereavement_current_balance),
                    editingEmployee.bereavement_current_balance
                  ) ? (
                    <span
                      style={{
                        color:
                          parseLeaveDays(formData.bereavement_current_balance) >
                          editingEmployee.bereavement_current_balance
                            ? "#10b981"
                            : "#ef4444"
                      }}
                    >
                      {formatLeaveDelta(
                        parseLeaveDays(formData.bereavement_current_balance),
                        editingEmployee.bereavement_current_balance
                      )}
                    </span>
                  ) : (
                    <span>No change</span>
                  )}
                </div>
              </div>

              {normalizeEmployeeGender(editingEmployee.gender) === "female" ? (
                <div className={styles.formGroup}>
                  <label>Update Maternity Current Balance</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={formData.maternity_current_balance}
                    onChange={(e) => {
                      const raw = e.target.value.replace(",", ".");
                      if (!isLeaveDaysInput(raw)) return;
                      setFormData({ ...formData, maternity_current_balance: raw });
                    }}
                    className={styles.input}
                  />
                  <div className={styles.helpText}>
                    {formatLeaveDelta(
                      parseLeaveDays(formData.maternity_current_balance),
                      editingEmployee.maternity_current_balance ??
                        editingEmployee.maternity_allowance ??
                        90,
                    ) ? (
                      <span
                        style={{
                          color:
                            parseLeaveDays(formData.maternity_current_balance) >
                            (editingEmployee.maternity_current_balance ??
                              editingEmployee.maternity_allowance ??
                              90)
                              ? "#10b981"
                              : "#ef4444",
                        }}
                      >
                        {formatLeaveDelta(
                          parseLeaveDays(formData.maternity_current_balance),
                          editingEmployee.maternity_current_balance ??
                            editingEmployee.maternity_allowance ??
                            90,
                        )}
                      </span>
                    ) : (
                      <span>No change</span>
                    )}
                  </div>
                </div>
              ) : null}

              {normalizeEmployeeGender(editingEmployee.gender) === "male" ? (
                <div className={styles.formGroup}>
                  <label>Update Paternity Current Balance</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={formData.paternity_current_balance}
                    onChange={(e) => {
                      const raw = e.target.value.replace(",", ".");
                      if (!isLeaveDaysInput(raw)) return;
                      setFormData({ ...formData, paternity_current_balance: raw });
                    }}
                    className={styles.input}
                  />
                  <div className={styles.helpText}>
                    {formatLeaveDelta(
                      parseLeaveDays(formData.paternity_current_balance),
                      editingEmployee.paternity_current_balance ??
                        editingEmployee.paternity_allowance ??
                        5,
                    ) ? (
                      <span
                        style={{
                          color:
                            parseLeaveDays(formData.paternity_current_balance) >
                            (editingEmployee.paternity_current_balance ??
                              editingEmployee.paternity_allowance ??
                              5)
                              ? "#10b981"
                              : "#ef4444",
                        }}
                      >
                        {formatLeaveDelta(
                          parseLeaveDays(formData.paternity_current_balance),
                          editingEmployee.paternity_current_balance ??
                            editingEmployee.paternity_allowance ??
                            5,
                        )}
                      </span>
                    ) : (
                      <span>No change</span>
                    )}
                  </div>
                </div>
              ) : null}

              <div className={styles.modalActions}>
                <button
                  className={styles.cancelBtn}
                  onClick={handleCancel}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  className={styles.saveBtn}
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>
          </div>
          </ModalPortal>
        ) : null}
        </div>
      </div>
      {popup}
    </OptionalAdminShell>
  );
}
