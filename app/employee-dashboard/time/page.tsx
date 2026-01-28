"use client";

import React, { useEffect, useState } from "react";
import styles from "../../break-summary/break-summary.module.css";
import attStyles from "../../attendance-summary/attendance-summary.module.css";
import { ClockBreakPrayerWidget } from "../../components/ClockBreakPrayer";
import { FaFileExcel } from "react-icons/fa";
import * as XLSX from 'xlsx';


// Helper to format duration in hh:mm:ss
function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600).toString().padStart(2, "0");
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${h}h ${m}m ${s}s`;
}

// Helper to get local YYYY-MM-DD for grouping
function localDateKey(date: Date) {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const d = date.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Helper to format total hours
function formatTotalHours(clockIn: string, clockOut: string) {
  if (!clockIn || !clockOut) return "00h 00m 00s";
  const start = new Date(clockIn).getTime();
  const end = new Date(clockOut).getTime();
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

export default function EmployeeTimePage() {
  const [activeTab, setActiveTab] = useState("break");
  const [breaks, setBreaks] = useState<any[]>([]);
  const [prayerBreaks, setPrayerBreaks] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [breakDate, setBreakDate] = useState("");
  const [prayerDate, setPrayerDate] = useState("");
  const [attDate, setAttDate] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [employeeName, setEmployeeName] = useState("");

  // Get employeeId and employeeName from localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const empId = localStorage.getItem("employeeId") || localStorage.getItem("loginId");
      const empName = localStorage.getItem("employeeName");
      if (empId) {
        setEmployeeId(empId);
      }
      if (empName) {
        setEmployeeName(empName);
      }
    }
  }, []);

  // Fetch breaks for current employee
  useEffect(() => {
    if (!employeeId) return;
    let url = `/api/breaks?employeeId=${employeeId}`;
    if (breakDate) url += `&date=${breakDate}`;
    fetch(url)
      .then(res => res.json())
      .then(data => {
        if (data.success) setBreaks(data.breaks);
        else setBreaks([]);
      });
  }, [employeeId, breakDate]);

  // Fetch prayer breaks for current employee
  useEffect(() => {
    if (!employeeId) return;
    let url = `/api/prayer_breaks?employeeId=${employeeId}`;
    if (prayerDate) url += `&date=${prayerDate}`;
    fetch(url)
      .then(res => res.json())
      .then(data => {
        if (data.success) setPrayerBreaks(data.prayer_breaks);
        else setPrayerBreaks([]);
      });
  }, [employeeId, prayerDate]);

  // Fetch attendance for current employee
  useEffect(() => {
    if (!employeeId) return;
    let url = `/api/attendance?employeeId=${employeeId}`;
    if (attDate) url += `&date=${attDate}`;
    fetch(url)
      .then(res => res.json())
      .then(data => {
        if (data.success) setAttendance(data.attendance);
        else setAttendance([]);
      });
  }, [employeeId, attDate]);

  // Aggregate all breaks per day for this employee
  const dailyBreakTotals = (() => {
    const map = new Map<string, number>();
    for (const b of breaks) {
      if (!b.break_start || !b.break_end) continue;
      const start = new Date(b.break_start);
      const end = new Date(b.break_end);
      const seconds = Math.floor((end.getTime() - start.getTime()) / 1000);
      const dateForKey = b.date ? new Date(b.date) : start;
      const key = localDateKey(dateForKey);
      map.set(key, (map.get(key) || 0) + Math.max(0, seconds));
    }
    return map;
  })();

  // Map breaks data with both session and daily totals
  const breakRows = breaks.map(b => {
    let sessionSeconds = 0;
    if (b.break_start && b.break_end) {
      const start = new Date(b.break_start).getTime();
      const end = new Date(b.break_end).getTime();
      sessionSeconds = Math.floor((end - start) / 1000);
    }
    const sessionExceed = sessionSeconds > 3600 ? sessionSeconds - 3600 : 0;
    const start = b.break_start ? new Date(b.break_start) : null;
    const dateForKey = b.date ? new Date(b.date) : (start as Date | null);
    const dailySeconds = dateForKey ? (dailyBreakTotals.get(localDateKey(dateForKey)) || 0) : sessionSeconds;
    const dailyExceed = dailySeconds > 3600 ? dailySeconds - 3600 : 0;
    return {
      ...b,
      break_start_display: b.break_start ? new Date(b.break_start).toLocaleString() : "",
      break_end_display: b.break_end ? new Date(b.break_end).toLocaleString() : "",
      total_break_time: formatDuration(sessionSeconds),
      total_break_time_today: formatDuration(dailySeconds),
      exceed: sessionExceed > 0 ? formatDuration(sessionExceed) : "",
      exceed_today: dailyExceed > 0 ? formatDuration(dailyExceed) : "",
      date_display: b.date ? new Date(b.date).toLocaleDateString() : (b.break_start ? new Date(b.break_start).toLocaleDateString() : "")
    };
  });

  const dailyPrayerTotals = (() => {
    const map = new Map<string, number>();
    for (const p of prayerBreaks) {
      if (!p.prayer_break_start || !p.prayer_break_end) continue;
      const start = new Date(p.prayer_break_start);
      const end = new Date(p.prayer_break_end);
      const seconds = Math.floor((end.getTime() - start.getTime()) / 1000);
      const dateForKey = p.date ? new Date(p.date) : start;
      const key = localDateKey(dateForKey);
      map.set(key, (map.get(key) || 0) + Math.max(0, seconds));
    }
    return map;
  })();

  // Map prayer breaks data with daily totals
  const prayerRows = prayerBreaks.map(p => {
    let sessionSeconds = 0;
    if (p.prayer_break_start && p.prayer_break_end) {
      const start = new Date(p.prayer_break_start).getTime();
      const end = new Date(p.prayer_break_end).getTime();
      sessionSeconds = Math.floor((end - start) / 1000);
    }
    const sessionExceed = sessionSeconds > 1800 ? sessionSeconds - 1800 : 0;
    const start = p.prayer_break_start ? new Date(p.prayer_break_start) : null;
    const dateForKey = p.date ? new Date(p.date) : (start as Date | null);
    const dailySeconds = dateForKey ? (dailyPrayerTotals.get(localDateKey(dateForKey)) || 0) : sessionSeconds;
    const dailyExceed = dailySeconds > 1800 ? dailySeconds - 1800 : 0;
    return {
      ...p,
      prayer_start_display: p.prayer_break_start ? new Date(p.prayer_break_start).toLocaleString() : "",
      prayer_end_display: p.prayer_break_end ? new Date(p.prayer_break_end).toLocaleString() : "",
      total_prayer_time: formatDuration(sessionSeconds),
      total_prayer_time_today: formatDuration(dailySeconds),
      exceed: sessionExceed > 0 ? formatDuration(sessionExceed) : "",
      exceed_today: dailyExceed > 0 ? formatDuration(dailyExceed) : "",
      date_display: p.date ? new Date(p.date).toLocaleDateString() : (p.prayer_break_start ? new Date(p.prayer_break_start).toLocaleDateString() : "")
    };
  });

  const downloadBreaksCSV = () => {
    const headers = ["Date", "Break Start", "Break End", "Total Break Time", "Today's Total Break", "Exceed", "Exceed Today"];
    let csv = headers.join(',') + '\n';
    breakRows.forEach(row => {
      csv += [row.date_display, row.break_start_display, row.break_end_display, row.total_break_time, row.total_break_time_today, row.exceed, row.exceed_today].map(val => `"${val}"`).join(',') + '\n';
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'my_break_summary.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const downloadPrayerCSV = () => {
    const headers = ["Date", "Prayer Start", "Prayer End", "Total Prayer Time", "Total Prayer", "Exceed", "Exceed Today"];
    let csv = headers.join(',') + '\n';
    prayerRows.forEach(row => {
      csv += [row.date_display, row.prayer_start_display, row.prayer_end_display, row.total_prayer_time, row.total_prayer_time_today, row.exceed, row.exceed_today].map(val => `"${val}"`).join(',') + '\n';
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'my_prayer_break_summary.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const downloadAttendanceCSV = () => {
    const data = attendance.map(row => {
      const date = row.date ? new Date(row.date).toLocaleString() : "";
      const clockIn = row.clock_in ? new Date(row.clock_in).toLocaleString() : "";
      const clockOut = row.clock_out ? new Date(row.clock_out).toLocaleString() : "";
      const totalHours = formatTotalHours(row.clock_in, row.clock_out);
      const late = row.is_late ? `Late ${formatLateTime(row.late_minutes || 0)}` : "On Time";
      return {
        "Date": date,
        "Clock In": clockIn,
        "Clock Out": clockOut,
        "Total Hours": totalHours,
        "Late": late
      };
    });
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [
      { wch: 22 }, // Date
      { wch: 18 }, // Clock In
      { wch: 18 }, // Clock Out
      { wch: 16 }, // Total Hours
      { wch: 14 }  // Late
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Attendance");
    XLSX.writeFile(wb, `my_attendance_summary_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const tabStyles: React.CSSProperties = {
    display: "flex",
    gap: "12px",
    borderBottom: "2px solid #E2E8F0",
    marginBottom: "28px",
    paddingBottom: "0"
  };

  const tabButtonStyles = (isActive: boolean): React.CSSProperties => ({
    padding: "12px 24px",
    border: "none",
    background: isActive ? "linear-gradient(135deg, #0052CC 0%, #00B8A9 100%)" : "transparent",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: isActive ? "600" : "500",
    color: isActive ? "#fff" : "#4A5568",
    borderRadius: isActive ? "8px 8px 0 0" : "0",
    marginBottom: "-2px",
    transition: "all 0.3s",
    boxShadow: isActive ? "0 -2px 8px rgba(0,82,204,0.15)" : "none"
  });

  return (
    <div style={{ width: '100vw', minHeight: '100vh', background: 'linear-gradient(135deg, #6a82fb 0%, #fc5c7d 100%)', padding: 0, margin: 0 }}>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 16px' }}>
        {/* Shared Clock / Break / Prayer controls at the very top */}
        <div style={{ marginTop: '40px' }}>
          <ClockBreakPrayerWidget employeeId={employeeId} employeeName={employeeName} />
        </div>

        <h1 style={{ marginTop: "24px", marginBottom: "24px", color: "#fff", fontWeight: 700, fontSize: "1.75rem", letterSpacing: "0.3px" }}>My Time & Attendance</h1>

        <div style={{ ...tabStyles, borderBottom: 'none' }}>
          <button style={{ ...tabButtonStyles(activeTab === "break"), color: '#fff' }} onClick={() => setActiveTab("break")}> 
            Break Summary
          </button>
          <button style={{ ...tabButtonStyles(activeTab === "prayer"), color: '#fff' }} onClick={() => setActiveTab("prayer")}> 
            Prayer Break Summary
          </button>
          <button style={{ ...tabButtonStyles(activeTab === "attendance"), color: '#fff' }} onClick={() => setActiveTab("attendance")}> 
            Attendance Summary
          </button>
        </div>

        {activeTab === "break" && (
          <div className={styles.breakSummaryContainer} style={{ width: '100%' }}>
            <div className={styles.breakSummaryFilters}>
              <input
                type="date"
                value={breakDate}
                onChange={e => setBreakDate(e.target.value)}
                className={styles.breakSummaryDate}
              />
              <button onClick={downloadBreaksCSV} className={styles.breakSummaryXLSButton} title="Download XLS">
                <FaFileExcel size={20} />
                <span>Export XLS</span>
              </button>
            </div>
            <div className={styles.breakSummaryTableWrapper}>
              <table className={styles.breakSummaryTable}>
                <thead>
                <tr>
                  <th>Name</th>
                  <th>Date</th>
                  <th>Break Start</th>
                  <th>Break End</th>
                    <th>Total Break Time</th>
                    <th>Total Break</th>
                  <th>Exceed</th>
                </tr>
              </thead>
              <tbody>
                {breakRows.length === 0 ? (
                  <tr>
                      <td colSpan={7} className={styles.breakSummaryNoRecords}>No records found.</td>
                  </tr>
                ) : (
                  (() => {
                    // Find last break index for each day
                    const lastIndexMap = new Map();
                    breakRows.forEach((row, idx) => {
                      const key = row.date_display;
                      lastIndexMap.set(key, idx);
                    });
                    return breakRows.map((b, idx) => {
                      const key = b.date_display;
                      const isLast = lastIndexMap.get(key) === idx;
                      return (
                        <tr key={b.id || idx}>
                          <td>{employeeName}</td>
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

        {activeTab === "prayer" && (
          <div className={styles.breakSummaryContainer} style={{ width: '100%' }}>
            <div className={styles.breakSummaryFilters}>
              <input
                type="date"
                value={prayerDate}
                onChange={e => setPrayerDate(e.target.value)}
                className={styles.breakSummaryDate}
              />
              <button onClick={downloadPrayerCSV} className={styles.breakSummaryXLSButton} title="Download XLS">
                <FaFileExcel size={20} />
                <span>Export XLS</span>
              </button>
            </div>
            <div className={styles.breakSummaryTableWrapper}>
              <table className={styles.breakSummaryTable}>
                <thead>
                <tr>
                  <th>Name</th>
                  <th>Date</th>
                  <th>Prayer Start</th>
                  <th>Prayer End</th>
                  <th>Total Prayer Time</th>
                  <th>Total Prayer</th>
                  <th>Exceed</th>
                </tr>
              </thead>
              <tbody>
                {prayerRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className={styles.breakSummaryNoRecords}>No records found.</td>
                  </tr>
                ) : (
                  (() => {
                    // Find last prayer break index for each day
                    const lastIndexMap = new Map();
                    prayerRows.forEach((row, idx) => {
                      const key = row.date_display;
                      lastIndexMap.set(key, idx);
                    });
                    return prayerRows.map((p, idx) => {
                      const key = p.date_display;
                      const isLast = lastIndexMap.get(key) === idx;
                      return (
                        <tr key={p.id || idx}>
                          <td>{employeeName}</td>
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

        {activeTab === "attendance" && (
          <div className={attStyles.attendanceSummaryContainer} style={{ width: '100%' }}>
            <div className={attStyles.attendanceSummaryFilters}>
              <input
                type="date"
                value={attDate}
                onChange={e => setAttDate(e.target.value)}
                className={attStyles.attendanceSummaryDate}
              />
              <button onClick={downloadAttendanceCSV} className={attStyles.attendanceSummaryXLSButton} title="Download XLS">
                <FaFileExcel size={20} />
                <span>Export XLS</span>
              </button>
            </div>
            <div className={attStyles.attendanceSummaryTableWrapper}>
              <table className={attStyles.attendanceSummaryTable}>
                <thead>
                <tr>
                  <th>Name</th>
                  <th>Date</th>
                  <th>Clock In</th>
                  <th>Clock Out</th>
                  <th>Total Hours</th>
                  <th>Late</th>
                </tr>
              </thead>
              <tbody>
                {attendance.length === 0 ? (
                  <tr>
                    <td colSpan={6} className={attStyles.attendanceSummaryNoRecords}>No records found.</td>
                  </tr>
                ) : (
                  attendance
                    .sort((a, b) => {
                      // Sort by clock_in descending (latest first)
                      if (!a.clock_in && !b.clock_in) return 0;
                      if (!a.clock_in) return 1;
                      if (!b.clock_in) return -1;
                      return new Date(b.clock_in).getTime() - new Date(a.clock_in).getTime();
                    })
                    .map((a, idx) => (
                      <tr key={a.id || idx}>
                        <td>{employeeName}</td>
                        <td>{a.date ? new Date(a.date).toLocaleDateString() : ""}</td>
                        <td>{a.clock_in ? new Date(a.clock_in).toLocaleTimeString() : ""}</td>
                        <td>{a.clock_out ? new Date(a.clock_out).toLocaleTimeString() : ""}</td>
                        <td>{formatTotalHours(a.clock_in, a.clock_out)}</td>
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
    </div>
  );
}
