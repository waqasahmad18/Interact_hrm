
"use client";
import React, { useEffect, useState } from "react";
import LayoutDashboard from "../layout-dashboard";
import styles from "./attendance-summary.module.css";
import { FaFileExcel } from "react-icons/fa";

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
      <div className={styles.attendanceSummaryContainer}>
        <div className={styles.attendanceSummaryHeader}>Attendance Summary</div>
        <div className={styles.attendanceSummaryFilters}>
          <input
            type="text"
            placeholder="Search employee..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className={styles.attendanceSummaryInput}
            style={{ width: 180 }}
          />
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className={styles.attendanceSummaryDate}
          />
          <button
            onClick={downloadCSV}
            className={styles.attendanceSummaryXLSButton}
            title="Download XLS"
          >
            <FaFileExcel size={20} />
            <span>Export XLS</span>
          </button>
        </div>
        <div className={styles.attendanceSummaryTableWrapper}>
          <table className={styles.attendanceSummaryTable}>
            <thead>
              <tr>
                <th>Employee ID</th>
                <th>Employee Name</th>
                <th>Date</th>
                <th>Clock In</th>
                <th>Clock Out</th>
                <th>Total Hours</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className={styles.attendanceSummaryNoRecords}>No records found.</td>
                </tr>
              ) : (
                filtered.map((a, idx) => (
                  <tr key={a.id}>
                    <td>{a.employee_id}</td>
                    <td>{a.employee_name}</td>
                    <td>{formatDate(a.date)}</td>
                    <td>{formatTime(a.clock_in)}</td>
                    <td>{formatTime(a.clock_out)}</td>
                    <td>{formatTotalHours(a.clock_in, a.clock_out)}</td>
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
