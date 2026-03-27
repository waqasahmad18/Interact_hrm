"use client";

import React, { useEffect, useMemo, useState } from "react";
import LayoutDashboard from "../../layout-dashboard";
import styles from "../../break-summary/break-summary.module.css";
import { FaFileExcel } from "react-icons/fa";
import {
  getDateStringInTimeZone,
  getTimeStringInTimeZone,
  SERVER_TIMEZONE,
} from "../../../lib/timezone";

function getLocalDateString(date: Date = new Date()) {
  return getDateStringInTimeZone(date, SERVER_TIMEZONE);
}

function getCurrentMonthStartDateString(date: Date = new Date()) {
  const todayInTz = getDateStringInTimeZone(date, SERVER_TIMEZONE);
  if (!todayInTz) return "";
  return `${todayInTz.slice(0, 7)}-01`;
}

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600).toString().padStart(2, "0");
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${h}h ${m}m ${s}s`;
}

function getEmployeeGroupingKey(record: any) {
  return (
    (record.employee_id ?? record.employeeId ?? "").toString() ||
    record.employee_name ||
    record.name ||
    record.username ||
    ""
  );
}

function getSessionGroupingKey(record: any) {
  const employeeKey = getEmployeeGroupingKey(record);
  const attendanceSessionId = record.attendance_session_id ?? record.attendanceSessionId;
  if (attendanceSessionId !== undefined && attendanceSessionId !== null && attendanceSessionId !== "") {
    return `${employeeKey}|attendance:${attendanceSessionId}`;
  }
  if (record.shift_assignment_id !== undefined && record.shift_assignment_id !== null && record.shift_assignment_id !== "") {
    return `${employeeKey}|shift:${record.shift_assignment_id}`;
  }
  return `${employeeKey}|fallback:${record.id ?? record.break_start ?? "unknown"}`;
}

export default function BreakSummaryPage() {
  const [breaks, setBreaks] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("");
  const [fromDate, setFromDate] = useState(() => getCurrentMonthStartDateString());
  const [toDate, setToDate] = useState(getLocalDateString());
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    fetch("/api/departments")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.departments) setDepartments(data.departments);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (fromDate) params.append("fromDate", fromDate);
    if (toDate) params.append("toDate", toDate);
    fetch(`/api/breaks?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => setBreaks(data.success ? (data.breaks || []) : []))
      .catch(() => setBreaks([]));
  }, [fromDate, toDate]);

  useEffect(() => {
    const hasRunning = breaks.some((b) => b.break_start && !b.break_end);
    if (!hasRunning) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [breaks]);

  const filteredBreaks = useMemo(
    () =>
      breaks.filter((b) => {
        if (search && !(b.employee_name || "").toLowerCase().includes(search.toLowerCase())) return false;
        if (department && b.department_name !== department) return false;
        return true;
      }),
    [breaks, search, department]
  );

  const dailyBreakTotals = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of filteredBreaks) {
      if (!b.break_start) continue;
      const start = new Date(b.break_start);
      const end = b.break_end ? new Date(b.break_end) : new Date(now);
      const seconds = Math.floor((end.getTime() - start.getTime()) / 1000);
      const key = getSessionGroupingKey(b);
      map.set(key, (map.get(key) || 0) + Math.max(0, seconds));
    }
    return map;
  }, [filteredBreaks, now]);

  const rows = useMemo(
    () =>
      filteredBreaks.map((b) => {
        const isRunning = b.break_start && !b.break_end;
        const start = b.break_start ? new Date(b.break_start).getTime() : 0;
        const end = b.break_end ? new Date(b.break_end).getTime() : now;
        const sessionSeconds = b.break_start ? Math.max(0, Math.floor((end - start) / 1000)) : 0;
        const key = getSessionGroupingKey(b);
        const dailySeconds = dailyBreakTotals.get(key) || sessionSeconds;
        const dailyExceed = dailySeconds > 3600 ? dailySeconds - 3600 : 0;
        return {
          ...b,
          date_display: b.date ? getDateStringInTimeZone(b.date, SERVER_TIMEZONE) : (b.break_start ? getDateStringInTimeZone(b.break_start, SERVER_TIMEZONE) : ""),
          break_start_display: b.break_start ? getTimeStringInTimeZone(b.break_start, SERVER_TIMEZONE) : "",
          break_end_display: b.break_end ? getTimeStringInTimeZone(b.break_end, SERVER_TIMEZONE) : (isRunning ? "🔴 Running" : ""),
          total_break_time: formatDuration(sessionSeconds),
          total_break_time_today: formatDuration(dailySeconds),
          exceed_today: dailyExceed > 0 ? formatDuration(dailyExceed) : "",
        };
      }),
    [filteredBreaks, dailyBreakTotals, now]
  );

  const downloadCSV = () => {
    const headers = ["Id", "Full Name", "P.Name", "Department", "Date", "Break Start", "Break End", "Total Break Time", "Total Break", "Exceed"];
    let csv = headers.join(",    ") + "\n";
    rows.forEach((row) => {
      csv += [
        row.employee_id,
        row.employee_name || "",
        row.pseudonym || "-",
        row.department_name || "-",
        row.date_display,
        row.break_start_display,
        row.break_end_display,
        row.total_break_time,
        row.total_break_time_today,
        row.exceed_today,
      ].join(",    ") + "\n";
    });
    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "break_summary.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  return (
    <LayoutDashboard>
      <div style={{ width: "100%", minHeight: "calc(100vh - 20px)", background: "linear-gradient(135deg, #6a82fb 0%, #fc5c7d 100%)", paddingBottom: 24 }}>
        <h1 style={{ marginTop: 24, marginBottom: 24, color: "#fff", fontWeight: 700, fontSize: "1.75rem" }}>Break Summary</h1>
        <div className={styles.breakSummaryContainer}>
          <div className={styles.breakSummaryFilters}>
            <input type="text" placeholder="Search employee..." value={search} onChange={(e) => setSearch(e.target.value)} className={styles.breakSummaryInput} style={{ width: 180 }} />
            <select value={department} onChange={(e) => setDepartment(e.target.value)} className={styles.breakSummaryDate} style={{ width: 180 }}>
              <option value="">All Departments</option>
              {departments.map((dept) => <option key={dept.id} value={dept.name}>{dept.name}</option>)}
            </select>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={styles.breakSummaryDate} />
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className={styles.breakSummaryDate} />
            <button onClick={downloadCSV} className={styles.breakSummaryXLSButton} title="Download XLS">
              <FaFileExcel size={20} />
              <span>Export XLS</span>
            </button>
          </div>
          <div className={`${styles.breakSummaryTableWrapper} ${styles.timeSummaryTableWrapper}`} style={{ width: "100%", overflowX: "auto" }}>
            <table className={`${styles.breakSummaryTable} ${styles.timeSummaryStickyTable}`}>
              <thead>
                <tr style={{ background: "linear-gradient(135deg, #0052CC 0%, #00B8A9 100%)", color: "#fff" }}>
                  <th>Id</th><th>Full Name</th><th>P.Name</th><th>Department</th><th>Date</th><th>Break Start</th><th>Break End</th><th>Total Break Time</th><th>Total Break</th><th>Exceed</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={10} className={styles.breakSummaryNoRecords}>No records found.</td></tr>
                ) : rows.map((b, idx) => (
                  <tr key={b.id || idx}>
                    <td>{b.employee_id}</td>
                    <td>{b.employee_name || ""}</td>
                    <td>{b.pseudonym || "-"}</td>
                    <td>{b.department_name || "-"}</td>
                    <td>{b.date_display}</td>
                    <td>{b.break_start_display}</td>
                    <td>{b.break_end_display}</td>
                    <td>{b.total_break_time}</td>
                    <td>{b.total_break_time_today}</td>
                    <td style={{ color: b.exceed_today ? "#e74c3c" : undefined }}>{b.exceed_today}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </LayoutDashboard>
  );
}

