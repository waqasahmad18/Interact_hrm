"use client";
import React, { useEffect, useState } from "react";
import LayoutDashboard from "../../layout-dashboard";
import styles from "./prayer-summary.module.css";
import { FaFileExcel } from "react-icons/fa";

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
      <div className={styles.prayerSummaryContainer}>
        <div className={styles.prayerSummaryHeader}>Prayer Break Summary</div>
        <div className={styles.prayerSummaryFilters}>
          <input
            type="text"
            placeholder="Search employee..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className={styles.prayerSummaryInput}
            style={{ width: 180 }}
          />
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className={styles.prayerSummaryDate}
          />
          <button
            onClick={downloadCSV}
            className={styles.prayerSummaryXLSButton}
            title="Download XLS"
          >
            <FaFileExcel size={20} />
            <span>Export XLS</span>
          </button>
        </div>
        <div className={styles.prayerSummaryTableWrapper}>
          <table className={styles.prayerSummaryTable}>
            <thead>
              <tr>
                <th>Employee ID</th>
                <th>Employee Name</th>
                <th>Date</th>
                <th>Prayer Break Start</th>
                <th>Prayer Break End</th>
                <th>Prayer Break Duration</th>
              </tr>
            </thead>
            <tbody>
              {prayerBreaks.length === 0 ? (
                <tr>
                  <td colSpan={6} className={styles.prayerSummaryNoRecords}>No records found.</td>
                </tr>
              ) : (
                prayerBreaks.map((b, idx) => (
                  <tr key={b.id || idx}>
                    <td>{b.employee_id}</td>
                    <td>{b.employee_name}</td>
                    <td>{b.date ? new Date(b.date).toLocaleDateString() : ""}</td>
                    <td>{b.prayer_break_start ? new Date(b.prayer_break_start).toLocaleTimeString() : ""}</td>
                    <td>{b.prayer_break_end ? new Date(b.prayer_break_end).toLocaleTimeString() : ""}</td>
                    <td>{b.prayer_break_duration !== undefined && b.prayer_break_duration !== null ? formatDuration(Number(b.prayer_break_duration)) : ""}</td>
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
