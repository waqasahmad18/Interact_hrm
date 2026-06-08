"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import LayoutDashboard from "../layout-dashboard";
import styles from "./attendance-summary.module.css";
import { FaFileExcel } from "react-icons/fa";
import { compareAttendanceRows } from "../../lib/attendance-sort";
import {
  filterImportedRows,
  loadImportedAttendanceSummarySnapshot,
  parseAttendanceSummaryWorkbook,
  saveImportedAttendanceSummarySnapshot,
  type ImportedAttendanceSummarySnapshot,
} from "../../lib/attendance-summary-import";
import { getDateStringInTimeZone, getParts, getTimeStringInTimeZone, SERVER_TIMEZONE } from "../../lib/timezone";
import { AutoClockOutBadge } from "../components/AutoClockOutBadge";
import { isAutoClockOutRecord } from "../../lib/attendance-auto-clock-out";

function getLocalDateString(date: Date = new Date()) {
  return getDateStringInTimeZone(date, SERVER_TIMEZONE);
}

function getMonthStartDateString(date: Date = new Date()) {
  const d = getDateStringInTimeZone(date, SERVER_TIMEZONE);
  return `${d.slice(0, 7)}-01`;
}

function formatDateOnly(dateValue: string | null | undefined) {
  if (!dateValue) return "";
  const dateOnlyMatch = /^\d{4}-\d{2}-\d{2}$/.exec(dateValue);
  if (dateOnlyMatch) return dateValue;
  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) return dateValue;
  return getDateStringInTimeZone(parsed, SERVER_TIMEZONE);
}

function formatTotalHours(clockIn: string, clockOut: string, currentTime?: number) {
  if (!clockIn) return "00h 00m 00s";
  const clockInParts = getParts(clockIn, SERVER_TIMEZONE);
  if (!clockInParts) return "00h 00m 00s";
  const start = new Date(
    Date.UTC(
      clockInParts.year,
      clockInParts.month - 1,
      clockInParts.day,
      clockInParts.hour,
      clockInParts.minute,
      clockInParts.second
    )
  ).getTime();

  let end = currentTime || Date.now();
  if (clockOut) {
    const clockOutParts = getParts(clockOut, SERVER_TIMEZONE);
    if (!clockOutParts) return "00h 00m 00s";
    end = new Date(
      Date.UTC(
        clockOutParts.year,
        clockOutParts.month - 1,
        clockOutParts.day,
        clockOutParts.hour,
        clockOutParts.minute,
        clockOutParts.second
      )
    ).getTime();
  } else {
    const nowParts = getParts(new Date(end), SERVER_TIMEZONE);
    if (!nowParts) return "00h 00m 00s";
    end = new Date(
      Date.UTC(
        nowParts.year,
        nowParts.month - 1,
        nowParts.day,
        nowParts.hour,
        nowParts.minute,
        nowParts.second
      )
    ).getTime();
  }
  const totalSeconds = Math.floor((end - start) / 1000);
  const h = Math.floor(totalSeconds / 3600).toString().padStart(2, "0");
  const m = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, "0");
  const s = (totalSeconds % 60).toString().padStart(2, "0");
  return `${h}h ${m}m ${s}s`;
}

