
"use client";
import React, { useEffect, useState } from "react";
import LayoutDashboard from "../layout-dashboard";
import styles from "../dashboard/nexatech-theme.module.css";

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
        "EMPLOYEE ID", "",
        "EMPLOYEE NAME", "",
        "DATE", "", "",
        "BREAK START", "", "",
        "BREAK END", "", "",
        "TOTAL BREAK TIME", "", "",
        "EXCEED"
      ];
      const rows = rowsForCSV();
      let csv = '';
      csv += headers.join(',') + '\n';
      rows.forEach(row => {
        // Add one empty column after ID and NAME, two after others
        csv += [
          row[0], "",
          row[1], "",
          row[2], "", "",
          row[3], "", "",
          row[4], "", "",
          row[5], "", "",
          row[6]
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

    // Helper to get rows for CSV
    function rowsForCSV() {
      return rows.map(b => [
        b.employee_id,
        b.employee_name,
        b.date ? new Date(b.date).toLocaleString() : (b.break_start ? new Date(b.break_start).toLocaleString() : ""),
        b.break_start ? new Date(b.break_start).toLocaleString() : "",
        b.break_end ? new Date(b.break_end).toLocaleString() : "",
        b.total_break_time,
        b.exceed
      ]);
    }
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
      <div className={styles.card} style={{ maxWidth: 700, margin: "32px auto" }}>
        <h2 className={styles.cardTitle} style={{ textAlign: "center" }}>Break Summary</h2>
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
              background: "#e67e22",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "8px 18px",
              fontSize: "1rem",
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "0 2px 8px rgba(230,126,34,0.10)",
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
              <th style={{ padding: "10px", border: "1px solid #E2E8F0" }}>Break Start</th>
              <th style={{ padding: "10px", border: "1px solid #E2E8F0" }}>Break End</th>
              <th style={{ padding: "10px", border: "1px solid #E2E8F0" }}>Total Break Time</th>
              <th style={{ padding: "10px", border: "1px solid #E2E8F0" }}>Exceed</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: 18 }}>No records found.</td>
              </tr>
            ) : (
              rows.map((b, idx) => (
                <tr key={b.id} style={{ background: idx % 2 === 0 ? "#fff" : "#F7FAFC" }}>
                  <td style={{ padding: "10px", border: "1px solid #E2E8F0" }}>{b.employee_id}</td>
                  <td style={{ padding: "10px", border: "1px solid #E2E8F0" }}>{b.employee_name}</td>
                  <td style={{ padding: "10px", border: "1px solid #E2E8F0" }}>{b.date_display}</td>
                  <td style={{ padding: "10px", border: "1px solid #E2E8F0" }}>{b.break_start_display}</td>
                  <td style={{ padding: "10px", border: "1px solid #E2E8F0" }}>{b.break_end_display}</td>
                  <td style={{ padding: "10px", border: "1px solid #E2E8F0" }}>{b.total_break_time}</td>
                  <td style={{ padding: "10px", border: "1px solid #E2E8F0", color: b.exceed ? "#e74c3c" : undefined }}>{b.exceed}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </LayoutDashboard>
  );
}
