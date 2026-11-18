"use client";
import React, { useState, useEffect, useMemo } from "react";
import { FaFilter, FaSort, FaSortUp, FaSortDown } from "react-icons/fa";
import OptionalAdminShell from "@/app/components/OptionalAdminShell";
import styles from "../../break-summary/break-summary.module.css";
import adminStyles from "../admin-page.module.css";
import leaveStyles from "../../leave/leave.module.css";
import { EmployeeTableNameCell } from "../../components/EmployeeTableNameCell";
import { useEmployeeDetailPopup } from "../../components/use-employee-detail-popup";

type StatusCardFilter = "" | "approved" | "rejected" | "pending" | "active";

export default function MonthlyLeaveSummaryPage() {
  // Sorting logic and helpers must be inside the component
  type SortKey = "id" | "employeeName" | "pseudonym" | "department" | "total" | "approved" | "rejected" | "pending" | "leaveTypes";
  type SortDirection = "asc" | "desc";
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection } | null>(null);

  const handleSort = (key: SortKey) => {
    setSortConfig((prev) => {
      if (!prev || prev.key !== key) {
        return { key, direction: "asc" };
      }
      if (prev.direction === "asc") {
        return { key, direction: "desc" };
      }
      return null;
    });
  };

  const getSortIcon = (key: SortKey) => {
    if (!sortConfig || sortConfig.key !== key) {
      return <FaSort style={{ opacity: 0.75 }} />;
    }
    if (sortConfig.direction === "asc") {
      return <FaSortUp />;
    }
    return <FaSortDown />;
  };

  const sortButtonStyle: React.CSSProperties = {
    border: "none",
    background: "transparent",
    color: "#fff",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0",
    fontSize: "0.8rem",
  };

  const renderSortableHeader = (label: string, key: SortKey) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <button
          type="button"
          onClick={() => handleSort(key)}
          style={sortButtonStyle}
          title={`Sort ${label}`}
          aria-label={`Sort ${label}`}
        >
          <FaFilter />
        </button>
        <span>{label}</span>
      </div>
      <button
        type="button"
        onClick={() => handleSort(key)}
        style={sortButtonStyle}
        title={`Toggle sort direction for ${label}`}
        aria-label={`Toggle sort direction for ${label}`}
      >
        {getSortIcon(key)}
      </button>
    </div>
  );
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [showZeroActivity, setShowZeroActivity] = useState(false);
  const [statusCardFilter, setStatusCardFilter] = useState<StatusCardFilter>("");
  // Default to current month in yyyy-MM format
  const getCurrentMonth = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  };
  const [month, setMonth] = useState<string>(getCurrentMonth());

  const [leaveData, setLeaveData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { openFromRow, popup, getPhoto } = useEmployeeDetailPopup();

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
      employees: leaveData.length,
    };
  }, [leaveData]);

  const toggleStatusCard = (next: StatusCardFilter) => {
    setStatusCardFilter((prev) => (prev === next ? "" : next));
  };

  const visibleRows = useMemo(() => {
    const searchLower = search.toLowerCase();
    let rows = leaveData.filter((row) => {
      const matchesSearch =
        !search ||
        row.employeeName.toLowerCase().includes(searchLower) ||
        String(row.id).includes(searchLower) ||
        (row.pseudonym || "").toLowerCase().includes(searchLower);
      const matchesDept = !departmentFilter || row.department === departmentFilter;
      if (!matchesSearch || !matchesDept) return false;
      if (!showZeroActivity && (Number(row.total) || 0) === 0) return false;
      if (statusCardFilter === "active" && (Number(row.total) || 0) === 0) return false;
      if (statusCardFilter === "approved" && (Number(row.approved) || 0) === 0) return false;
      if (statusCardFilter === "rejected" && (Number(row.rejected) || 0) === 0) return false;
      if (statusCardFilter === "pending" && (Number(row.pending) || 0) === 0) return false;
      return true;
    });
    if (sortConfig) {
      const key = sortConfig.key;
      rows = [...rows].sort((a, b) => {
        let comparison = 0;
        if (key === "employeeName" || key === "pseudonym" || key === "department" || key === "leaveTypes") {
          comparison = String(a[key]).localeCompare(String(b[key]), undefined, { sensitivity: "base" });
        } else {
          comparison = Number(a[key]) - Number(b[key]);
        }
        return sortConfig.direction === "asc" ? comparison : -comparison;
      });
    }
    return rows;
  }, [leaveData, search, departmentFilter, showZeroActivity, statusCardFilter, sortConfig]);

  useEffect(() => {
    if (!month) return;
    fetchSummary();
  }, [month]);

  // Unique departments for filter dropdown
  const uniqueDepartments = React.useMemo(() => {
    return Array.from(new Set(leaveData.map((row) => row.department).filter(Boolean)));
  }, [leaveData]);

  async function fetchSummary() {
    setLoading(true);
    setError("");
    try {
      // 1. Fetch all employees
      const empRes = await fetch("/api/employee-list");
      const empData = await empRes.json();
      if (!empData.success) throw new Error(empData.error || "Failed to fetch employees");
      const employees = empData.employees || [];

      // 2. Fetch all leaves for the selected month
      const [year, monthNum] = month.split("-");
      const fromDate = `${year}-${monthNum}-01`;
      const toDate = new Date(Number(year), Number(monthNum), 0); // last day of month
      const toDateStr = `${year}-${monthNum}-${String(toDate.getDate()).padStart(2, "0")}`;
      const leavesRes = await fetch(`/api/leaves?fromDate=${fromDate}&toDate=${toDateStr}`);
      const leavesData = await leavesRes.json();
      if (!leavesData.success) throw new Error(leavesData.error || "Failed to fetch leaves");
      const leaves = leavesData.leaves || [];

      // 3. Aggregate leave data per employee
      const summary = employees.map((emp: any) => {
        const empLeaves = leaves.filter((l: any) => String(l.employee_id) === String(emp.id));
        const approved = empLeaves.filter((l: any) => l.status === "approved");
        const rejected = empLeaves.filter((l: any) => l.status === "rejected");
        const pending = empLeaves.filter((l: any) => l.status === "pending");
        const leaveTypes = Array.from(new Set(empLeaves.map((l: any) => l.leave_category))).join(", ");
        return {
          id: emp.id,
          employeeName: `${emp.first_name} ${emp.last_name}`,
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

  return (
    <OptionalAdminShell>
      <div className={adminStyles.page}>
        <div className={adminStyles.inner}>
          <h1 className={adminStyles.title}>Leave summary</h1>
          <p className={adminStyles.subtitle}>
            Monthly leave totals by employee — approved, pending, and rejected.
          </p>
          <div className={styles.breakSummaryContainer} style={{ position: "relative", margin: 0 }}>
        <div className={styles.breakSummaryFilters} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
              <label style={{ fontWeight: 650, color: "#475569", fontSize: 13 }}>Month</label>
              <input
                type="month"
                value={month}
                onChange={e => setMonth(e.target.value)}
                className={styles.breakSummaryInput}
                style={{ width: 180, fontSize: 15 }}
              />
              <input
                type="text"
                placeholder="Search by name, ID or P.Name..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className={styles.breakSummaryInput}
                style={{ width: 220, fontSize: 15 }}
              />
              <select
                value={departmentFilter}
                onChange={e => setDepartmentFilter(e.target.value)}
                className={styles.breakSummaryInput}
                style={{ width: 180, fontSize: 15 }}
              >
                <option value="">All Departments</option>
                {uniqueDepartments.map((dept) => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14, color: '#475569' }}>
                <input
                  type="checkbox"
                  checked={showZeroActivity}
                  onChange={(e) => setShowZeroActivity(e.target.checked)}
                />
                Show zero-activity
              </label>
        </div>

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
            <p className={leaveStyles.statSub}>Employees with pending</p>
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
              statusCardFilter === "active" || statusCardFilter === ""
                ? ` ${leaveStyles.statCardActive}`
                : ""
            }`}
            onClick={() => setStatusCardFilter("")}
            aria-pressed={statusCardFilter === ""}
          >
            <p className={leaveStyles.statLabel}>Total requests</p>
            <p className={leaveStyles.statValue}>{summaryStats.totalRequests}</p>
            <p className={leaveStyles.statSub}>
              {summaryStats.withActivity} with activity
            </p>
          </button>
        </div>

        <div className={styles.breakSummaryTableWrapper} style={{ overflowY: "auto", maxHeight: "74vh" }}>
          <table className={styles.breakSummaryTable} style={{ minWidth: 900 }}>
            <thead style={{ position: "sticky", top: 0, zIndex: 12 }}>
              <tr>
                <th>{renderSortableHeader("ID", "id")}</th>
                <th>{renderSortableHeader("Employee", "employeeName")}</th>
                <th>{renderSortableHeader("P.Name", "pseudonym")}</th>
                <th>{renderSortableHeader("Department", "department")}</th>
                <th>{renderSortableHeader("Total Leaves", "total")}</th>
                <th>{renderSortableHeader("Approved", "approved")}</th>
                <th>{renderSortableHeader("Rejected", "rejected")}</th>
                <th>{renderSortableHeader("Pending", "pending")}</th>
                <th>{renderSortableHeader("Leave Types", "leaveTypes")}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className={styles.breakSummaryNoRecords}>Loading...</td></tr>
              ) : error ? (
                <tr><td colSpan={9} className={styles.breakSummaryNoRecords} style={{ color: 'red' }}>{error}</td></tr>
              ) : visibleRows.length === 0 ? (
                <tr><td colSpan={9} className={styles.breakSummaryNoRecords}>No employees match these filters.</td></tr>
              ) : (
                visibleRows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.id}</td>
                      <td>
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
                      </td>
                      <td>{row.pseudonym}</td>
                      <td>{row.department}</td>
                      <td>{row.total}</td>
                      <td>{row.approved}</td>
                      <td>{row.rejected}</td>
                      <td>{row.pending}</td>
                      <td>{row.leaveTypes}</td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
          </div>
        </div>
      </div>
      {popup}
    </OptionalAdminShell>
  );
}