function formatLateTime(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

export default function AttendanceSummaryPage() {
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("");
  const [fromDate, setFromDate] = useState(getMonthStartDateString());
  const [toDate, setToDate] = useState(getLocalDateString());
  const [attendance, setAttendance] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [now, setNow] = useState(Date.now());
  const [importedSnapshot, setImportedSnapshot] = useState<ImportedAttendanceSummarySnapshot | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const filterMonth = fromDate.slice(0, 7);
  const showingImported = Boolean(
    importedSnapshot?.month === filterMonth &&
      importedSnapshot.month === toDate.slice(0, 7) &&
      importedSnapshot.rows.length,
  );

  useEffect(() => {
    fetch("/api/departments")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setDepartments(data.departments || []);
      })
      .catch(() => setDepartments([]));
  }, []);

  useEffect(() => {
    setImportedSnapshot(loadImportedAttendanceSummarySnapshot(filterMonth));
  }, [filterMonth]);

  useEffect(() => {
    if (showingImported) return;
    const params = new URLSearchParams();
    if (fromDate) params.append("fromDate", fromDate);
    if (toDate) params.append("toDate", toDate);
    const url = `/api/attendance${params.toString() ? `?${params.toString()}` : ""}`;

    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setAttendance(data.attendance || []);
        else setAttendance([]);
      });
  }, [fromDate, toDate, showingImported]);

  useEffect(() => {
    const hasOpen = attendance.some((a) => a.clock_in && !a.clock_out);
    if (!hasOpen) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [attendance]);

  const rows = useMemo(() => {
    if (showingImported && importedSnapshot) {
      return filterImportedRows(importedSnapshot, fromDate, toDate, search, department);
    }
    return attendance
      .filter((a) => {
        const term = search.trim().toLowerCase();
        if (term) {
          const employeeName = (a.employee_name || "").toLowerCase();
          const pseudonym = (a.pseudonym || "").toLowerCase();
          if (!employeeName.includes(term) && !pseudonym.includes(term)) return false;
        }
        if (department && a.department_name !== department) return false;
        return true;
      })
      .sort(compareAttendanceRows);
  }, [attendance, search, department, showingImported, importedSnapshot, fromDate, toDate]);

  const downloadAttendanceCSV = () => {
    const headers = ["Id", "Full Name", "P.Name", "Department", "Date", "Clock In", "Clock Out", "Total Hours", "Late"];
    let csv = headers.join(",") + "\n";
    rows.forEach((row: any) => {
      if (showingImported) {
        csv += [
          row.employeeId,
          row.employeeName,
          row.pseudonym,
          row.departmentName,
          row.dateDisplay,
          row.clockIn,
          row.clockOut,
          row.totalHours,
          row.late,
        ]
          .map((v) => `"${v}"`)
          .join(",") + "\n";
        return;
      }
      const date = row.date ? getDateStringInTimeZone(row.date, SERVER_TIMEZONE) : "";
      const clockIn = row.clock_in ? getTimeStringInTimeZone(row.clock_in, SERVER_TIMEZONE) : "";
      const clockOut = row.clock_out ? getTimeStringInTimeZone(row.clock_out, SERVER_TIMEZONE) : "";
      const totalHours = formatTotalHours(row.clock_in, row.clock_out, now);
      const late = row.is_late ? `Late ${formatLateTime(row.late_minutes || 0)}` : "On Time";
      csv += [
        row.employee_id,
        row.employee_name || "",
        row.pseudonym || "-",
        row.department_name || "-",
        date,
        clockIn,
        clockOut,
        totalHours,
        late,
      ]
        .map((v) => `"${v}"`)
        .join(",") + "\n";
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

  const handleImportClick = () => {
    importInputRef.current?.click();
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buffer = await file.arrayBuffer();
      const snapshot = parseAttendanceSummaryWorkbook(buffer);
      if (!snapshot.rows.length) {
        alert("No rows found. Use attendance summary format (Id, Full Name, Date, Clock In, Clock Out, etc.).");
        return;
      }
      if (!snapshot.month) {
        alert("Could not detect month from file dates.");
        return;
      }
      saveImportedAttendanceSummarySnapshot(snapshot);
      setImportedSnapshot(snapshot);
      setFromDate(snapshot.fromDate);
      setToDate(snapshot.toDate);
      alert(`Loaded ${snapshot.rows.length} rows for ${snapshot.month}. Date filter set to imported range.`);
    } catch (err) {
      alert(String(err));
    } finally {
      e.target.value = "";
    }
  };

  return (
    <LayoutDashboard>
      <div className={styles.attendanceSummaryContainer}>
        <h1 style={{ marginBottom: 16 }}>Attendance Summary</h1>
        {showingImported && (
          <p style={{ color: "#6B46C1", fontSize: "0.85rem", marginBottom: 12, fontWeight: 600 }}>
            Showing imported Excel data for {filterMonth} (sheet values as-is)
          </p>
        )}
        <div className={styles.attendanceSummaryFilters}>
          <input type="text" placeholder="Search employee..." value={search} onChange={(e) => setSearch(e.target.value)} className={styles.attendanceSummaryInput} style={{ width: 220 }} />
          <select value={department} onChange={(e) => setDepartment(e.target.value)} className={styles.attendanceSummaryDate} style={{ width: 200 }}>
            <option value="">All Departments</option>
            {departments.map((dept: any) => (
              <option key={dept.id} value={dept.name}>{dept.name}</option>
            ))}
          </select>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className={styles.attendanceSummaryDate}
            placeholder="From Date"
          />
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className={styles.attendanceSummaryDate}
            placeholder="To Date"
          />
          <button onClick={downloadAttendanceCSV} className={styles.attendanceSummaryXLSButton} title="Download XLS">
            <FaFileExcel size={20} />
            <span>Export XLS</span>
          </button>
          <button onClick={handleImportClick} className={styles.attendanceSummaryXLSButton} title="Import XLS">
            <FaFileExcel size={20} />
            <span>Import XLS</span>
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleImportFile}
            style={{ display: "none" }}
          />
        </div>

        <div className={styles.attendanceSummaryTableWrapper}>
          <table className={styles.attendanceSummaryTable}>
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
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className={styles.attendanceSummaryNoRecords}>No records found.</td>
                </tr>
              ) : (
                rows.map((a: any, idx) => {
                  if (showingImported) {
                    const isRunning =
                      !a.clockOut ||
                      a.clockOut.toLowerCase() === "running..." ||
                      a.clockOut.toLowerCase() === "running";
                    return (
                      <tr key={a.id || idx}>
                        <td>{a.employeeId}</td>
                        <td>{a.employeeName}</td>
                        <td>{a.pseudonym}</td>
                        <td>{a.departmentName}</td>
                        <td>{a.dateDisplay}</td>
                        <td>{a.clockIn}</td>
                        <td>
                          {isRunning ? (
                            <span style={{ color: "#e67e22", fontWeight: 600 }}>Running...</span>
                          ) : (
                            a.clockOut
                          )}
                        </td>
                        <td>{a.totalHours}</td>
                        <td
                          style={{
                            color: a.lateIsNegative ? "#e74c3c" : "#27ae60",
                            fontWeight: 600,
                          }}
                        >
                          {a.late}
                        </td>
                      </tr>
                    );
                  }
                  return (
                    <tr key={a.id || idx}>
                      <td>{a.employee_id}</td>
                      <td>{a.employee_name || ""}</td>
                      <td>{a.pseudonym || "-"}</td>
                      <td>{a.department_name || "-"}</td>
                      <td>{formatDateOnly(a.clock_in || a.clock_out || a.date)}</td>
                      <td>{a.clock_in ? getTimeStringInTimeZone(a.clock_in, SERVER_TIMEZONE) : ""}</td>
                      <td>
                        {a.clock_out ? (
                          <>
                            {getTimeStringInTimeZone(a.clock_out, SERVER_TIMEZONE)}
                            {isAutoClockOutRecord(a.auto_clock_out) ? <AutoClockOutBadge /> : null}
                          </>
                        ) : (
                          <span style={{ color: "#e67e22", fontWeight: 600 }}>Running...</span>
                        )}
                      </td>
                      <td>
                        {a.clock_in && !a.clock_out
                          ? formatTotalHours(a.clock_in, "", now)
                          : formatTotalHours(a.clock_in, a.clock_out, now)}
                      </td>
                      <td style={{ color: a.is_late ? "#e74c3c" : "#27ae60", fontWeight: 600 }}>
                        {a.is_late ? `Late ${formatLateTime(a.late_minutes || 0)}` : "On Time"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </LayoutDashboard>
  );
}
