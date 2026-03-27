"use client";

import React, { useEffect, useMemo, useState } from "react";
import LayoutDashboard from "../../layout-dashboard";
import attStyles from "../../attendance-summary/attendance-summary.module.css";
import { FaFileExcel } from "react-icons/fa";
import {
  getDateStringInTimeZone,
  getTimeStringInTimeZone,
  SERVER_TIMEZONE,
} from "../../../lib/timezone";

function getLocalDateString(date: Date = new Date()) {
  return getDateStringInTimeZone(date, SERVER_TIMEZONE);
}

function getCurrentMonthStartDateString(date: Date = new Date()) {
  const todayInTz = getDateStringInTimeZone(date, SERVER_TIMEZONE);
  if (!todayInTz) return "";
  return `${todayInTz.slice(0, 7)}-01`;
}

function formatTotalHours(clockIn?: string, clockOut?: string, currentTime?: number) {
  if (!clockIn) return "00h 00m 00s";
  const start = new Date(clockIn).getTime();
  const end = clockOut ? new Date(clockOut).getTime() : (currentTime || Date.now());
  const totalSeconds = Math.max(0, Math.floor((end - start) / 1000));
  const h = Math.floor(totalSeconds / 3600).toString().padStart(2, "0");
  const m = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, "0");
  const s = (totalSeconds % 60).toString().padStart(2, "0");
  return `${h}h ${m}m ${s}s`;
}

function formatDateOnly(dateValue?: string | null) {
  if (!dateValue) return "";
  const dateOnlyMatch = /^\d{4}-\d{2}-\d{2}$/.exec(dateValue);
  if (dateOnlyMatch) return dateValue;
  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) return dateValue;
  return getDateStringInTimeZone(parsed, SERVER_TIMEZONE);
}

function formatLateTime(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

export default function AttendanceSummaryPage() {
  const [attendance, setAttendance] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("");
  const [fromDate, setFromDate] = useState(() => getCurrentMonthStartDateString());
  const [toDate, setToDate] = useState(getLocalDateString());
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    fetch("/api/departments")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.departments) setDepartments(data.departments);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (fromDate) params.append("fromDate", fromDate);
    if (toDate) params.append("toDate", toDate);
    fetch(`/api/attendance?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        setAttendance(data.success ? (data.attendance || []) : []);
      })
      .catch(() => setAttendance([]));
  }, [fromDate, toDate]);

  useEffect(() => {
    const hasOpen = attendance.some((a) => a.clock_in && !a.clock_out);
    if (!hasOpen) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [attendance]);

  const rows = useMemo(
    () =>
      attendance
        .filter((a) => {
          if (search && !(a.employee_name || "").toLowerCase().includes(search.toLowerCase())) return false;
          if (department && a.department_name !== department) return false;
          return true;
        })
        .sort((a, b) => {
          const aTime = new Date(a.clock_out || a.clock_in || 0).getTime();
          const bTime = new Date(b.clock_out || b.clock_in || 0).getTime();
          return bTime - aTime;
        }),
    [attendance, search, department]
  );

  const downloadCSV = () => {
    const headers = ["Id", "Full Name", "P.Name", "Department", "Date", "Clock In", "Clock Out", "Total Hours", "Late"];
    let csv = headers.join(",    ") + "\n";
    rows.forEach((row) => {
      csv += [
        row.employee_id,
        row.employee_name || "",
        row.pseudonym || "-",
        row.department_name || "-",
        formatDateOnly(row.clock_in || row.clock_out || row.date),
        row.clock_in ? getTimeStringInTimeZone(row.clock_in, SERVER_TIMEZONE) : "",
        row.clock_out ? getTimeStringInTimeZone(row.clock_out, SERVER_TIMEZONE) : "Running...",
        formatTotalHours(row.clock_in, row.clock_out, now),
        row.is_late ? `Late ${formatLateTime(row.late_minutes || 0)}` : "On Time",
      ].join(",    ") + "\n";
    });
    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "attendance_summary.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  return (
    <LayoutDashboard>
      <div style={{ width: "100%", minHeight: "calc(100vh - 20px)", background: "linear-gradient(135deg, #6a82fb 0%, #fc5c7d 100%)", paddingBottom: 24 }}>
        <h1 style={{ marginTop: 24, marginBottom: 24, color: "#fff", fontWeight: 700, fontSize: "1.75rem" }}>Attendance Summary</h1>
        <div className={attStyles.attendanceSummaryContainer}>
          <div className={attStyles.attendanceSummaryFilters}>
            <input type="text" placeholder="Search employee..." value={search} onChange={(e) => setSearch(e.target.value)} className={attStyles.attendanceSummaryInput} style={{ width: 180 }} />
            <select value={department} onChange={(e) => setDepartment(e.target.value)} className={attStyles.attendanceSummaryDate} style={{ width: 180 }}>
              <option value="">All Departments</option>
              {departments.map((dept) => <option key={dept.id} value={dept.name}>{dept.name}</option>)}
            </select>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={attStyles.attendanceSummaryDate} />
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className={attStyles.attendanceSummaryDate} />
            <button onClick={downloadCSV} className={attStyles.attendanceSummaryXLSButton} title="Download XLS">
              <FaFileExcel size={20} />
              <span>Export XLS</span>
            </button>
          </div>
          <div className={`${attStyles.attendanceSummaryTableWrapper} ${attStyles.timeAttendanceTableWrapper}`} style={{ width: "100%", overflowX: "auto" }}>
            <table className={`${attStyles.attendanceSummaryTable} ${attStyles.timeAttendanceStickyTable}`}>
              <thead>
                <tr style={{ background: "linear-gradient(135deg, #0052CC 0%, #00B8A9 100%)", color: "#fff" }}>
                  <th>Id</th><th>Full Name</th><th>P.Name</th><th>Department</th><th>Date</th><th>Clock In</th><th>Clock Out</th><th>Total Hours</th><th>Late</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={9} className={attStyles.attendanceSummaryNoRecords}>No records found.</td></tr>
                ) : rows.map((a, idx) => (
                  <tr key={a.id || idx}>
                    <td>{a.employee_id}</td>
                    <td>{a.employee_name || ""}</td>
                    <td>{a.pseudonym || "-"}</td>
                    <td>{a.department_name || "-"}</td>
                    <td>{formatDateOnly(a.clock_in || a.clock_out || a.date)}</td>
                    <td>{a.clock_in ? getTimeStringInTimeZone(a.clock_in, SERVER_TIMEZONE) : ""}</td>
                    <td>{a.clock_out ? getTimeStringInTimeZone(a.clock_out, SERVER_TIMEZONE) : <span style={{ color: "#e67e22", fontWeight: 600 }}>Running...</span>}</td>
                    <td>{formatTotalHours(a.clock_in, a.clock_out, now)}</td>
                    <td style={{ color: a.is_late ? "#e74c3c" : "#27ae60", fontWeight: 600 }}>
                      {a.is_late ? `Late ${formatLateTime(a.late_minutes || 0)}` : "On Time"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </LayoutDashboard>
  );
}

