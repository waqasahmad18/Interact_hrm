"use client";
import React, { useEffect, useState } from "react";
import LayoutDashboard from "../../layout-dashboard";
import styles from "../../dashboard/nexatech-theme.module.css";

export default function PrayerBreakSummaryPage() {
      // Helper to format duration in hh:mm:ss
      function formatDuration(seconds: number) {
        const h = Math.floor(seconds / 3600).toString().padStart(2, "0");
        const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, "0");
        const s = (seconds % 60).toString().padStart(2, "0");
        return `${h}h ${m}m ${s}s`;
      }
    // Download filtered prayer breaks as CSV
    function downloadCSV() {
      const headers = [
        "EMPLOYEE ID", "",
        "EMPLOYEE NAME", "",
        "DATE", "",
        "PRAYER BREAK START", "",
        "PRAYER BREAK END", "",
        "PRAYER BREAK DURATION"
      ];
      const rows = prayerBreaks.map(b => [
        b.employee_id, "",
        b.employee_name, "",
        b.date ? new Date(b.date).toLocaleDateString() : "", "",
        b.prayer_break_start ? new Date(b.prayer_break_start).toLocaleTimeString() : "", "",
        b.prayer_break_end ? new Date(b.prayer_break_end).toLocaleTimeString() : "", "",
        b.prayer_break_duration ?? ""
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
      a.download = 'prayer_break_summary.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    }
  const [prayerBreaks, setPrayerBreaks] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [selectedDate, setSelectedDate] = useState("");

  useEffect(() => {
    async function fetchPrayerBreaks() {
      let url = "/api/prayer_breaks";
      const params = [];
      if (search) params.push(`employeeId=${encodeURIComponent(search)}`);
      if (selectedDate) params.push(`date=${encodeURIComponent(selectedDate)}`);
      if (params.length) url += `?${params.join("&")}`;
      try {
        const res = await fetch(url);
        const data = await res.json();
        if (data.success) {
          setPrayerBreaks(data.prayer_breaks || []);
        } else {
          setPrayerBreaks([]);
        }
      } catch {
        setPrayerBreaks([]);
      }
    }
    fetchPrayerBreaks();
  }, [search, selectedDate]);

  return (
    <LayoutDashboard>
      <div className={styles.card} style={{ maxWidth: 700, margin: "32px auto" }}>
        <h2 className={styles.cardTitle} style={{ textAlign: "center" }}>Prayer Break Summary</h2>
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
              background: "#16a085",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "8px 18px",
              fontSize: "1rem",
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "0 2px 8px rgba(22,160,133,0.10)",
              transition: "background 0.2s"
            }}
          >
            Download CSV
          </button>
        </div>
        <div style={{ width: "100%", overflowX: "auto", marginTop: 8 }}>
          <table style={{ minWidth: 900, borderRadius: 12, overflow: "hidden", boxShadow: "0 2px 8px #e2e8f0", border: "1px solid #E2E8F0" }}>
            <thead>
              <tr style={{ background: "#F7FAFC", color: "#0052CC", fontWeight: 600 }}>
                <th style={{ padding: "10px", border: "1px solid #E2E8F0" }}>Employee ID</th>
                <th style={{ padding: "10px", border: "1px solid #E2E8F0" }}>Employee Name</th>
                <th style={{ padding: "10px", border: "1px solid #E2E8F0" }}>Date</th>
                <th style={{ padding: "10px", border: "1px solid #E2E8F0" }}>Prayer Break Start</th>
                <th style={{ padding: "10px", border: "1px solid #E2E8F0" }}>Prayer Break End</th>
                <th style={{ padding: "10px", border: "1px solid #E2E8F0" }}>Prayer Break Duration</th>
              </tr>
            </thead>
            <tbody>
              {prayerBreaks.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: 18 }}>No records found.</td>
                </tr>
              ) : (
                prayerBreaks.map((b, idx) => (
                  <tr key={b.id || idx} style={{ background: idx % 2 === 0 ? "#fff" : "#F7FAFC" }}>
                    <td style={{ padding: "10px", border: "1px solid #E2E8F0" }}>{b.employee_id}</td>
                    <td style={{ padding: "10px", border: "1px solid #E2E8F0" }}>{b.employee_name}</td>
                    <td style={{ padding: "10px", border: "1px solid #E2E8F0" }}>{b.date ? new Date(b.date).toLocaleDateString() : ""}</td>
                    <td style={{ padding: "10px", border: "1px solid #E2E8F0" }}>{b.prayer_break_start ? new Date(b.prayer_break_start).toLocaleTimeString() : ""}</td>
                    <td style={{ padding: "10px", border: "1px solid #E2E8F0" }}>{b.prayer_break_end ? new Date(b.prayer_break_end).toLocaleTimeString() : ""}</td>
                    <td style={{ padding: "10px", border: "1px solid #E2E8F0" }}>{b.prayer_break_duration !== undefined && b.prayer_break_duration !== null ? formatDuration(Number(b.prayer_break_duration)) : ""}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </LayoutDashboard>
  );
}
