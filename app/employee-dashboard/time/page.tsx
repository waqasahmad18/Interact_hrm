"use client";
import React, { useEffect, useState } from "react";
import styles from "../../break-summary/break-summary.module.css";
import attStyles from "../../attendance-summary/attendance-summary.module.css";
import { FaFileExcel } from "react-icons/fa";

// Helper to format duration in hh:mm:ss
function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600).toString().padStart(2, "0");
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${h}h ${m}m ${s}s`;
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

  // Map breaks data
  const breakRows = breaks.map(b => {
    let totalBreakSeconds = 0;
    if (b.break_start && b.break_end) {
      const start = new Date(b.break_start).getTime();
      const end = new Date(b.break_end).getTime();
      totalBreakSeconds = Math.floor((end - start) / 1000);
    }
    const exceed = totalBreakSeconds > 3600 ? totalBreakSeconds - 3600 : 0;
    return {
      ...b,
      break_start_display: b.break_start ? new Date(b.break_start).toLocaleString() : "",
      break_end_display: b.break_end ? new Date(b.break_end).toLocaleString() : "",
      total_break_time: formatDuration(totalBreakSeconds),
      exceed: exceed > 0 ? formatDuration(exceed) : "",
      date_display: b.date ? new Date(b.date).toLocaleDateString() : (b.break_start ? new Date(b.break_start).toLocaleDateString() : "")
    };
  });

  // Map prayer breaks data
  const prayerRows = prayerBreaks.map(p => {
    let totalSeconds = 0;
    if (p.prayer_break_start && p.prayer_break_end) {
      const start = new Date(p.prayer_break_start).getTime();
      const end = new Date(p.prayer_break_end).getTime();
      totalSeconds = Math.floor((end - start) / 1000);
    }
    const exceed = totalSeconds > 1800 ? totalSeconds - 1800 : 0;
    return {
      ...p,
      prayer_start_display: p.prayer_break_start ? new Date(p.prayer_break_start).toLocaleString() : "",
      prayer_end_display: p.prayer_break_end ? new Date(p.prayer_break_end).toLocaleString() : "",
      total_prayer_time: formatDuration(totalSeconds),
      exceed: exceed > 0 ? formatDuration(exceed) : "",
      date_display: p.date ? new Date(p.date).toLocaleDateString() : (p.prayer_break_start ? new Date(p.prayer_break_start).toLocaleDateString() : "")
    };
  });

  const downloadBreaksCSV = () => {
    const headers = ["Date", "Break Start", "Break End", "Total Break Time", "Exceed"];
    let csv = headers.join(',') + '\n';
    breakRows.forEach(row => {
      csv += [row.date_display, row.break_start_display, row.break_end_display, row.total_break_time, row.exceed].map(val => `"${val}"`).join(',') + '\n';
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
    const headers = ["Date", "Prayer Start", "Prayer End", "Total Prayer Time", "Exceed"];
    let csv = headers.join(',') + '\n';
    prayerRows.forEach(row => {
      csv += [row.date_display, row.prayer_start_display, row.prayer_end_display, row.total_prayer_time, row.exceed].map(val => `"${val}"`).join(',') + '\n';
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
    const headers = ["Date", "Clock In", "Clock Out", "Total Hours"];
    let csv = headers.join(',') + '\n';
    attendance.forEach(row => {
      const date = row.date ? new Date(row.date).toLocaleString() : "";
      const clockIn = row.clock_in ? new Date(row.clock_in).toLocaleString() : "";
      const clockOut = row.clock_out ? new Date(row.clock_out).toLocaleString() : "";
      const totalHours = formatTotalHours(row.clock_in, row.clock_out);
      csv += [date, clockIn, clockOut, totalHours].map(val => `"${val}"`).join(',') + '\n';
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'my_attendance_summary.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
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
    <div style={{ padding: "20px" }}>
      <h1 style={{ marginBottom: "24px", color: "#0052CC", fontWeight: 700, fontSize: "1.75rem", letterSpacing: "0.3px" }}>My Time & Attendance</h1>
      
      <div style={tabStyles}>
        <button style={tabButtonStyles(activeTab === "break")} onClick={() => setActiveTab("break")}>
          Break Summary
        </button>
        <button style={tabButtonStyles(activeTab === "prayer")} onClick={() => setActiveTab("prayer")}>
          Prayer Break Summary
        </button>
        <button style={tabButtonStyles(activeTab === "attendance")} onClick={() => setActiveTab("attendance")}>
          Attendance Summary
        </button>
      </div>

      {activeTab === "break" && (
        <div className={styles.breakSummaryContainer}>
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
                  <th>Exceed</th>
                </tr>
              </thead>
              <tbody>
                {breakRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className={styles.breakSummaryNoRecords}>No records found.</td>
                  </tr>
                ) : (
                  breakRows.map((b, idx) => (
                    <tr key={b.id || idx}>
                      <td>{employeeName}</td>
                      <td>{b.date_display}</td>
                      <td>{b.break_start_display}</td>
                      <td>{b.break_end_display}</td>
                      <td>{b.total_break_time}</td>
                      <td style={{ color: b.exceed ? "#e74c3c" : undefined }}>{b.exceed}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "prayer" && (
        <div className={styles.breakSummaryContainer}>
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
                  <th>Exceed</th>
                </tr>
              </thead>
              <tbody>
                {prayerRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className={styles.breakSummaryNoRecords}>No records found.</td>
                  </tr>
                ) : (
                  prayerRows.map((p, idx) => (
                    <tr key={p.id || idx}>
                      <td>{employeeName}</td>
                      <td>{p.date_display}</td>
                      <td>{p.prayer_start_display}</td>
                      <td>{p.prayer_end_display}</td>
                      <td>{p.total_prayer_time}</td>
                      <td style={{ color: p.exceed ? "#e74c3c" : undefined }}>{p.exceed}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "attendance" && (
        <div className={attStyles.attendanceSummaryContainer}>
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
                </tr>
              </thead>
              <tbody>
                {attendance.length === 0 ? (
                  <tr>
                    <td colSpan={5} className={attStyles.attendanceSummaryNoRecords}>No records found.</td>
                  </tr>
                ) : (
                  attendance.map((a, idx) => (
                    <tr key={a.id || idx}>
                      <td>{employeeName}</td>
                      <td>{a.date ? new Date(a.date).toLocaleDateString() : ""}</td>
                      <td>{a.clock_in ? new Date(a.clock_in).toLocaleTimeString() : ""}</td>
                      <td>{a.clock_out ? new Date(a.clock_out).toLocaleTimeString() : ""}</td>
                      <td>{formatTotalHours(a.clock_in, a.clock_out)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
