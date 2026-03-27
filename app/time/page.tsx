"use client";
import React, { useEffect, useState } from "react";
import LayoutDashboard from "../layout-dashboard";
import styles from "../break-summary/break-summary.module.css";
import attStyles from "../attendance-summary/attendance-summary.module.css";
import { FaFileExcel } from "react-icons/fa";
import {
  getDateStringInTimeZone,
  getTimeStringInTimeZone,
  SERVER_TIMEZONE,
} from "../../lib/timezone";
import { compareAttendanceRows } from "../../lib/attendance-sort";

// Helper to format duration in hh:mm:ss
function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600).toString().padStart(2, "0");
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${h}h ${m}m ${s}s`;
}

// Helper to format total hours (with dynamic timer support)
function formatTotalHours(clockIn: string, clockOut: string, currentTime?: number) {
  if (!clockIn) return "00h 00m 00s";
  const start = new Date(clockIn).getTime();
  let end: number;
  if (clockOut) {
    end = new Date(clockOut).getTime();
  } else {
    // Use current time for running attendance
    end = currentTime || Date.now();
  }
  const totalSeconds = Math.floor((end - start) / 1000);
  const h = Math.floor(totalSeconds / 3600).toString().padStart(2, "0");
  const m = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, "0");
  const s = (totalSeconds % 60).toString().padStart(2, "0");
  return `${h}h ${m}m ${s}s`;
}

// Helper to format late minutes
function formatLateTime(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

// Helper to format dates without timezone shift
function formatDateOnly(dateValue: string | null | undefined) {
  if (!dateValue) return "";
  const dateOnlyMatch = /^\d{4}-\d{2}-\d{2}$/.exec(dateValue);
  if (dateOnlyMatch) return dateValue;
  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) return dateValue;
  return getDateStringInTimeZone(parsed, SERVER_TIMEZONE);
}

function getLocalDateString(date: Date = new Date()) {
  return getDateStringInTimeZone(date, SERVER_TIMEZONE);
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

function getSessionGroupingKey(
  record: any,
  startField: "break_start" | "prayer_break_start"
) {
  const employeeKey = getEmployeeGroupingKey(record);
  const attendanceSessionId =
    record.attendance_session_id ?? record.attendanceSessionId;

  if (
    attendanceSessionId !== undefined &&
    attendanceSessionId !== null &&
    attendanceSessionId !== ""
  ) {
    return `${employeeKey}|attendance:${attendanceSessionId}`;
  }

  if (
    record.shift_assignment_id !== undefined &&
    record.shift_assignment_id !== null &&
    record.shift_assignment_id !== ""
  ) {
    return `${employeeKey}|shift:${record.shift_assignment_id}`;
  }

  return `${employeeKey}|fallback:${record.id ?? record[startField] ?? "unknown"}`;
}

export default function TimePage() {
  const [activeTab, setActiveTab] = useState("break");
  const [breaks, setBreaks] = useState<any[]>([]);
  const [prayerBreaks, setPrayerBreaks] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [breakSearch, setBreakSearch] = useState("");
  const [breakFromDate, setBreakFromDate] = useState("");
  const [breakToDate, setBreakToDate] = useState(getLocalDateString());
  const [breakDepartment, setBreakDepartment] = useState("");
  const [prayerSearch, setPrayerSearch] = useState("");
  const [prayerFromDate, setPrayerFromDate] = useState("");
  const [prayerToDate, setPrayerToDate] = useState(getLocalDateString());
  const [prayerDepartment, setPrayerDepartment] = useState("");
  const [attSearch, setAttSearch] = useState("");
  const [attFromDate, setAttFromDate] = useState("");
  const [attToDate, setAttToDate] = useState(getLocalDateString());
  const [attDepartment, setAttDepartment] = useState("");
  // For live timer
  const [now, setNow] = useState(Date.now());

  const isInRange = (dateStr: string | null | undefined, fromDate?: string, toDate?: string) => {
    if (!dateStr) return false;
    const dateOnly = getDateStringInTimeZone(dateStr, SERVER_TIMEZONE);
    if (fromDate && dateOnly < fromDate) return false;
    if (toDate && dateOnly > toDate) return false;
    return true;
  };

  // Update timer every second if any running breaks exist
  useEffect(() => {
    const hasRunningBreak = breaks.some(b => b.break_start && !b.break_end);
    const hasRunningPrayer = prayerBreaks.some(p => p.prayer_break_start && !p.prayer_break_end);
    const hasRunningAttendance = attendance.some(a => a.clock_in && !a.clock_out);
    if (!hasRunningBreak && !hasRunningPrayer && !hasRunningAttendance) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [breaks, prayerBreaks, attendance]);

  // Fetch departments
  useEffect(() => {
    fetch('/api/departments')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.departments) {
          setDepartments(data.departments);
        }
      })
      .catch(err => console.error('Error fetching departments:', err));
  }, []);

  // Fetch breaks
  useEffect(() => {
    let url = "/api/breaks";
    const params = new URLSearchParams();
    if (breakFromDate) params.append("fromDate", breakFromDate);
    if (breakToDate) params.append("toDate", breakToDate);
    if (params.toString()) url += `?${params.toString()}`;
    fetch(url)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          const filtered = (data.breaks || []).filter((b: any) =>
            isInRange(b.date || b.break_start, breakFromDate, breakToDate)
          );
          setBreaks(filtered);
        }
        else setBreaks([]);
      });
  }, [breakFromDate, breakToDate]);

  // Fetch prayer breaks
  useEffect(() => {
    let url = "/api/prayer_breaks";
    const params = new URLSearchParams();
    if (prayerFromDate) params.append("fromDate", prayerFromDate);
    if (prayerToDate) params.append("toDate", prayerToDate);
    if (params.toString()) url += `?${params.toString()}`;
    fetch(url)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          const filtered = (data.prayer_breaks || []).filter((p: any) =>
            isInRange(p.date || p.prayer_break_start, prayerFromDate, prayerToDate)
          );
          setPrayerBreaks(filtered);
        }
        else setPrayerBreaks([]);
      });
  }, [prayerFromDate, prayerToDate]);

  // Fetch attendance
  useEffect(() => {
    let url = "/api/attendance";
    const params = new URLSearchParams();
    if (attFromDate) params.append("fromDate", attFromDate);
    if (attToDate) params.append("toDate", attToDate);
    if (params.toString()) url += `?${params.toString()}`;
    fetch(url)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          const filtered = (data.attendance || []).filter((a: any) =>
            isInRange(a.clock_in || a.date, attFromDate, attToDate)
          );
          setAttendance(filtered);
        }
        else setAttendance([]);
      });
  }, [attFromDate, attToDate]);

  // Filter breaks
  const filteredBreaks = breaks.filter(b => {
    if (breakSearch && !(b.employee_name || "").toLowerCase().includes(breakSearch.toLowerCase())) return false;
    if (breakDepartment && b.department_name !== breakDepartment) return false;
    return true;
  });

  // Filter prayer breaks
  const filteredPrayerBreaks = prayerBreaks.filter(p => {
    if (prayerSearch && !(p.employee_name || "").toLowerCase().includes(prayerSearch.toLowerCase())) return false;
    if (prayerDepartment && p.department_name !== prayerDepartment) return false;
    return true;
  });

  // Filter and sort attendance (running sessions first, then latest activity)
  const filteredAttendance = attendance
    .filter(a => {
      if (attSearch && !(a.employee_name || "").toLowerCase().includes(attSearch.toLowerCase())) return false;
      if (attDepartment && a.department_name !== attDepartment) return false;
      return true;
    })
    .sort(compareAttendanceRows);

  // Aggregate all breaks per employee per attendance session (fallback to shift assignment)
  const dailyBreakTotals = (() => {
    const map = new Map<string, number>();
    for (const b of filteredBreaks) {
      if (!b.break_start) continue;
      const start = new Date(b.break_start);
      const end = b.break_end ? new Date(b.break_end) : new Date(now);
      const seconds = Math.floor((end.getTime() - start.getTime()) / 1000);
      const key = getSessionGroupingKey(b, "break_start");
      map.set(key, (map.get(key) || 0) + Math.max(0, seconds));
    }
    return map;
  })();

  // Map breaks data with both per-session and daily totals (including running breaks)
  const breakRows = filteredBreaks.map(b => {
    let sessionSeconds = 0;
    const isRunning = b.break_start && !b.break_end;
    if (b.break_start) {
      const start = new Date(b.break_start).getTime();
      const end = b.break_end ? new Date(b.break_end).getTime() : now;
      sessionSeconds = Math.floor((end - start) / 1000);
    }
    const sessionExceed = sessionSeconds > 3600 ? sessionSeconds - 3600 : 0;
    const key = getSessionGroupingKey(b, "break_start");
    const dailySeconds = dailyBreakTotals.get(key) || sessionSeconds;
    const dailyExceed = dailySeconds > 3600 ? dailySeconds - 3600 : 0;
    return {
      ...b,
      employee_name: b.employee_name || b.name || b.username || "",
      break_end_display: b.break_end ? getTimeStringInTimeZone(b.break_end, SERVER_TIMEZONE) : (isRunning ? "🔴 Running" : ""),
      break_start_display: b.break_start ? getTimeStringInTimeZone(b.break_start, SERVER_TIMEZONE) : "",
      total_break_time: formatDuration(sessionSeconds),
      total_break_time_today: formatDuration(dailySeconds),
      exceed: sessionExceed > 0 ? formatDuration(sessionExceed) : "",
      exceed_today: dailyExceed > 0 ? formatDuration(dailyExceed) : "",
      date_display: b.date ? getDateStringInTimeZone(b.date, SERVER_TIMEZONE) : (b.break_start ? getDateStringInTimeZone(b.break_start, SERVER_TIMEZONE) : ""),
      isRunning: isRunning
    };
  });

  // Map prayer breaks data (including running prayer breaks)
  const dailyPrayerTotals = (() => {
    const map = new Map<string, number>();
    for (const p of filteredPrayerBreaks) {
      if (!p.prayer_break_start) continue;
      const start = new Date(p.prayer_break_start);
      const end = p.prayer_break_end ? new Date(p.prayer_break_end) : new Date(now);
      const seconds = Math.floor((end.getTime() - start.getTime()) / 1000);
      const key = getSessionGroupingKey(p, "prayer_break_start");
      map.set(key, (map.get(key) || 0) + Math.max(0, seconds));
    }
    return map;
  })();

  // Map prayer breaks data with daily totals (including running prayer breaks)
  const prayerRows = filteredPrayerBreaks.map(p => {
    let sessionSeconds = 0;
    const isRunning = p.prayer_break_start && !p.prayer_break_end;
    if (p.prayer_break_start) {
      const start = new Date(p.prayer_break_start).getTime();
      const end = p.prayer_break_end ? new Date(p.prayer_break_end).getTime() : now;
      sessionSeconds = Math.floor((end - start) / 1000);
    }
    const sessionExceed = sessionSeconds > 1800 ? sessionSeconds - 1800 : 0;
    const key = getSessionGroupingKey(p, "prayer_break_start");
    const dailySeconds = dailyPrayerTotals.get(key) || sessionSeconds;
    const dailyExceed = dailySeconds > 1800 ? dailySeconds - 1800 : 0;
    return {
      ...p,
      employee_name: p.employee_name || p.name || p.username || "",
      prayer_start_display: p.prayer_break_start ? getTimeStringInTimeZone(p.prayer_break_start, SERVER_TIMEZONE) : "",
      prayer_end_display: p.prayer_break_end ? getTimeStringInTimeZone(p.prayer_break_end, SERVER_TIMEZONE) : (isRunning ? "🔴 Running" : ""),
      total_prayer_time: formatDuration(sessionSeconds),
      total_prayer_time_today: formatDuration(dailySeconds),
      exceed: sessionExceed > 0 ? formatDuration(sessionExceed) : "",
      exceed_today: dailyExceed > 0 ? formatDuration(dailyExceed) : "",
      date_display: p.date ? getDateStringInTimeZone(p.date, SERVER_TIMEZONE) : (p.prayer_break_start ? getDateStringInTimeZone(p.prayer_break_start, SERVER_TIMEZONE) : ""),
      isRunning: isRunning
    };
  });

  const downloadBreaksCSV = () => {
    const headers = [
      "Id",
      "Full Name",
      "P.Name",
      "Department",
      "Date",
      "Break Start",
      "Break End",
      "Total Break Time",
      "Total Break",
      "Exceed"
    ];
    let csv = headers.join(',    ') + '\n';
    breakRows.forEach(row => {
      csv += [
        row.employee_id,
        row.employee_name,
        row.pseudonym || '-',
        row.department_name || '-',
        row.date_display,
        row.break_start_display,
        row.break_end_display,
        row.total_break_time,
        row.total_break_time_today,
        row.exceed_today
      ].join(',    ') + '\n';
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'break_summary.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const downloadPrayerCSV = () => {
    const headers = [
      "Id",
      "Full Name",
      "P.Name",
      "Department",
      "Date",
      "Prayer Start",
      "Prayer End",
      "Total Prayer Time",
      "Total Prayer",
      "Exceed"
    ];
    let csv = headers.join(',    ') + '\n';
    prayerRows.forEach(row => {
      csv += [
        row.employee_id,
        row.employee_name,
        row.pseudonym || '-',
        row.department_name || '-',
        row.date_display,
        row.prayer_start_display,
        row.prayer_end_display,
        row.total_prayer_time,
        row.total_prayer_time_today,
        row.exceed_today
      ].join(',    ') + '\n';
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'prayer_break_summary.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const downloadAttendanceCSV = () => {
    const headers = [
      "Id",
      "Full Name",
      "P.Name",
      "Department",
      "Date",
      "Clock In",
      "Clock Out",
      "Total Hours",
      "Late"
    ];
    let csv = headers.join(',    ') + '\n';
    filteredAttendance.forEach(row => {
      const date = row.date ? getDateStringInTimeZone(row.date, SERVER_TIMEZONE) : "";
      const clockIn = row.clock_in ? getTimeStringInTimeZone(row.clock_in, SERVER_TIMEZONE) : "";
      const clockOut = row.clock_out ? getTimeStringInTimeZone(row.clock_out, SERVER_TIMEZONE) : "";
      const totalHours = formatTotalHours(row.clock_in, row.clock_out, now);
      csv += [
        row.employee_id,
        row.employee_name || "",
        row.pseudonym || '-',
        row.department_name || '-',
        date,
        clockIn,
        clockOut,
        totalHours,
        row.late || ''
      ].join(',    ') + '\n';
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'attendance_summary.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const tabStyles: React.CSSProperties = {
    display: "flex",
    gap: "12px",
    marginBottom: "28px",
    paddingBottom: "0",
    borderBottom: 'none',
  };

  const tabButtonStyles = (isActive: boolean): React.CSSProperties => ({
    padding: "12px 24px",
    border: "none",
    background: isActive ? "linear-gradient(135deg, #0052CC 0%, #00B8A9 100%)" : "transparent",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: isActive ? "600" : "500",
    color: "#fff",
    borderRadius: isActive ? "8px 8px 0 0" : "0",
    marginBottom: "-2px",
    transition: "all 0.3s",
    boxShadow: isActive ? "0 -2px 8px rgba(0,82,204,0.15)" : "none",
  });

  // Sort/filter state for each table
  const [breakSortKey, setBreakSortKey] = useState("");
  const [breakSortDir, setBreakSortDir] = useState("asc");
  const [prayerSortKey, setPrayerSortKey] = useState("");
  const [prayerSortDir, setPrayerSortDir] = useState("asc");
  const [attSortKey, setAttSortKey] = useState("");
  const [attSortDir, setAttSortDir] = useState("asc");

  // Icon helpers
  const sortButtonStyle = { background: "none", border: "none", cursor: "pointer", padding: 0, margin: 0, color: "#fff" };
  const getSortIcon = (dir: string) => dir === "asc" ? "▲" : "▼";
  const renderHeaderCell = (label: string, key: string, sortKey: string, sortDir: string, setSortKey: any, setSortDir: any) => (
    <div style={{ display: "grid", gridTemplateColumns: "28px 1fr", alignItems: "center", gap: 4, width: "100%" }}>
      <button
        type="button"
        onClick={() => {
          if (sortKey === key) {
            setSortDir(sortDir === "asc" ? "desc" : "asc");
          } else {
            setSortKey(key);
            setSortDir("asc");
          }
        }}
        style={sortButtonStyle}
        title={`Sort by ${label}`}
      >
        {sortKey === key ? getSortIcon(sortDir) : "⇅"}
      </button>
      <span>{label}</span>
    </div>
  );

  // Sorting logic
  // Improved sorting logic by column type
  const sortRows = (rows: any[], key: string, dir: string) => {
    if (!key) return rows;
    return [...rows].sort((a, b) => {
      let aVal = a[key] ?? "";
      let bVal = b[key] ?? "";
      // Numeric sort
      if (["employee_id", "total_break_time_today", "total_prayer_time_today", "late", "late_minutes"].includes(key)) {
        aVal = Number(aVal);
        bVal = Number(bVal);
        return dir === "asc" ? aVal - bVal : bVal - aVal;
      }
      // Date sort
      if (["date", "date_display", "break_start_display", "break_end_display", "prayer_start_display", "prayer_end_display", "clock_in", "clock_out"].includes(key)) {
        const aDate = new Date(aVal);
        const bDate = new Date(bVal);
        return dir === "asc" ? aDate.getTime() - bDate.getTime() : bDate.getTime() - aDate.getTime();
      }
      // Duration sort (hh:mm:ss)
      if (["total_break_time", "total_prayer_time", "total_hours"].includes(key)) {
        const parseDuration = (val: string) => {
          const match = val.match(/(\d+)h\s(\d+)m\s(\d+)s/);
          if (!match) return 0;
          return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
        };
        aVal = parseDuration(aVal);
        bVal = parseDuration(bVal);
        return dir === "asc" ? aVal - bVal : bVal - aVal;
      }
      // String sort (default)
      return dir === "asc" ? String(aVal).localeCompare(String(bVal)) : String(bVal).localeCompare(String(aVal));
    });
  };

  // Sorted rows
  const sortedBreakRows = sortRows(breakRows, breakSortKey, breakSortDir);
  const sortedPrayerRows = sortRows(prayerRows, prayerSortKey, prayerSortDir);
  const sortedAttendanceRows = sortRows(filteredAttendance, attSortKey, attSortDir);

  return (
    <LayoutDashboard>
      <div
        style={{
          width: '100%',
          minHeight: 'calc(100vh - 20px)',
          background: 'linear-gradient(135deg, #6a82fb 0%, #fc5c7d 100%)',
          padding: '0 0 24px 0',
          margin: 0,
          boxSizing: 'border-box',
          display: 'flow-root',
        }}
      >
        <div style={{ width: '100%', margin: 0, padding: 0 }}>
          <h1 style={{ marginTop: "24px", marginBottom: "24px", color: "#fff", fontWeight: 700, fontSize: "1.75rem", letterSpacing: "0.3px" }}>My Time & Attendance</h1>
          <div style={{ ...tabStyles, borderBottom: 'none', color: '#fff' }}>
            <button style={{ ...tabButtonStyles(activeTab === "break"), color: '#fff' }} onClick={() => setActiveTab("break")}>Break Summary</button>
            <button style={{ ...tabButtonStyles(activeTab === "prayer"), color: '#fff' }} onClick={() => setActiveTab("prayer")}>Prayer Break Summary</button>
            <button style={{ ...tabButtonStyles(activeTab === "attendance"), color: '#fff' }} onClick={() => setActiveTab("attendance")}>Attendance Summary</button>
          </div>
        </div>
        {/* Break Summary Tab */}
        {activeTab === "break" && (
          <div className={styles.breakSummaryContainer}>
            <div className={styles.breakSummaryFilters}>
              <input type="text" placeholder="Search employee..." value={breakSearch} onChange={e => setBreakSearch(e.target.value)} className={styles.breakSummaryInput} style={{ width: 180 }} />
              <select value={breakDepartment} onChange={e => setBreakDepartment(e.target.value)} className={styles.breakSummaryDate} style={{ width: 180 }}>
                <option value="">All Departments</option>
                {departments.map(dept => (
                  <option key={dept.id} value={dept.name}>{dept.name}</option>
                ))}
              </select>
              <input type="date" value={breakFromDate} onChange={e => setBreakFromDate(e.target.value)} className={styles.breakSummaryDate} placeholder="From Date" />
              <input type="date" value={breakToDate} onChange={e => setBreakToDate(e.target.value)} className={styles.breakSummaryDate} placeholder="To Date" />
              <button onClick={downloadBreaksCSV} className={styles.breakSummaryXLSButton} title="Download XLS">
                <FaFileExcel size={20} />
                <span>Export XLS</span>
              </button>
            </div>
            <div className={`${styles.breakSummaryTableWrapper} ${styles.timeSummaryTableWrapper}`} style={{ width: '100%', overflowX: 'auto' }}>
              <table className={`${styles.breakSummaryTable} ${styles.timeSummaryStickyTable}`}>
                <thead>
                  <tr style={{ background: "linear-gradient(135deg, #0052CC 0%, #00B8A9 100%)", color: "#fff" }}>
                    <th>{renderHeaderCell("Id", "employee_id", breakSortKey, breakSortDir, setBreakSortKey, setBreakSortDir)}</th>
                    <th>{renderHeaderCell("Full Name", "employee_name", breakSortKey, breakSortDir, setBreakSortKey, setBreakSortDir)}</th>
                    <th>{renderHeaderCell("P.Name", "pseudonym", breakSortKey, breakSortDir, setBreakSortKey, setBreakSortDir)}</th>
                    <th>{renderHeaderCell("Department", "department_name", breakSortKey, breakSortDir, setBreakSortKey, setBreakSortDir)}</th>
                    <th>{renderHeaderCell("Date", "date_display", breakSortKey, breakSortDir, setBreakSortKey, setBreakSortDir)}</th>
                    <th>{renderHeaderCell("Break Start", "break_start_display", breakSortKey, breakSortDir, setBreakSortKey, setBreakSortDir)}</th>
                    <th>{renderHeaderCell("Break End", "break_end_display", breakSortKey, breakSortDir, setBreakSortKey, setBreakSortDir)}</th>
                    <th>{renderHeaderCell("Total Break Time", "total_break_time", breakSortKey, breakSortDir, setBreakSortKey, setBreakSortDir)}</th>
                    <th>{renderHeaderCell("Total Break", "total_break_time_today", breakSortKey, breakSortDir, setBreakSortKey, setBreakSortDir)}</th>
                    <th>{renderHeaderCell("Exceed", "exceed_today", breakSortKey, breakSortDir, setBreakSortKey, setBreakSortDir)}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedBreakRows.length === 0 ? (
                    <tr>
                      <td colSpan={9} className={styles.breakSummaryNoRecords}>No records found.</td>
                    </tr>
                  ) : (
                    (() => {
                      // Find last break index for each employee per attendance session
                      const lastIndexMap = new Map();
                      sortedBreakRows.forEach((row, idx) => {
                        const key = getSessionGroupingKey(row, "break_start");
                        lastIndexMap.set(key, idx);
                      });
                      return sortedBreakRows.map((b, idx) => {
                        const key = getSessionGroupingKey(b, "break_start");
                        const isLast = lastIndexMap.get(key) === idx;
                        return (
                          <tr key={b.id || idx}>
                            <td>{b.employee_id}</td>
                            <td>{b.employee_name}</td>
                            <td>{b.pseudonym || '-'}</td>
                            <td>{b.department_name || '-'}</td>
                            <td>{b.date_display}</td>
                            <td>{b.break_start_display}</td>
                            <td>{b.break_end_display}</td>
                            <td>{b.total_break_time}</td>
                            <td>{b.total_break_time_today}</td>
                            <td style={{ color: isLast && b.exceed_today ? "#e74c3c" : undefined }}>
                              {isLast ? b.exceed_today : ""}
                            </td>
                          </tr>
                        );
                      });
                    })()
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {/* Prayer Break Summary Tab */}
        {activeTab === "prayer" && (
          <div className={styles.breakSummaryContainer}>
            <div className={styles.breakSummaryFilters}>
              <input type="text" placeholder="Search employee..." value={prayerSearch} onChange={e => setPrayerSearch(e.target.value)} className={styles.breakSummaryInput} style={{ width: 180 }} />
              <select value={prayerDepartment} onChange={e => setPrayerDepartment(e.target.value)} className={styles.breakSummaryDate} style={{ width: 180 }}>
                <option value="">All Departments</option>
                {departments.map(dept => (
                  <option key={dept.id} value={dept.name}>{dept.name}</option>
                ))}
              </select>
              <input type="date" value={prayerFromDate} onChange={e => setPrayerFromDate(e.target.value)} className={styles.breakSummaryDate} placeholder="From Date" />
              <input type="date" value={prayerToDate} onChange={e => setPrayerToDate(e.target.value)} className={styles.breakSummaryDate} placeholder="To Date" />
              <button onClick={downloadPrayerCSV} className={styles.breakSummaryXLSButton} title="Download XLS">
                <FaFileExcel size={20} />
                <span>Export XLS</span>
              </button>
            </div>
            <div className={`${styles.breakSummaryTableWrapper} ${styles.timeSummaryTableWrapper}`} style={{ width: '100%', overflowX: 'auto' }}>
              <table className={`${styles.breakSummaryTable} ${styles.timeSummaryStickyTable}`}>
                <thead>
                  <tr style={{ background: "linear-gradient(135deg, #0052CC 0%, #00B8A9 100%)", color: "#fff" }}>
                    <th>{renderHeaderCell("Id", "employee_id", prayerSortKey, prayerSortDir, setPrayerSortKey, setPrayerSortDir)}</th>
                    <th>{renderHeaderCell("Full Name", "employee_name", prayerSortKey, prayerSortDir, setPrayerSortKey, setPrayerSortDir)}</th>
                    <th>{renderHeaderCell("P.Name", "pseudonym", prayerSortKey, prayerSortDir, setPrayerSortKey, setPrayerSortDir)}</th>
                    <th>{renderHeaderCell("Department", "department_name", prayerSortKey, prayerSortDir, setPrayerSortKey, setPrayerSortDir)}</th>
                    <th>{renderHeaderCell("Date", "date_display", prayerSortKey, prayerSortDir, setPrayerSortKey, setPrayerSortDir)}</th>
                    <th>{renderHeaderCell("Prayer Start", "prayer_start_display", prayerSortKey, prayerSortDir, setPrayerSortKey, setPrayerSortDir)}</th>
                    <th>{renderHeaderCell("Prayer End", "prayer_end_display", prayerSortKey, prayerSortDir, setPrayerSortKey, setPrayerSortDir)}</th>
                    <th>{renderHeaderCell("Total Prayer Time", "total_prayer_time", prayerSortKey, prayerSortDir, setPrayerSortKey, setPrayerSortDir)}</th>
                    <th>{renderHeaderCell("Total Prayer", "total_prayer_time_today", prayerSortKey, prayerSortDir, setPrayerSortKey, setPrayerSortDir)}</th>
                    <th>{renderHeaderCell("Exceed", "exceed_today", prayerSortKey, prayerSortDir, setPrayerSortKey, setPrayerSortDir)}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedPrayerRows.length === 0 ? (
                    <tr>
                      <td colSpan={9} className={styles.breakSummaryNoRecords}>No records found.</td>
                    </tr>
                  ) : (
                    (() => {
                      // Find last prayer break index for each employee per attendance session
                      const lastIndexMap = new Map();
                      sortedPrayerRows.forEach((row, idx) => {
                        const key = getSessionGroupingKey(row, "prayer_break_start");
                        lastIndexMap.set(key, idx);
                      });
                      return sortedPrayerRows.map((p, idx) => {
                        const key = getSessionGroupingKey(p, "prayer_break_start");
                        const isLast = lastIndexMap.get(key) === idx;
                        return (
                          <tr key={p.id || idx}>
                            <td>{p.employee_id}</td>
                            <td>{p.employee_name}</td>
                            <td>{p.pseudonym || '-'}</td>
                            <td>{p.department_name || '-'}</td>
                            <td>{p.date_display}</td>
                            <td>{p.prayer_start_display}</td>
                            <td>{p.prayer_end_display}</td>
                            <td>{p.total_prayer_time}</td>
                            <td>{p.total_prayer_time_today}</td>
                            <td style={{ color: isLast && p.exceed_today ? "#e74c3c" : undefined }}>
                              {isLast ? p.exceed_today : ""}
                            </td>
                          </tr>
                        );
                      });
                    })()
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {/* Attendance Summary Tab */}
        {activeTab === "attendance" && (
          <div className={attStyles.attendanceSummaryContainer}>
            <div className={attStyles.attendanceSummaryFilters}>
              <input type="text" placeholder="Search employee..." value={attSearch} onChange={e => setAttSearch(e.target.value)} className={attStyles.attendanceSummaryInput} style={{ width: 180 }} />
              <select value={attDepartment} onChange={e => setAttDepartment(e.target.value)} className={attStyles.attendanceSummaryDate} style={{ width: 180 }}>
                <option value="">All Departments</option>
                {departments.map(dept => (
                  <option key={dept.id} value={dept.name}>{dept.name}</option>
                ))}
              </select>
              <input type="date" value={attFromDate} onChange={e => setAttFromDate(e.target.value)} className={attStyles.attendanceSummaryDate} placeholder="From Date" />
              <input type="date" value={attToDate} onChange={e => setAttToDate(e.target.value)} className={attStyles.attendanceSummaryDate} placeholder="To Date" />
              <button onClick={downloadAttendanceCSV} className={attStyles.attendanceSummaryXLSButton} title="Download XLS">
                <FaFileExcel size={20} />
                <span>Export XLS</span>
              </button>
            </div>
            <div className={`${attStyles.attendanceSummaryTableWrapper} ${attStyles.timeAttendanceTableWrapper}`} style={{ width: '100%', overflowX: 'auto' }}>
              <table className={`${attStyles.attendanceSummaryTable} ${attStyles.timeAttendanceStickyTable}`}>
                <thead>
                  <tr style={{ background: "linear-gradient(135deg, #0052CC 0%, #00B8A9 100%)", color: "#fff" }}>
                    <th>{renderHeaderCell("Id", "employee_id", attSortKey, attSortDir, setAttSortKey, setAttSortDir)}</th>
                    <th>{renderHeaderCell("Full Name", "employee_name", attSortKey, attSortDir, setAttSortKey, setAttSortDir)}</th>
                    <th>{renderHeaderCell("P.Name", "pseudonym", attSortKey, attSortDir, setAttSortKey, setAttSortDir)}</th>
                    <th>{renderHeaderCell("Department", "department_name", attSortKey, attSortDir, setAttSortKey, setAttSortDir)}</th>
                    <th>{renderHeaderCell("Date", "date", attSortKey, attSortDir, setAttSortKey, setAttSortDir)}</th>
                    <th>{renderHeaderCell("Clock In", "clock_in", attSortKey, attSortDir, setAttSortKey, setAttSortDir)}</th>
                    <th>{renderHeaderCell("Clock Out", "clock_out", attSortKey, attSortDir, setAttSortKey, setAttSortDir)}</th>
                    <th>{renderHeaderCell("Total Hours", "total_hours", attSortKey, attSortDir, setAttSortKey, setAttSortDir)}</th>
                    <th>{renderHeaderCell("Late", "late", attSortKey, attSortDir, setAttSortKey, setAttSortDir)}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedAttendanceRows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className={attStyles.attendanceSummaryNoRecords}>No records found.</td>
                    </tr>
                  ) : (
                    sortedAttendanceRows.map((a, idx) => (
                      <tr key={a.id || idx}>
                        <td>{a.employee_id}</td>
                        <td>{a.employee_name || ""}</td>
                        <td>{a.pseudonym || '-'}</td>
                        <td>{a.department_name || '-'}</td>
                        <td>{formatDateOnly(a.clock_in || a.clock_out || a.date)}</td>
                        <td>{a.clock_in ? getTimeStringInTimeZone(a.clock_in, SERVER_TIMEZONE) : ""}</td>
                        <td>
                          {a.clock_out
                            ? getTimeStringInTimeZone(a.clock_out, SERVER_TIMEZONE)
                            : <span style={{color: '#e67e22', fontWeight: 600}}>Running...</span>}
                        </td>
                        <td>
                          {a.clock_in && !a.clock_out
                            ? formatTotalHours(a.clock_in, "", now)
                            : formatTotalHours(a.clock_in, a.clock_out, now)}
                        </td>
                        <td style={{ color: a.is_late ? "#e74c3c" : "#27ae60", fontWeight: "600" }}>
                          {a.is_late ? `Late ${formatLateTime(a.late_minutes || 0)}` : "On Time"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </LayoutDashboard>
  );
}