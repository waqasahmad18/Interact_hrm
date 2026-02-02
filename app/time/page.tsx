"use client";
import React, { useEffect, useState } from "react";
import LayoutDashboard from "../layout-dashboard";
import styles from "../break-summary/break-summary.module.css";
import attStyles from "../attendance-summary/attendance-summary.module.css";
import { FaFileExcel } from "react-icons/fa";

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

export default function TimePage() {
  const [activeTab, setActiveTab] = useState("break");
  const [breaks, setBreaks] = useState<any[]>([]);
  const [prayerBreaks, setPrayerBreaks] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [breakSearch, setBreakSearch] = useState("");
  const [breakDate, setBreakDate] = useState("");
  const [prayerSearch, setPrayerSearch] = useState("");
  const [prayerDate, setPrayerDate] = useState("");
  const [attSearch, setAttSearch] = useState("");
  const [attDate, setAttDate] = useState("");
  // For live timer
  const [now, setNow] = useState(Date.now());

  // Update timer every second if any running breaks exist
  useEffect(() => {
    const hasRunningBreak = breaks.some(b => b.break_start && !b.break_end);
    const hasRunningPrayer = prayerBreaks.some(p => p.prayer_break_start && !p.prayer_break_end);
    const hasRunningAttendance = attendance.some(a => a.clock_in && !a.clock_out);
    if (!hasRunningBreak && !hasRunningPrayer && !hasRunningAttendance) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [breaks, prayerBreaks, attendance]);

  // Fetch breaks
  useEffect(() => {
    let url = "/api/breaks";
    if (breakDate) url += `?date=${breakDate}`;
    fetch(url)
      .then(res => res.json())
      .then(data => {
        if (data.success) setBreaks(data.breaks);
        else setBreaks([]);
      });
  }, [breakDate]);

  // Fetch prayer breaks
  useEffect(() => {
    let url = "/api/prayer_breaks";
    if (prayerDate) url += `?date=${prayerDate}`;
    fetch(url)
      .then(res => res.json())
      .then(data => {
        if (data.success) setPrayerBreaks(data.prayer_breaks);
        else setPrayerBreaks([]);
      });
  }, [prayerDate]);

  // Fetch attendance
  useEffect(() => {
    let url = "/api/attendance";
    if (attDate) url += `?date=${attDate}`;
    fetch(url)
      .then(res => res.json())
      .then(data => {
        if (data.success) setAttendance(data.attendance);
        else setAttendance([]);
      });
  }, [attDate]);

  // Filter breaks
  const filteredBreaks = breaks.filter(b => {
    if (!breakSearch) return true;
    return (b.employee_name || "").toLowerCase().includes(breakSearch.toLowerCase());
  });

  // Filter prayer breaks
  const filteredPrayerBreaks = prayerBreaks.filter(p => {
    if (!prayerSearch) return true;
    return (p.employee_name || "").toLowerCase().includes(prayerSearch.toLowerCase());
  });

  // Filter and sort attendance (latest clock-in/out at top)
  const filteredAttendance = attendance
    .filter(a => {
      if (!attSearch) return true;
      return (a.employee_name || "").toLowerCase().includes(attSearch.toLowerCase());
    })
    .sort((a, b) => {
      // Use clock_out if available, otherwise clock_in
      const aTime = new Date(a.clock_out || a.clock_in || 0).getTime();
      const bTime = new Date(b.clock_out || b.clock_in || 0).getTime();
      return bTime - aTime; // Descending order (latest first)
    });

  // Aggregate all breaks per employee per day (matches widget logic - including running breaks)
  const dailyBreakTotals = (() => {
    const map = new Map<string, number>();
    for (const b of filteredBreaks) {
      if (!b.break_start) continue;
      const start = new Date(b.break_start);
      const end = b.break_end ? new Date(b.break_end) : new Date(now);
      const seconds = Math.floor((end.getTime() - start.getTime()) / 1000);
      const dateForKey = b.date ? new Date(b.date) : start;
      const empKey = (b.employee_id ?? b.employeeId ?? "").toString() || (b.employee_name || b.name || b.username || "");
      const key = `${empKey}|${localDateKey(dateForKey)}`;
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
    const start = b.break_start ? new Date(b.break_start) : null;
    const dateForKey = b.date ? new Date(b.date) : (start as Date | null);
    const empKey = (b.employee_id ?? b.employeeId ?? "").toString() || (b.employee_name || b.name || b.username || "");
    const key = dateForKey ? `${empKey}|${localDateKey(dateForKey)}` : "";
    const dailySeconds = key ? (dailyBreakTotals.get(key) || 0) : sessionSeconds;
    const dailyExceed = dailySeconds > 3600 ? dailySeconds - 3600 : 0;
    return {
      ...b,
      employee_name: b.employee_name || b.name || b.username || "",
      break_start_display: b.break_start ? new Date(b.break_start).toLocaleTimeString() : "",
      break_end_display: b.break_end ? new Date(b.break_end).toLocaleTimeString() : (isRunning ? "🔴 Running" : ""),
      total_break_time: formatDuration(sessionSeconds),
      total_break_time_today: formatDuration(dailySeconds),
      exceed: sessionExceed > 0 ? formatDuration(sessionExceed) : "",
      exceed_today: dailyExceed > 0 ? formatDuration(dailyExceed) : "",
      date_display: b.date ? new Date(b.date).toLocaleDateString() : (b.break_start ? new Date(b.break_start).toLocaleDateString() : ""),
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
      const dateForKey = p.date ? new Date(p.date) : start;
      const empKey = (p.employee_id ?? p.employeeId ?? "").toString() || (p.employee_name || p.name || p.username || "");
      const key = `${empKey}|${localDateKey(dateForKey)}`;
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
    const start = p.prayer_break_start ? new Date(p.prayer_break_start) : null;
    const dateForKey = p.date ? new Date(p.date) : (start as Date | null);
    const empKey = (p.employee_id ?? p.employeeId ?? "").toString() || (p.employee_name || p.name || p.username || "");
    const key = dateForKey ? `${empKey}|${localDateKey(dateForKey)}` : "";
    const dailySeconds = key ? (dailyPrayerTotals.get(key) || 0) : sessionSeconds;
    const dailyExceed = dailySeconds > 1800 ? dailySeconds - 1800 : 0;
    return {
      ...p,
      employee_name: p.employee_name || p.name || p.username || "",
      prayer_start_display: p.prayer_break_start ? new Date(p.prayer_break_start).toLocaleTimeString() : "",
      prayer_end_display: p.prayer_break_end ? new Date(p.prayer_break_end).toLocaleTimeString() : (isRunning ? "🔴 Running" : ""),
      total_prayer_time: formatDuration(sessionSeconds),
      total_prayer_time_today: formatDuration(dailySeconds),
      exceed: sessionExceed > 0 ? formatDuration(sessionExceed) : "",
      exceed_today: dailyExceed > 0 ? formatDuration(dailyExceed) : "",
      date_display: p.date ? new Date(p.date).toLocaleDateString() : (p.prayer_break_start ? new Date(p.prayer_break_start).toLocaleDateString() : ""),
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
      const date = row.date ? new Date(row.date).toLocaleString() : "";
      const clockIn = row.clock_in ? new Date(row.clock_in).toLocaleString() : "";
      const clockOut = row.clock_out ? new Date(row.clock_out).toLocaleString() : "";
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

  return (
    <LayoutDashboard>
      <div style={{ width: '100%', minHeight: '100vh', background: 'linear-gradient(135deg, #6a82fb 0%, #fc5c7d 100%)', padding: 0, margin: 0 }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 16px' }}>
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
              <input type="date" value={breakDate} onChange={e => setBreakDate(e.target.value)} className={styles.breakSummaryDate} />
              <button onClick={downloadBreaksCSV} className={styles.breakSummaryXLSButton} title="Download XLS">
                <FaFileExcel size={20} />
                <span>Export XLS</span>
              </button>
            </div>
            <div className={styles.breakSummaryTableWrapper}>
              <table className={styles.breakSummaryTable}>
                <thead>
                  <tr>
                    <th>Id</th>
                    <th>Full Name</th>
                    <th>P.Name</th>
                    <th>Department</th>
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
                      <td colSpan={9} className={styles.breakSummaryNoRecords}>No records found.</td>
                    </tr>
                  ) : (
                    (() => {
                      // Find last break index for each employee per day
                      const lastIndexMap = new Map();
                      breakRows.forEach((row, idx) => {
                        const key = `${row.employee_id}|${row.date_display}`;
                        lastIndexMap.set(key, idx);
                      });
                      return breakRows.map((b, idx) => {
                        const key = `${b.employee_id}|${b.date_display}`;
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
              <input type="date" value={prayerDate} onChange={e => setPrayerDate(e.target.value)} className={styles.breakSummaryDate} />
              <button onClick={downloadPrayerCSV} className={styles.breakSummaryXLSButton} title="Download XLS">
                <FaFileExcel size={20} />
                <span>Export XLS</span>
              </button>
            </div>
            <div className={styles.breakSummaryTableWrapper}>
              <table className={styles.breakSummaryTable}>
                <thead>
                  <tr>
                    <th>Id</th>
                    <th>Full Name</th>
                    <th>P.Name</th>
                    <th>Department</th>
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
                      <td colSpan={9} className={styles.breakSummaryNoRecords}>No records found.</td>
                    </tr>
                  ) : (
                    (() => {
                      // Find last prayer break index for each employee per day
                      const lastIndexMap = new Map();
                      prayerRows.forEach((row, idx) => {
                        const key = `${row.employee_id}|${row.date_display}`;
                        lastIndexMap.set(key, idx);
                      });
                      return prayerRows.map((p, idx) => {
                        const key = `${p.employee_id}|${p.date_display}`;
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
              <input type="date" value={attDate} onChange={e => setAttDate(e.target.value)} className={attStyles.attendanceSummaryDate} />
              <button onClick={downloadAttendanceCSV} className={attStyles.attendanceSummaryXLSButton} title="Download XLS">
                <FaFileExcel size={20} />
                <span>Export XLS</span>
              </button>
            </div>
            <div className={attStyles.attendanceSummaryTableWrapper}>
              <table className={attStyles.attendanceSummaryTable}>
                <thead>
                    <tr>
                    <th>Id</th>
                    <th>Full Name</th>
                    <th>P.Name</th>
                    <th>Department</th>
                    <th>Date</th>
                    <th>Clock In</th>
                    <th>Clock Out</th>
                    <th>Total Hours</th>
                    <th>Late</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAttendance.length === 0 ? (
                    <tr>
                      <td colSpan={8} className={attStyles.attendanceSummaryNoRecords}>No records found.</td>
                    </tr>
                  ) : (
                    filteredAttendance.map((a, idx) => (
                      <tr key={a.id || idx}>
                        <td>{a.employee_id}</td>
                        <td>{a.employee_name || ""}</td>
                        <td>{a.pseudonym || '-'}</td>
                        <td>{a.department_name || '-'}</td>
                        <td>{a.date ? new Date(a.date).toLocaleDateString() : ""}</td>
                        <td>{a.clock_in ? new Date(a.clock_in).toLocaleTimeString() : ""}</td>
                        <td>
                          {a.clock_out
                            ? new Date(a.clock_out).toLocaleTimeString()
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