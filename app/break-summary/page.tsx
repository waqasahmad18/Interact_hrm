
"use client";
import Link from "next/link";
import React, { useEffect, useState } from "react";
import LayoutDashboard from "../layout-dashboard";
import styles from "./break-summary.module.css";
import { FaFileExcel } from "react-icons/fa";

// Helper to format duration in hh:mm:ss
function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600).toString().padStart(2, "0");
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${h}h ${m}m ${s}s`;
}

export default function BreakSummaryPage() {
    // Download filtered break summary as CSV
    function downloadCSV() {
      const headers = [
        "Employee ID",
        "Employee Name",
        "Date",
        "Break Start",
        "Break End",
        "Total Break Time",
        "Exceed"
      ];
      let csv = '';
      csv += headers.join(',') + '\n';
      rows.forEach(row => {
        csv += [
          row.employee_id,
          row.employee_name,
          row.date_display,
          row.break_start_display,
          row.break_end_display,
          row.total_break_time,
          row.exceed
        ].map(val => `"${val}"`).join(',') + '\n';
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
    }

    // Remove rowsForCSV, now using rows directly for CSV
  const [breaks, setBreaks] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [selectedDate, setSelectedDate] = useState("");

  useEffect(() => {
    // Fetch breaks from API, filter by date if selected
    let url = "/api/breaks";
    if (selectedDate) {
      url += `?date=${selectedDate}`;
    }
    fetch(url)
      .then(res => res.json())
      .then(data => {
        if (data.success) setBreaks(data.breaks);
        else setBreaks([]);
      });
  }, [selectedDate]);

  // Filter by employee name
  const filtered = breaks.filter(b => {
    if (!search) return true;
    return (b.employee_name || "").toLowerCase().includes(search.toLowerCase());
  });

  // Calculate total break time and exceed
  const rows = filtered.map(b => {
    let totalBreakSeconds = 0;
    if (b.break_start && b.break_end) {
      const start = new Date(b.break_start).getTime();
      const end = new Date(b.break_end).getTime();
      totalBreakSeconds = Math.floor((end - start) / 1000);
    }
    const exceed = totalBreakSeconds > 3600 ? totalBreakSeconds - 3600 : 0;
    return {
      ...b,
      employee_name: b.employee_name || b.name || b.username || "", // fallback for missing name
      break_start_display: b.break_start ? new Date(b.break_start).toLocaleTimeString() : "",
      break_end_display: b.break_end ? new Date(b.break_end).toLocaleTimeString() : "",
      total_break_time: formatDuration(totalBreakSeconds),
      exceed: exceed > 0 ? formatDuration(exceed) : "",
      date_display: b.date ? new Date(b.date).toLocaleDateString() : (b.break_start ? new Date(b.break_start).toLocaleDateString() : "")
    };
  });

  return (
    <LayoutDashboard>
      <div className={styles.breakSummaryContainer}>
        <div className={styles.breakSummaryHeader}>Break Summary</div>
        <div className={styles.breakSummaryFilters}>
          <input
            type="text"
            placeholder="Search employee..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className={styles.breakSummaryInput}
            style={{ width: 180 }}
          />
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className={styles.breakSummaryDate}
          />
          <button
            onClick={downloadCSV}
            className={styles.breakSummaryXLSButton}
            title="Download XLS"
          >
            <FaFileExcel size={20} />
            <span>Export XLS</span>
          </button>
        </div>
        <div className={styles.breakSummaryTableWrapper}>
          <table className={styles.breakSummaryTable}>
            <thead>
              <tr>
                <th>Employee ID</th>
                <th>Employee Name</th>
                <th>Date</th>
                <th>Break Start</th>
                <th>Break End</th>
                <th>Total Break Time</th>
                <th>Exceed</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={12} className={styles.breakSummaryNoRecords}>No records found.</td>
                </tr>
              ) : (
                rows.map((b, idx) => (
                  <tr key={b.id || idx}>
                    <td>{b.employee_id}</td>
                    <td>{b.employee_name}</td>
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
    </LayoutDashboard>
  );
        {/* Sidebar */}
        <div style={{ width: 220, background: "#f7fafc", borderRight: "1px solid #e2e8f0", padding: "24px 0", display: "flex", flexDirection: "column", gap: 12 }}>
          <Link href="/break-summary" style={{ padding: "12px 24px", fontWeight: 600, color: "#2d3436", textDecoration: "none", borderRadius: 8, background: "#fff" }}>Break Summary</Link>
          <Link href="/break-summary/prayer" style={{ padding: "12px 24px", fontWeight: 600, color: "#2d3436", textDecoration: "none", borderRadius: 8, background: "#fff" }}>Prayer Break Summary</Link>
        </div>
}
