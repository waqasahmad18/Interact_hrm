
"use client";
import React, { useEffect, useState } from "react";
import LayoutDashboard from "../layout-dashboard";
import styles from "../dashboard/nexatech-theme.module.css";

export default function AttendanceSummaryPage() {
    // Download filtered attendance as CSV
    function downloadCSV() {
      const headers = [
        "EMPLOYEE ID", "",
        "EMPLOYEE NAME", "",
        "DATE", "", "",
        "CLOCK IN", "", "",
        "CLOCK OUT", "", "",
        "TOTAL HOURS"
      ];
      const rows = filtered.map(a => [
        a.employee_id, "",
        a.employee_name, "",
        a.date ? new Date(a.date).toLocaleString() : "", "", "",
        a.clock_in ? new Date(a.clock_in).toLocaleString() : "", "", "",
        a.clock_out ? new Date(a.clock_out).toLocaleString() : "", "", "",
        formatTotalHours(a.clock_in, a.clock_out)
      ]);
      let csv = '';
      csv += headers.join(',') + '\n';
      rows.forEach(row => {
        csv += row.map(val => `"${val}"`).join(',') + '\n';
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
    }
  const [attendance, setAttendance] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [selectedDate, setSelectedDate] = useState("");

  // Format total hours as hh:mm:ss using clock_in and clock_out
  function formatTotalHours(clockIn, clockOut) {
    if (!clockIn || !clockOut) return "00h 00m 00s";
    const start = new Date(clockIn).getTime();
    const end = new Date(clockOut).getTime();
    const totalSeconds = Math.floor((end - start) / 1000);
    const h = Math.floor(totalSeconds / 3600).toString().padStart(2, "0");
    const m = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, "0");
    const s = (totalSeconds % 60).toString().padStart(2, "0");
    return `${h}h ${m}m ${s}s`;
  }

  useEffect(() => {
    // Fetch attendance from API, filter by date if selected
    let url = "/api/attendance";
    if (selectedDate) {
      url += `?date=${selectedDate}`;
    }
    fetch(url)
      .then(res => res.json())
      .then(data => {
        if (data.success) setAttendance(data.attendance);
        else setAttendance([]);
      });
  }, [selectedDate]);

  // Filter by employee name
  const filtered = attendance.filter(a => {
    if (!search) return true;
    return (a.employee_name || "").toLowerCase().includes(search.toLowerCase());
  });

  // Format time
  function formatTime(dt) {
    if (!dt) return "";
    const d = new Date(dt);
    return d.toLocaleTimeString();
  }

  // Format date
  function formatDate(dt) {
    if (!dt) return "";
    const d = new Date(dt);
    return d.toLocaleDateString();
  }

  return (
    <LayoutDashboard>
      <div className={styles.card} style={{ maxWidth: 700, margin: "32px auto" }}>
        <h2 className={styles.cardTitle} style={{ textAlign: "center" }}>Attendance Summary</h2>
        <div style={{ display: "flex", gap: 16, marginBottom: 18, justifyContent: "center" }}>
          <input
            type="text"
            placeholder="Search employee..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #E2E8F0", width: 180 }}
          />
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #E2E8F0" }}
          />
          <button
            onClick={downloadCSV}
            style={{
              background: "#3478f6",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "8px 18px",
              fontSize: "1rem",
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "0 2px 8px rgba(52,120,246,0.10)",
              transition: "background 0.2s"
            }}
          >
            Download CSV
          </button>
        </div>
        <table style={{ width: "100%", marginTop: 8, borderRadius: 12, overflow: "hidden", boxShadow: "0 2px 8px #e2e8f0", border: "1px solid #E2E8F0" }}>
          <thead>
            <tr style={{ background: "#F7FAFC", color: "#0052CC", fontWeight: 600 }}>
              <th style={{ padding: "10px", border: "1px solid #E2E8F0" }}>Employee ID</th>
              <th style={{ padding: "10px", border: "1px solid #E2E8F0" }}>Employee Name</th>
              <th style={{ padding: "10px", border: "1px solid #E2E8F0" }}>Date</th>
              <th style={{ padding: "10px", border: "1px solid #E2E8F0" }}>Clock In</th>
              <th style={{ padding: "10px", border: "1px solid #E2E8F0" }}>Clock Out</th>
              <th style={{ padding: "10px", border: "1px solid #E2E8F0" }}>Total Hours</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", padding: 18 }}>No records found.</td>
              </tr>
            ) : (
              filtered.map((a, idx) => (
                <tr key={a.id} style={{ background: idx % 2 === 0 ? "#fff" : "#F7FAFC" }}>
                  <td style={{ padding: "10px", border: "1px solid #E2E8F0" }}>{a.employee_id}</td>
                  <td style={{ padding: "10px", border: "1px solid #E2E8F0" }}>{a.employee_name}</td>
                  <td style={{ padding: "10px", border: "1px solid #E2E8F0" }}>{formatDate(a.date)}</td>
                  <td style={{ padding: "10px", border: "1px solid #E2E8F0" }}>{formatTime(a.clock_in)}</td>
                  <td style={{ padding: "10px", border: "1px solid #E2E8F0" }}>{formatTime(a.clock_out)}</td>
                  <td style={{ padding: "10px", border: "1px solid #E2E8F0" }}>{formatTotalHours(a.clock_in, a.clock_out)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </LayoutDashboard>
  );
}
