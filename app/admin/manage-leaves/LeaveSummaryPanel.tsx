"use client";

import React, { useEffect, useMemo, useState } from "react";
import leaveStyles from "../../leave/leave.module.css";
import { EmployeeTableNameCell } from "../../components/EmployeeTableNameCell";
import { useEmployeeDetailPopup } from "../../components/use-employee-detail-popup";

type StatusCardFilter = "" | "approved" | "rejected" | "pending" | "active";

export default function LeaveSummaryPanel() {
  const getCurrentMonth = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  };
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [showZeroActivity, setShowZeroActivity] = useState(false);
  const [statusCardFilter, setStatusCardFilter] = useState<StatusCardFilter>("");
  const [month, setMonth] = useState<string>(getCurrentMonth());
  const [leaveData, setLeaveData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { openFromRow, popup, getPhoto } = useEmployeeDetailPopup();

  useEffect(() => {
    if (!month) return;
    void fetchSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  const uniqueDepartments = useMemo(() => {
    return Array.from(new Set(leaveData.map((row) => row.department).filter(Boolean)));
  }, [leaveData]);

  async function fetchSummary() {
    setLoading(true);
    setError("");
    try {
      const empRes = await fetch("/api/employee-list");
      const empData = await empRes.json();
      if (!empData.success) throw new Error(empData.error || "Failed to fetch employees");
      const employees = empData.employees || [];

      const [year, monthNum] = month.split("-");
      const fromDate = `${year}-${monthNum}-01`;
      const toDate = new Date(Number(year), Number(monthNum), 0);
      const toDateStr = `${year}-${monthNum}-${String(toDate.getDate()).padStart(2, "0")}`;
      const leavesRes = await fetch(`/api/leaves?fromDate=${fromDate}&toDate=${toDateStr}`);
      const leavesData = await leavesRes.json();
      if (!leavesData.success) throw new Error(leavesData.error || "Failed to fetch leaves");
      const leaves = leavesData.leaves || [];

      const summary = employees.map((emp: any) => {
        const empLeaves = leaves.filter((l: any) => String(l.employee_id) === String(emp.id));
        const approved = empLeaves.filter((l: any) => l.status === "approved");
        const rejected = empLeaves.filter((l: any) => l.status === "rejected");
        const pending = empLeaves.filter((l: any) => l.status === "pending");
        const leaveTypes = Array.from(
          new Set(empLeaves.map((l: any) => l.leave_category).filter(Boolean)),
        ).join(", ");
        return {
          id: emp.id,
          employeeName: `${emp.first_name || ""} ${emp.last_name || ""}`.trim(),
          pseudonym: emp.pseudonym || "-",
          department: emp.department_name || "-",
          total: empLeaves.length,
          approved: approved.length,
          rejected: rejected.length,
          pending: pending.length,
          leaveTypes: leaveTypes || "-",
        };
      });
      setLeaveData(summary);
    } catch (e: any) {
      setError(e.message || "Failed to fetch data");
      setLeaveData([]);
    }
    setLoading(false);
  }

  const summaryStats = useMemo(() => {
    let approved = 0;
    let rejected = 0;
    let pending = 0;
    let withActivity = 0;
    leaveData.forEach((row) => {
      approved += Number(row.approved) || 0;
      rejected += Number(row.rejected) || 0;
      pending += Number(row.pending) || 0;
      if ((Number(row.total) || 0) > 0) withActivity += 1;
    });
    return {
      approved,
      rejected,
      pending,
      totalRequests: approved + rejected + pending,
      withActivity,
    };
  }, [leaveData]);

  const toggleStatusCard = (next: StatusCardFilter) => {
    setStatusCardFilter((prev) => (prev === next ? "" : next));
  };

  const visibleRows = useMemo(() => {
    const searchLower = search.toLowerCase();
    return leaveData.filter((row) => {
      const matchesSearch =
        !search ||
        row.employeeName.toLowerCase().includes(searchLower) ||
        String(row.id).includes(searchLower) ||
        (row.pseudonym || "").toLowerCase().includes(searchLower);
      const matchesDept = !departmentFilter || row.department === departmentFilter;
      if (!matchesSearch || !matchesDept) return false;
      if (!showZeroActivity && (Number(row.total) || 0) === 0) return false;
      if (statusCardFilter === "approved" && (Number(row.approved) || 0) === 0) return false;
      if (statusCardFilter === "rejected" && (Number(row.rejected) || 0) === 0) return false;
      if (statusCardFilter === "pending" && (Number(row.pending) || 0) === 0) return false;
      return true;
    });
  }, [leaveData, search, departmentFilter, showZeroActivity, statusCardFilter]);

  return (
    <>
      <p className={leaveStyles.subtitle} style={{ marginTop: 0 }}>
        Monthly activity per employee. Zero-activity rows are hidden by default.
      </p>

      <div className={leaveStyles.statRow}>
        <button
          type="button"
          className={`${leaveStyles.statCard} ${leaveStyles.statCardGold}${
            statusCardFilter === "pending" ? ` ${leaveStyles.statCardActive}` : ""
          }`}
          onClick={() => toggleStatusCard("pending")}
          aria-pressed={statusCardFilter === "pending"}
        >
          <p className={leaveStyles.statLabel}>Pending</p>
          <p className={leaveStyles.statValue}>{summaryStats.pending}</p>
          <p className={leaveStyles.statSub}>This month</p>
        </button>
        <button
          type="button"
          className={`${leaveStyles.statCard} ${leaveStyles.statCardGreen}${
            statusCardFilter === "approved" ? ` ${leaveStyles.statCardActive}` : ""
          }`}
          onClick={() => toggleStatusCard("approved")}
          aria-pressed={statusCardFilter === "approved"}
        >
          <p className={leaveStyles.statLabel}>Approved</p>
          <p className={leaveStyles.statValue}>{summaryStats.approved}</p>
          <p className={leaveStyles.statSub}>This month</p>
        </button>
        <button
          type="button"
          className={`${leaveStyles.statCard} ${leaveStyles.statCardRed}${
            statusCardFilter === "rejected" ? ` ${leaveStyles.statCardActive}` : ""
          }`}
          onClick={() => toggleStatusCard("rejected")}
          aria-pressed={statusCardFilter === "rejected"}
        >
          <p className={leaveStyles.statLabel}>Rejected</p>
          <p className={leaveStyles.statValue}>{summaryStats.rejected}</p>
          <p className={leaveStyles.statSub}>This month</p>
        </button>
        <button
          type="button"
          className={`${leaveStyles.statCard} ${leaveStyles.statCardPurple}${
            statusCardFilter === "" ? ` ${leaveStyles.statCardActive}` : ""
          }`}
          onClick={() => setStatusCardFilter("")}
          aria-pressed={statusCardFilter === ""}
        >
          <p className={leaveStyles.statLabel}>Total requests</p>
          <p className={leaveStyles.statValue}>{summaryStats.totalRequests}</p>
          <p className={leaveStyles.statSub}>{summaryStats.withActivity} with activity</p>
        </button>
      </div>

      <div className={leaveStyles.toolbar}>
        <input
          type="month"
          className={leaveStyles.toolbarSelect}
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          aria-label="Month"
        />
        <div className={leaveStyles.searchWrap}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="search"
            className={leaveStyles.toolbarSearch}
            placeholder="Search by name, ID, or pseudo name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoComplete="off"
          />
        </div>
        <select
          className={leaveStyles.toolbarSelect}
          value={departmentFilter}
          onChange={(e) => setDepartmentFilter(e.target.value)}
          aria-label="Filter by department"
        >
          <option value="">All departments</option>
          {uniqueDepartments.map((dept) => (
            <option key={dept} value={dept}>
              {dept}
            </option>
          ))}
        </select>
        <label
          className={`${leaveStyles.toggleChip}${showZeroActivity ? ` ${leaveStyles.toggleChipOn}` : ""}`}
        >
          <input
            type="checkbox"
            checked={showZeroActivity}
            onChange={(e) => setShowZeroActivity(e.target.checked)}
          />
          Show zero-activity
        </label>
      </div>

      <div className={leaveStyles.reqTableShell}>
        <div className={leaveStyles.reqTableScroll}>
          <table className={leaveStyles.reqTable}>
            <thead>
              <tr>
                <th>ID</th>
                <th>Employee</th>
                <th>Department</th>
                <th>Total</th>
                <th>Approved</th>
                <th>Rejected</th>
                <th>Pending</th>
                <th>Leave type</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className={leaveStyles.reqEmpty}>
                    Loading…
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={8} className={leaveStyles.reqEmpty} style={{ color: "#bc3a3a" }}>
                    {error}
                  </td>
                </tr>
              ) : visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className={leaveStyles.reqEmpty}>
                    No employees match these filters.
                  </td>
                </tr>
              ) : (
                visibleRows.map((row) => (
                  <tr key={row.id}>
                    <td className={leaveStyles.reqId}>{row.id}</td>
                    <td>
                      <div className={leaveStyles.personCell}>
                        <EmployeeTableNameCell
                          name={row.employeeName}
                          employeeId={row.id}
                          photo={getPhoto(row.id)}
                          onOpen={() =>
                            openFromRow({
                              employee_id: row.id,
                              employee_name: row.employeeName,
                              pseudonym: row.pseudonym,
                              department_name: row.department,
                            })
                          }
                        />
                        {row.pseudonym && row.pseudonym !== "-" ? (
                          <div className={leaveStyles.pseudoLine}>{row.pseudonym}</div>
                        ) : null}
                      </div>
                    </td>
                    <td>{row.department}</td>
                    <td className={leaveStyles.monoCell}>{row.total}</td>
                    <td className={leaveStyles.monoCell}>{row.approved}</td>
                    <td className={leaveStyles.monoCell}>{row.rejected}</td>
                    <td className={leaveStyles.monoCell}>{row.pending}</td>
                    <td>
                      {row.leaveTypes !== "-" ? (
                        <span className={`${leaveStyles.badge} ${leaveStyles.badgeType}`}>
                          {row.leaveTypes}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      {popup}
    </>
  );
}
