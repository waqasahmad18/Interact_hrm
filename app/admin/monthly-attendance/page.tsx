"use client";

import React, { useEffect, useRef, useState } from "react";
import LayoutDashboard from "../../layout-dashboard";
import styles from "../../attendance-summary/attendance-summary.module.css";
import { FaFileExcel } from "react-icons/fa";
import {
  downloadMonthlyAttendanceExcel,
  type MonthlyAttendanceExcelRow,
} from "../../../lib/monthly-attendance-excel";
import {
  downloadDeductionSummaryExcel,
  parseDeductionPercent,
  type DeductionSummaryDayRow,
  type DeductionSummaryEmployeeBlock,
} from "../../../lib/deduction-summary-excel";
import {
  getDateStringInTimeZone,
  getParts,
  getTimeStringInTimeZone,
  SERVER_TIMEZONE,
} from "../../../lib/timezone";
import { compareAttendanceRows } from "../../../lib/attendance-sort";
import {
  normalizeAttendanceStatus,
  uiStatusTextColor,
} from "../../../lib/attendance-status";
import {
  aggregateDayPunches,
  classifyDayAttendance,
  STATUS_FIRST_HALF_DAY,
  STATUS_SECOND_HALF_DAY,
} from "../../../lib/monthly-attendance-status";
import {
  formatImportedRunningLate,
  getImportedDayDisplayFields,
  importedEmployeeUsesFiveHourShift,
  importedSnapshotToAttendanceEmployees,
  loadImportedMonthlySnapshot,
  parseMonthlyAttendanceWorkbook,
  saveImportedMonthlySnapshot,
  type ImportedMonthlyDay,
  type ImportedMonthlySnapshot,
} from "../../../lib/monthly-attendance-import";
import {
  buildEmployeeReportSessions,
  loadTungstenPunchContext,
  monthlyDash,
  type EmployeeReportSession,
  type TungstenPunchContext,
} from "../../../lib/tungsten-punch-pairing";
import { AutoClockOutBadge } from "../../components/AutoClockOutBadge";
import { isAutoClockOutRecord } from "../../../lib/attendance-auto-clock-out";

type MonthlyAttendanceEmployeeRow = {
  employeeId: string;
  employeeName: string;
  pseudonym: string;
  departmentName: string;
  gender: string;
  byDate: Record<string, any[]>;
  dateMeta: Record<
    string,
    { runningLate: number | string; statusLabel: string; statusColor: string; deduction: string }
  >;
  isImported?: boolean;
  importedDays?: ImportedMonthlyDay[];
  importedFooter?: { totalDeduction?: string; extraHours?: string; workingDays?: string };
};

// ...existing code...

interface AttendanceRecord {
  id: number;
  employee_id: string;
  employee_name: string;
  pseudonym: string;
  department_name: string;
  date: string;
  clock_in: string | null;
  clock_out: string | null;
  total_hours: string;
  is_late: boolean;
  late_minutes: number | null;
}

interface CalendarDayOverride {
  date: string;
  status: "off" | "working";
  note?: string | null;
}

function normalizeToDateKey(value: string) {
  if (!value) return "";
  const dateOnlyMatch = /^\d{4}-\d{2}-\d{2}$/.exec(value);
  if (dateOnlyMatch) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value.split("T")[0] || "";
  return getDateStringInTimeZone(parsed, SERVER_TIMEZONE);
}

function addDaysToDateKey(dateKey: string, daysToAdd: number) {
  const [yearStr, monthStr, dayStr] = dateKey.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  if (!year || !month || !day) return dateKey;
  const utc = new Date(Date.UTC(year, month - 1, day + daysToAdd));
  return `${utc.getUTCFullYear()}-${String(utc.getUTCMonth() + 1).padStart(2, "0")}-${String(utc.getUTCDate()).padStart(2, "0")}`;
}

export default function MonthlyAttendancePage() {
    // Calculate total working days for the month (excluding leaves and off days)
    function getTotalWorkingDays(employee: any, monthInfo: any, approvedLeavesMap: any) {
      let count = 0;
      if (!monthInfo || !monthInfo.days) return count;
      monthInfo.days.forEach((day: any) => {
        const workingDay = isWorkingDay(day.dateKey);
        // Exclude off days and approved leaves
        if (workingDay) {
          const isLeave = approvedLeavesMap[employee.employeeId]?.[day.dateKey];
          if (!isLeave) count++;
        }
      });
      return count;
    }
  // Format hours and minutes only (remove seconds)
  function formatHoursMins(duration: string) {
    // Expects format: 01h 38m 02s
    const match = duration.match(/(\d{2})h (\d{2})m/);
    if (match) {
      return `${match[1]}h ${match[2]}m`;
    }
    return duration;
  }

  // Calculate overtime in seconds (actual - shift duration)
  // Calculate assigned shift duration in seconds
  function getAssignedShiftSeconds(shiftStart: string | null | undefined, shiftEnd: string | null | undefined): number | null {
    const timeRegex = /^\d{2}:\d{2}(:\d{2})?$/;
    if (!shiftStart || !shiftEnd ||
        typeof shiftStart !== 'string' || typeof shiftEnd !== 'string' ||
        !timeRegex.test(shiftStart) || !timeRegex.test(shiftEnd)) {
      return null;
    }
    const [startH, startM] = shiftStart.split(":").map(Number);
    const [endH, endM] = shiftEnd.split(":").map(Number);
    if (
      isNaN(startH) || isNaN(startM) ||
      isNaN(endH) || isNaN(endM)
    ) return null;
    let shiftSeconds = (endH * 3600 + endM * 60) - (startH * 3600 + startM * 60);
    if (shiftSeconds < 0) shiftSeconds += 24 * 3600;
    return shiftSeconds;
  }

  // Calculate overtime in seconds (actual - shift duration)
  function calculateOvertime(totalSeconds: number, assignedShiftSeconds: number | null): number | null {
    if (!assignedShiftSeconds || assignedShiftSeconds <= 0) return null;
    const overtime = totalSeconds - assignedShiftSeconds;
    // Only count/show overtime if >= 45 minutes (2700 seconds)
    if (overtime >= 2700) return overtime;
    return null;
  }

  function formatDurationHM(seconds: number | null) {
    if (!seconds || seconds <= 0) return "-";
    const h = Math.floor(seconds / 3600).toString().padStart(2, "0");
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, "0");
    return `${h}h ${m}m`;
  }

  /** Use UI display text when already formatted (imported rows), else format seconds. */
  function formatDurationForExport(value: number | string | null | undefined) {
    if (value == null || value === "" || value === "---" || value === "-") return "---";
    if (typeof value === "string") {
      const s = value.trim();
      if (!s) return "---";
      if (/h\s*m/i.test(s)) return s;
      return s;
    }
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      const formatted = formatDurationHM(value);
      return formatted === "-" ? "---" : formatted;
    }
    return "---";
  }

  function excelClockForExport(record: any, kind: "in" | "out") {
    const imported = record._importedDay;
    if (imported) {
      const v = kind === "in" ? imported.clockIn : imported.clockOut;
      return v && v !== "---" && v !== "-" ? v : "---";
    }
    const formatted = formatTime(kind === "in" ? record.clock_in : record.clock_out);
    return formatted === "-" ? "---" : formatted;
  }

  function excelTotalHoursForExport(record: any) {
    if (record._importedDay?.totalWH) {
      const v = record._importedDay.totalWH;
      return v && v !== "---" ? v : "---";
    }
    return record.total_hours ? formatHoursMins(record.total_hours) : "---";
  }

  function excelAssignedWHForExport(record: any) {
    if (record._importedDay?.assignedWH) {
      const v = record._importedDay.assignedWH;
      return v && v !== "---" ? v : "---";
    }
    if (record.assigned_working_hours) return formatHoursMins(record.assigned_working_hours);
    return formatDurationForExport(record.assigned_shift_seconds);
  }

  function excelOvertimeForExport(record: any) {
    if (record._importedDay?.overtime) {
      return formatDurationForExport(record._importedDay.overtime);
    }
    return formatDurationForExport(record.overtime);
  }

  const [attendance, setAttendance] = useState<any[]>([]);
  const [tardyNotes, setTardyNotes] = useState<Record<string, Record<string, string>>>({});
  const [tardyNotesByAttendanceId, setTardyNotesByAttendanceId] = useState<Record<string, string>>({});
  const [departments, setDepartments] = useState<any[]>([]);
  const [searchName, setSearchName] = useState("");
  const [selectedDepartment, setSelectedDepartment] = useState("");
  
  // Set default dates - start of current month to today
  const today = new Date();
  const todayStr = getDateStringInTimeZone(today);
  const firstDayOfMonth = `${todayStr.slice(0, 7)}-01`;
  
  const [fromDate, setFromDate] = useState(firstDayOfMonth);
  const [toDate, setToDate] = useState(todayStr);
  const [loading, setLoading] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(
    todayStr.slice(0, 7)
  );
  const [calendarOverrides, setCalendarOverrides] = useState<Record<string, CalendarDayOverride>>({});
  const [approvedLeavesMap, setApprovedLeavesMap] = useState<Record<string, Record<string, boolean>>>({});
  const [importedSnapshot, setImportedSnapshot] = useState<ImportedMonthlySnapshot | null>(null);
  const [tungstenCtx, setTungstenCtx] = useState<TungstenPunchContext | null>(null);
  const [pairingNow, setPairingNow] = useState(() => Date.now());
  const importInputRef = useRef<HTMLInputElement>(null);

  const showingImported =
    Boolean(importedSnapshot?.month && importedSnapshot.month === selectedMonth && importedSnapshot.employees.length);

  // Re-pair T.Punch out as new ZKBio punches sync in after clock-out.
  useEffect(() => {
    if (showingImported) return;
    const refreshPairing = () => {
      setPairingNow(Date.now());
      loadTungstenPunchContext(fromDate, toDate, selectedDepartment || undefined)
        .then(setTungstenCtx)
        .catch(() => {});
    };
    const id = setInterval(refreshPairing, 30_000);
    return () => clearInterval(id);
  }, [fromDate, toDate, selectedDepartment, showingImported]);

  // Fetch departments
  useEffect(() => {
    fetch('/api/departments')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.departments) {
          setDepartments(data.departments);
        }
      })
      .catch(err => console.error('Error fetching departments:', err));
  }, []);

  // Fetch attendance records + Tungsten punch context (Employee Report pairing)
  const fetchAttendance = async () => {
    setLoading(true);
    let url = "/api/attendance";
    const params = new URLSearchParams();

    const attFromDate = fromDate ? addDaysToDateKey(fromDate, -1) : "";
    const attToDate = toDate ? addDaysToDateKey(toDate, 1) : "";
    if (attFromDate) params.append("fromDate", attFromDate);
    if (attToDate) params.append("toDate", attToDate);
    if (selectedDepartment) params.append("departmentName", selectedDepartment);
    if (searchName) params.append("employeeName", searchName);

    if (params.toString()) {
      url += "?" + params.toString();
    }

    try {
      const res = await fetch(url, { cache: "no-store" });
      const data = await res.json();
      if (!data.success) return;

      const empShiftMap: Record<string, { start: string; end: string; seconds: number }> = {};
      (data.attendance || []).forEach((record: any) => {
        const assignedShiftSeconds = getAssignedShiftSeconds(
          record.shift_start_time,
          record.shift_end_time,
        );
        if (
          record.employee_id &&
          record.shift_start_time &&
          record.shift_end_time &&
          assignedShiftSeconds &&
          assignedShiftSeconds > 0
        ) {
          empShiftMap[record.employee_id] = {
            start: record.shift_start_time,
            end: record.shift_end_time,
            seconds: assignedShiftSeconds,
          };
        }
      });

      let records = (data.attendance || []).map((record: any) => {
        const totalSeconds =
          record.total_seconds && record.total_seconds > 0
            ? record.total_seconds
            : calculateTotalSeconds(record.clock_in, record.clock_out);
        let assignedShiftSeconds = getAssignedShiftSeconds(
          record.shift_start_time,
          record.shift_end_time,
        );
        if (
          (!assignedShiftSeconds || assignedShiftSeconds <= 0) &&
          empShiftMap[record.employee_id]
        ) {
          assignedShiftSeconds = empShiftMap[record.employee_id].seconds;
        }
        const overtimeSeconds = calculateOvertime(totalSeconds, assignedShiftSeconds);
        return {
          ...record,
          total_hours: formatDuration(totalSeconds),
          assigned_shift_seconds: assignedShiftSeconds,
          overtime: overtimeSeconds,
          is_late: record.is_late,
          late_minutes: record.late_minutes || 0,
        };
      });
      if (selectedDepartment) {
        records = records.filter(
          (r: any) =>
            (r.department_name || "").toLowerCase() === selectedDepartment.toLowerCase(),
        );
      }
      if (searchName) {
        records = records.filter((r: any) =>
          (r.employee_name || "").toLowerCase().includes(searchName.toLowerCase()),
        );
      }
      setAttendance(records);

      if (fromDate && toDate) {
        try {
          const noteRes = await fetch(
            `/api/tardy-notes?fromDate=${encodeURIComponent(fromDate)}&toDate=${encodeURIComponent(toDate)}`,
            { cache: "no-store" }
          );
          const noteData = await noteRes.json();
          if (noteData.success && Array.isArray(noteData.notes)) {
            const map: Record<string, Record<string, string>> = {};
            const byAttendanceId: Record<string, string> = {};
            noteData.notes.forEach(
              (n: {
                employee_id: string;
                attendance_date: string;
                attendance_id?: number | null;
                note_label: string;
              }) => {
                const eid = String(n.employee_id);
                const dk = String(n.attendance_date).slice(0, 10);
                if (n.attendance_id) {
                  byAttendanceId[String(n.attendance_id)] = n.note_label;
                  return;
                }
                if (!map[eid]) map[eid] = {};
                map[eid][dk] = n.note_label;
              }
            );
            setTardyNotes(map);
            setTardyNotesByAttendanceId(byAttendanceId);
          } else {
            setTardyNotes({});
            setTardyNotesByAttendanceId({});
          }
        } catch {
          setTardyNotes({});
          setTardyNotesByAttendanceId({});
        }
      }

      const uniqueEmployees = [...new Set(records.map((r: any) => String(r.employee_id)))] as string[];
      if (uniqueEmployees.length > 0) {
        fetchApprovedLeaves(uniqueEmployees, fromDate, toDate);
      }

      const ctx = await loadTungstenPunchContext(
        fromDate,
        toDate,
        selectedDepartment || undefined,
      );
      setTungstenCtx(ctx);
    } catch (err) {
      console.error("Error fetching attendance:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleImportClick = () => importInputRef.current?.click();

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buffer = await file.arrayBuffer();
      const snapshot = parseMonthlyAttendanceWorkbook(buffer);
      if (!snapshot.employees.length) {
        alert("No employee sheets found. Use monthly attendance export format (one tab per employee).");
        return;
      }
      if (!snapshot.month) {
        alert("Could not detect month from file dates.");
        return;
      }
      saveImportedMonthlySnapshot(snapshot);
      setImportedSnapshot(snapshot);
      setSelectedMonth(snapshot.month);
      alert(`Loaded ${snapshot.employees.length} employees for ${snapshot.month}. Select that month to view.`);
    } catch (err) {
      alert(String(err));
    } finally {
      e.target.value = "";
    }
  };

  // Fetch approved leaves for given employees and date range
  const fetchApprovedLeaves = async (employeeIds: string[], from: string, to: string) => {
    try {
      const params = new URLSearchParams();
      params.append("employees", employeeIds.join(","));
      params.append("fromDate", from);
      params.append("toDate", to);

      const response = await fetch(`/api/leaves?${params.toString()}`, { cache: "no-store" });
      const data = await response.json();

      if (data.success && data.leaves) {
        // console.log('leaves from backend:', data.leaves);
        // Build map of employee_id -> date -> true (for approved leaves)
        const leavesMap: Record<string, Record<string, boolean>> = {};

        data.leaves.forEach((leave: any) => {
          if (leave.status === "approved") {
            const empId = String(leave.employee_id);
            if (!leavesMap[empId]) {
              leavesMap[empId] = {};
            }

            // Parse dates and mark all dates within the range
            const startDateKey = normalizeToDateKey(String(leave.start_date || ""));
            const endDateKey = normalizeToDateKey(String(leave.end_date || ""));
            if (!startDateKey || !endDateKey) return;

            let currentDateKey = startDateKey;
            while (currentDateKey <= endDateKey) {
              leavesMap[empId][currentDateKey] = true;
              currentDateKey = addDaysToDateKey(currentDateKey, 1);
            }
          }
        });

        // console.log('approvedLeavesMap:', leavesMap);
        setApprovedLeavesMap(leavesMap);
      }
    } catch (err) {
      console.error("Error fetching approved leaves:", err);
    }
  };


  useEffect(() => {
    const loaded = loadImportedMonthlySnapshot(selectedMonth);
    if (!loaded) {
      setImportedSnapshot(null);
      return;
    }
    setImportedSnapshot(loaded);
  }, [selectedMonth]);

  // Sync filters with page: fetch data whenever any filter changes (skip when showing imported Excel)
  useEffect(() => {
    if (showingImported) {
      setTungstenCtx(null);
      setLoading(false);
      return;
    }
    fetchAttendance();
  }, [fromDate, toDate, selectedDepartment, searchName, showingImported]);

  useEffect(() => {
    if (!selectedMonth) return;
    const [yearStr, monthStr] = selectedMonth.split("-");
    const year = Number(yearStr);
    const month = Number(monthStr);
    if (!year || !month) return;
    const lastDay = new Date(year, month, 0).getDate();
    const firstDate = `${yearStr}-${monthStr}-01`;
    const lastDate = `${yearStr}-${monthStr}-${String(lastDay).padStart(2, "0")}`;
    setFromDate(firstDate);
    setToDate(lastDate);
  }, [selectedMonth]);

  useEffect(() => {
    if (!selectedMonth) return;
    fetch(`/api/calendar?month=${selectedMonth}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (!data?.success) return;
        const map: Record<string, CalendarDayOverride> = {};
        (data.days || []).forEach((d: CalendarDayOverride) => {
          map[d.date] = d;
        });
        setCalendarOverrides(map);
      })
      .catch((err) => console.error("calendar fetch", err));
  }, [selectedMonth]);

  function calculateTotalSeconds(clockIn: string | null, clockOut: string | null): number {
    if (!clockIn || !clockOut) return 0;

    const inParts = getParts(clockIn, SERVER_TIMEZONE);
    const outParts = getParts(clockOut, SERVER_TIMEZONE);
    if (!inParts || !outParts) return 0;

    const inTimeMs = Date.UTC(
      inParts.year,
      inParts.month - 1,
      inParts.day,
      inParts.hour,
      inParts.minute,
      inParts.second
    );
    const outTimeMs = Date.UTC(
      outParts.year,
      outParts.month - 1,
      outParts.day,
      outParts.hour,
      outParts.minute,
      outParts.second
    );

    const diffMilliseconds = outTimeMs - inTimeMs;
    if (diffMilliseconds < 0) return 0;
    
    return Math.floor(diffMilliseconds / 1000);
  }

  function formatDuration(seconds: number) {
    const h = Math.floor(seconds / 3600).toString().padStart(2, "0");
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${h}h ${m}m ${s}s`;
  }

  function formatTime(timeString: string | null) {
    if (!timeString) return "-";
    return getTimeStringInTimeZone(timeString, SERVER_TIMEZONE);
  }

  function findRecordForSession(dayRecords: any[], session: EmployeeReportSession) {
    if (!dayRecords.length) return undefined;
    const matched = dayRecords.find((r) => {
      if (!r.clock_in || session.hrmClockIn === "-") return false;
      return getTimeStringInTimeZone(r.clock_in, SERVER_TIMEZONE) === session.hrmClockIn;
    });
    return matched ?? dayRecords[0];
  }

  function formatDate(dateString: string) {
    const dateKey = normalizeToDateKey(dateString);
    if (!dateKey) return "-";
    const [year, month, day] = dateKey.split("-");
    if (!year || !month || !day) return dateString;
    return `${month}/${day}/${year}`;
  }

  function formatDateKey(dateKey: string) {
    if (!dateKey) return "-";
    const [year, month, day] = dateKey.split("-");
    if (!year || !month || !day) return dateKey;
    return `${month}/${day}/${year}`;
  }

  function formatLateTime(minutes: number | null) {
    if (!minutes || minutes === 0) return "-";
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `Late ${h}h ${m}m`;
  }

  function getDateKey(dateValue: string) {
    return normalizeToDateKey(dateValue);
  }

  function getRecordDateKey(record: any) {
    return getDateKey(record.clock_in || record.clock_out || record.date || "");
  }

  function calculateTotalDeduction(employee: any) {
    if (employee.isImported) {
      if (employee.importedDays?.length && importedEmployeeUsesFiveHourShift(employee.importedDays)) {
        let total = 0;
        (employee.importedDays as ImportedMonthlyDay[]).forEach((day) => {
          const { deduction } = getImportedDayDisplayFields(day, { fiveHourShift: true });
          if (deduction) total += parseInt(String(deduction).replace(/%/g, ""), 10) || 0;
        });
        return total;
      }
      const fromFooter = employee.importedFooter?.totalDeduction;
      if (fromFooter != null && String(fromFooter).trim() !== "") {
        return parseInt(String(fromFooter).replace(/%/g, ""), 10) || 0;
      }
      let total = 0;
      (employee.importedDays || []).forEach((day: ImportedMonthlyDay) => {
        const ded = day.sheetDeduction ?? day.deduction ?? employee.dateMeta?.[day.dateKey]?.deduction;
        if (ded) total += parseInt(String(ded).replace(/%/g, ""), 10) || 0;
      });
      return total;
    }

    let totalDeduction = 0;
    monthInfo.days.forEach((day) => {
      const dayRecords = employee.byDate[day.dateKey] || [];
      const meta = employee.dateMeta[day.dateKey];
      const workingDay = isWorkingDay(day.dateKey);
      
      let dayDeduction = 0;
      if (dayRecords.length === 0) {
        // No records for this day
        if (workingDay) {
          // Check for approved leave
          if (
            approvedLeavesMap[employee.employeeId] &&
            approvedLeavesMap[employee.employeeId][day.dateKey]
          ) {
            dayDeduction = 0; // Approved leave, no deduction
          } else {
            dayDeduction = 100; // Absent on working day
          }
        }
      } else {
        // Has records, use meta deduction
        if (meta?.deduction) {
          dayDeduction = parseInt(meta.deduction) || 0;
        }
      }
      totalDeduction += dayDeduction;
    });
    return totalDeduction;
  }

  function tardyNoteForCell(
    employeeId: string,
    dateKey: string,
    statusLabel: string,
    attendanceId?: number | null
  ): string {
    if (attendanceId) {
      const bySession = tardyNotesByAttendanceId[String(attendanceId)];
      if (bySession) return bySession;
    }
    const saved = tardyNotes[employeeId]?.[dateKey];
    if (saved) return saved;
    if (normalizeAttendanceStatus(statusLabel) === "Tardy") return "-";
    return "";
  }

  function isWorkingDay(dateKey: string) {
    if (!dateKey) return false;
    const override = calendarOverrides[dateKey];
    if (override) return override.status === "working";
    const [yearStr, monthStr, dayStr] = dateKey.split("-");
    const year = Number(yearStr);
    const monthIndex = Number(monthStr) - 1;
    const day = Number(dayStr);
    if (!year || monthIndex < 0 || !day) return false;
    const date = new Date(Date.UTC(year, monthIndex, day));
    const weekday = date.getUTCDay();
    return weekday !== 0 && weekday !== 6;
  }

  function buildEmployeeExcelRows(employee: any): MonthlyAttendanceExcelRow[] {
    const dataRows: MonthlyAttendanceExcelRow[] = [];
    if (!monthInfo.days) return dataRows;

    if (employee.isImported && employee.importedDays?.length) {
      const days = [...employee.importedDays].sort((a: ImportedMonthlyDay, b: ImportedMonthlyDay) =>
        a.dateKey.localeCompare(b.dateKey),
      );
      const fiveHourShift = importedEmployeeUsesFiveHourShift(days);
      days.forEach((day: ImportedMonthlyDay) => {
        const meta = employee.dateMeta?.[day.dateKey];
        const statusLabel = meta?.statusLabel ?? getImportedDayDisplayFields(day, { fiveHourShift }).status;
        const deduction = meta?.deduction ?? getImportedDayDisplayFields(day, { fiveHourShift }).deduction;
        const tardyDisplay = formatImportedRunningLate(meta?.runningLate);
        dataRows.push({
          cells: [
            day.weekday,
            day.dateDisplay,
            day.tPunchIn && day.tPunchIn !== "---" ? day.tPunchIn : "---",
            day.clockIn,
            day.clockOut,
            day.tPunchOut && day.tPunchOut !== "---" ? day.tPunchOut : "---",
            day.totalWH,
            day.assignedWH,
            day.overtime,
            tardyDisplay,
            statusLabel,
            tardyNoteForCell(employee.employeeId, day.dateKey, statusLabel),
            deduction,
          ],
          status: statusLabel,
        });
      });
      const footer = employee.importedFooter;
      const totalDeduction =
        footer?.totalDeduction != null && String(footer.totalDeduction).trim() !== ""
          ? String(footer.totalDeduction).replace(/%$/, "")
          : String(calculateTotalDeduction(employee));
      dataRows.push(
        {
          cells: ["", "", "", "", "", "", "", "", "", "", "Total Deduction:", "", `${totalDeduction}%`],
          status: "",
          isSummary: true,
        },
        {
          cells: ["", "", "", "", "", "", "", "", "", "", "Extra Hours:", "", getEmployeeTotalOvertime(employee)],
          status: "",
          isSummary: true,
        },
        {
          cells: [
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "Total Working Days:",
            "",
            footer?.workingDays ?? `${getTotalWorkingDays(employee, monthInfo, approvedLeavesMap)}`,
          ],
          status: "",
          isSummary: true,
        },
      );
      return dataRows;
    }

    const employeeSessions = sessionsByEmployeeId.get(employee.employeeId) || [];

    monthInfo.days.forEach((day) => {
      const dayRecords = employee.byDate[day.dateKey] || [];
      const meta = employee.dateMeta[day.dateKey];
      const workingDay = isWorkingDay(day.dateKey);
      const daySessions = employeeSessions.filter((s) => s.sessionDate === day.dateKey);

      if (daySessions.length === 0 && dayRecords.length === 0) {
        let statusLabel = workingDay ? "Absent" : "Off";
        let deduction = workingDay ? "100%" : "";
        if (
          workingDay &&
          approvedLeavesMap[employee.employeeId] &&
          approvedLeavesMap[employee.employeeId][day.dateKey]
        ) {
          statusLabel = "Leave";
          deduction = "0%";
        }
        dataRows.push({
          cells: [
            day.weekday,
            formatDateKey(day.dateKey),
            "---",
            "---",
            "---",
            "---",
            "---",
            "---",
            "---",
            meta?.runningLate ?? "",
            statusLabel,
            tardyNoteForCell(employee.employeeId, day.dateKey, statusLabel),
            deduction,
          ],
          status: statusLabel,
        });
        return;
      }

      const sessionsToExport =
        daySessions.length > 0
          ? daySessions
          : [
              {
                sessionDate: day.dateKey,
                tungstenPunchIn: "-",
                hrmClockIn: "-",
                hrmClockOut: "-",
                tungstenPunchOut: "-",
              },
            ];

      sessionsToExport.forEach((session) => {
        const record = findRecordForSession(dayRecords, session);
        const statusLabel = normalizeAttendanceStatus(meta?.statusLabel || "");
        dataRows.push({
          cells: [
            day.weekday,
            formatDateKey(day.dateKey),
            monthlyDash(session.tungstenPunchIn),
            session.hrmClockIn === "-" ? "---" : session.hrmClockIn,
            session.hrmClockOut === "-" ? "---" : session.hrmClockOut,
            monthlyDash(session.tungstenPunchOut),
            record ? excelTotalHoursForExport(record) : "---",
            record ? excelAssignedWHForExport(record) : "---",
            record ? excelOvertimeForExport(record) : "---",
            meta?.runningLate ?? "",
            statusLabel,
            tardyNoteForCell(employee.employeeId, day.dateKey, statusLabel),
            meta?.deduction || "",
          ],
          status: statusLabel,
        });
      });
    });

    const totalDeduction = calculateTotalDeduction(employee);
    dataRows.push(
      {
        cells: ["", "", "", "", "", "", "", "", "", "", "Total Deduction:", "", `${totalDeduction}%`],
        status: "",
        isSummary: true,
      },
      {
        cells: ["", "", "", "", "", "", "", "", "", "", "Extra Hours:", "", getEmployeeTotalOvertime(employee)],
        status: "",
        isSummary: true,
      },
      {
        cells: [
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "Total Working Days:",
          "",
          `${getTotalWorkingDays(employee, monthInfo, approvedLeavesMap)}`,
        ],
        status: "",
        isSummary: true,
      },
    );

    return dataRows;
  }

  async function downloadExcel() {
    if (attendanceByEmployee.length === 0) {
      alert("No employees to export");
      return;
    }

    const sheets = attendanceByEmployee.map((employee) => ({
      name: employee.employeeName,
      rows: buildEmployeeExcelRows(employee),
    }));

    const dateRange = fromDate && toDate ? `-${fromDate}-to-${toDate}` : "";
    const departmentSuffix = selectedDepartment ? `-${selectedDepartment}` : "";
    const fileName = `monthly-attendance${departmentSuffix}${dateRange}.xlsx`;
    await downloadMonthlyAttendanceExcel(sheets, fileName);
  }

  async function downloadEmployeeExcel(employee: any) {
    const sheets = [
      {
        name: employee.employeeName,
        rows: buildEmployeeExcelRows(employee),
      },
    ];
    const fileName = `attendance-${employee.employeeName.replace(/\s+/g, "_")}-${selectedMonth}.xlsx`;
    await downloadMonthlyAttendanceExcel(sheets, fileName);
  }

  function shouldIncludeInDeductionSummary(statusLabel: string): boolean {
    const status = String(statusLabel || "").trim();
    return status !== "On Time" && status !== "Off" && status !== "";
  }

  function formatDeductionSummaryStatus(statusLabel: string): string {
    if (statusLabel === "Leave") return "PTO By Company";
    return statusLabel;
  }

  function formatDeductionSummaryTime(timeString: string | null): string {
    const formatted = formatTime(timeString);
    return formatted === "-" || !formatted ? "--" : formatted;
  }

  function deductionSummaryClock(
    record: any,
    employee: any,
    dateKey: string,
    kind: "in" | "out",
  ): string {
    const imported = record?._importedDay;
    if (imported) {
      const v = kind === "in" ? imported.clockIn : imported.clockOut;
      if (v && v !== "---" && v !== "-" && v !== "--") return v;
      return "--";
    }
    if (employee?.isImported && Array.isArray(employee.importedDays)) {
      const day = employee.importedDays.find((d: { dateKey: string }) => d.dateKey === dateKey);
      if (day) {
        const v = kind === "in" ? day.clockIn : day.clockOut;
        if (v && v !== "---" && v !== "-" && v !== "--") return v;
      }
      return "--";
    }
    return formatDeductionSummaryTime(kind === "in" ? record?.clock_in : record?.clock_out);
  }

  function deductionSummaryTungsten(value: string) {
    if (!value || value === "-" || value === "---") return "--";
    return value;
  }

  function buildDeductionSummaryBlock(employee: any): DeductionSummaryEmployeeBlock {
    const rows: DeductionSummaryDayRow[] = [];
    if (!monthInfo.days) {
      return { employeeName: employee.employeeName, rows, totalDeduction: 0 };
    }

    const employeeSessions = employee.isImported
      ? []
      : sessionsByEmployeeId.get(employee.employeeId) || [];

    monthInfo.days.forEach((day) => {
      const workingDay = isWorkingDay(day.dateKey);
      if (!workingDay) return;

      const dayRecords = employee.byDate[day.dateKey] || [];
      const meta = employee.dateMeta[day.dateKey];
      const daySessions = employeeSessions.filter((s) => s.sessionDate === day.dateKey);
      const session = daySessions[0];

      if (dayRecords.length === 0 && daySessions.length === 0) {
        let statusLabel = "Absent";
        let deduction = "100%";
        if (
          approvedLeavesMap[employee.employeeId] &&
          approvedLeavesMap[employee.employeeId][day.dateKey]
        ) {
          statusLabel = "Leave";
          deduction = "0%";
        }
        if (!shouldIncludeInDeductionSummary(statusLabel)) return;
        rows.push({
          date: formatDateKey(day.dateKey),
          tPunchIn: "--",
          clockIn: "--",
          clockOut: "--",
          tPunchOut: "--",
          status: formatDeductionSummaryStatus(statusLabel),
          tardyCount: meta?.runningLate ?? "",
          deduction,
        });
        return;
      }

      const statusLabel = meta?.statusLabel || "On Time";
      if (!shouldIncludeInDeductionSummary(statusLabel)) return;

      const importedDay = employee.isImported
        ? (employee.importedDays as ImportedMonthlyDay[] | undefined)?.find(
            (d) => d.dateKey === day.dateKey,
          )
        : undefined;

      const record = dayRecords[0];
      rows.push({
        date: formatDateKey(day.dateKey),
        tPunchIn: importedDay
          ? deductionSummaryTungsten(importedDay.tPunchIn || "---")
          : session
            ? deductionSummaryTungsten(monthlyDash(session.tungstenPunchIn))
            : "--",
        clockIn:
          session && session.hrmClockIn !== "-"
            ? session.hrmClockIn
            : deductionSummaryClock(record, employee, day.dateKey, "in"),
        clockOut:
          session && session.hrmClockOut !== "-"
            ? session.hrmClockOut
            : deductionSummaryClock(record, employee, day.dateKey, "out"),
        tPunchOut: importedDay
          ? deductionSummaryTungsten(importedDay.tPunchOut || "---")
          : session
            ? deductionSummaryTungsten(monthlyDash(session.tungstenPunchOut))
            : "--",
        status: formatDeductionSummaryStatus(normalizeAttendanceStatus(statusLabel)),
        tardyCount: meta?.runningLate ?? "",
        deduction: meta?.deduction || "",
      });
    });

    const totalDeduction = rows.reduce(
      (sum, row) => sum + parseDeductionPercent(row.deduction),
      0,
    );

    return {
      employeeName: employee.employeeName,
      rows,
      totalDeduction,
    };
  }

  async function downloadDeductionSummary() {
    if (attendanceByEmployee.length === 0) {
      alert("No employees to export");
      return;
    }

    const blocks = attendanceByEmployee.map((employee) =>
      buildDeductionSummaryBlock(employee),
    );

    const dateRange = fromDate && toDate ? `-${fromDate}-to-${toDate}` : "";
    const departmentSuffix = selectedDepartment ? `-${selectedDepartment}` : "";
    const fileName = `deduction-summary${departmentSuffix}${dateRange}.xlsx`;
    await downloadDeductionSummaryExcel(blocks, fileName);
  }

  const monthInfo = React.useMemo(() => {
    if (!selectedMonth) return { label: "", days: [] as { day: number; dateKey: string; weekday: string }[] };
    const [yearStr, monthStr] = selectedMonth.split("-");
    const year = Number(yearStr);
    const monthIndex = Number(monthStr) - 1;
    if (!year || monthIndex < 0) return { label: "", days: [] };
    const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
    const label = new Intl.DateTimeFormat("en-US", {
      month: "long",
      year: "numeric",
      timeZone: SERVER_TIMEZONE,
    }).format(new Date(Date.UTC(year, monthIndex, 1, 12, 0, 0)));
    const days = Array.from({ length: daysInMonth }, (_, index) => {
      const day = index + 1;
      const dateKey = `${yearStr}-${monthStr}-${String(day).padStart(2, "0")}`;
      const weekday = new Intl.DateTimeFormat("en-US", {
        weekday: "short",
        timeZone: SERVER_TIMEZONE,
      }).format(new Date(Date.UTC(year, monthIndex, day, 12, 0, 0)));
      return { day, dateKey, weekday };
    });
    return { label, days };
  }, [selectedMonth]);

  const attendanceByEmployee = React.useMemo((): MonthlyAttendanceEmployeeRow[] => {
    if (showingImported && importedSnapshot) {
      let employees = importedSnapshotToAttendanceEmployees(importedSnapshot);
      if (selectedDepartment) {
        employees = employees.filter(
          (e) => (e.departmentName || "").toLowerCase() === selectedDepartment.toLowerCase(),
        );
      }
      if (searchName.trim()) {
        const term = searchName.trim().toLowerCase();
        employees = employees.filter((e) => (e.employeeName || "").toLowerCase().includes(term));
      }
      return employees;
    }

    const map: Record<string, MonthlyAttendanceEmployeeRow> = {};

    attendance.forEach((record: any) => {
      if (!record.employee_id) return;
      const empId = record.employee_id;
      if (!map[empId]) {
        map[empId] = {
          employeeId: empId,
          employeeName: record.employee_name || "-",
          pseudonym: record.pseudonym || "-",
          departmentName: record.department_name || "-",
          gender: record.gender || "",
          byDate: {},
          dateMeta: {},
        };
      }
      if (!map[empId].gender && record.gender) {
        map[empId].gender = record.gender;
      }
      const dateKey = getRecordDateKey(record);
      if (!dateKey) return;
      if (!map[empId].byDate[dateKey]) map[empId].byDate[dateKey] = [];
      map[empId].byDate[dateKey].push(record);
    });

    Object.values(map).forEach((employee) => {
      Object.keys(employee.byDate).forEach((dateKey) => {
        employee.byDate[dateKey].sort(compareAttendanceRows);
      });

      let runningLate = 0;
      const dateKeys = Object.keys(employee.byDate).sort();
      dateKeys.forEach((dateKey) => {
        const dayRecords = employee.byDate[dateKey];
        const { clockIn, clockOut, record } = aggregateDayPunches(dayRecords);
        const dayStatus = classifyDayAttendance({
          dateKey,
          clockIn,
          clockOut,
          shiftStart: record?.shift_start_time ?? null,
          shiftEnd: record?.shift_end_time ?? null,
          gender: employee.gender,
        });

        const statusLabel = normalizeAttendanceStatus(dayStatus.statusLabel);
        const statusColor = uiStatusTextColor(statusLabel);
        let deduction = "";
        let tardyDisplay: number | string = "";

        if (statusLabel === "Tardy" && dayStatus.isLate) {
          runningLate += 1;
          tardyDisplay = runningLate;
          if (runningLate === 4) deduction = "50%";
          else if (runningLate >= 5) deduction = "100%";
          else deduction = "0%";
        } else if (statusLabel === "Absent") {
          deduction = "100%";
        } else if (statusLabel === STATUS_FIRST_HALF_DAY || statusLabel === STATUS_SECOND_HALF_DAY) {
          deduction = "50%";
        }

        employee.dateMeta[dateKey] = {
          runningLate: tardyDisplay,
          statusLabel,
          statusColor,
          deduction,
        };
      });
    });

    return Object.values(map).sort((a, b) => a.employeeName.localeCompare(b.employeeName));
  }, [attendance, showingImported, importedSnapshot, selectedDepartment, searchName]);

  const sessionsByEmployeeId = React.useMemo(() => {
    const out = new Map<string, EmployeeReportSession[]>();
    if (showingImported) return out;
    const todayKey = getDateStringInTimeZone(new Date(), SERVER_TIMEZONE);
    const zkFrom = fromDate ? addDaysToDateKey(fromDate, -1) : "";
    const zkTo = toDate ? addDaysToDateKey(toDate, 1) : "";
    const recordsByEmployeeId = new Map<string, { clock_in?: string | null; clock_out?: string | null }[]>();
    attendance.forEach((record: any) => {
      const id = String(record.employee_id || "");
      if (!id) return;
      const list = recordsByEmployeeId.get(id) || [];
      list.push(record);
      recordsByEmployeeId.set(id, list);
    });
    attendanceByEmployee.forEach((emp) => {
      const allRecords = recordsByEmployeeId.get(emp.employeeId) || [];
      out.set(
        emp.employeeId,
        buildEmployeeReportSessions(
          emp.employeeName,
          allRecords,
          tungstenCtx,
          todayKey,
          pairingNow,
          zkFrom,
          zkTo,
        ),
      );
    });
    return out;
  }, [attendance, attendanceByEmployee, tungstenCtx, showingImported, fromDate, toDate, pairingNow]);

  // Calculate total overtime (extra hours) for the month for an employee
  function getEmployeeTotalOvertime(emp: any) {
    if (emp.isImported && emp.importedFooter?.extraHours) {
      const v = emp.importedFooter.extraHours.trim();
      return v && v !== "-" ? v : "-";
    }
    let totalSeconds = 0;
    Object.values(emp.byDate).forEach((records) => {
      (records as any[]).forEach((record) => {
        // Only add overtime if >= 45 min (2700 sec)
        if (record.overtime && typeof record.overtime === "number" && record.overtime >= 2700) {
          totalSeconds += record.overtime;
        }
      });
    });
    if (totalSeconds <= 0) return "-";
    const h = Math.floor(totalSeconds / 3600).toString().padStart(2, "0");
    const m = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, "0");
    return `${h}h ${m}m`;
  }

  return (
    <LayoutDashboard>
      <div className={styles.attendanceSummaryContainer}>
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#22223B", margin: 0 }}>
            Monthly Attendance {monthInfo.label && `- ${monthInfo.label}`}
          </h1>
          <p style={{ color: "#4A5568", fontSize: "0.9rem", marginTop: 4 }}>
            View and manage all employee attendance records
          </p>
          {showingImported && (
            <p style={{ color: "#6B46C1", fontSize: "0.85rem", marginTop: 8, fontWeight: 600 }}>
              Showing imported Excel data for {monthInfo.label} (sheet values as-is)
            </p>
          )}
        </div>

        <div className={styles.attendanceSummaryFilters}>
          <input
            type="text"
            placeholder="Search by name..."
            value={searchName}
            onChange={(e) => setSearchName(e.target.value)}
            className={styles.attendanceSummaryInput}
          />
          <select
            value={selectedDepartment}
            onChange={(e) => setSelectedDepartment(e.target.value)}
            className={styles.attendanceSummaryInput}
          >
            <option value="">All Departments</option>
            {departments.map((dept) => (
              <option key={dept.id} value={dept.name || dept.department_name}>
                {dept.name || dept.department_name}
              </option>
            ))}
          </select>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ color: '#4A5568', fontWeight: 500, whiteSpace: 'nowrap' }}>Month:</label>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className={styles.attendanceSummaryDate}
              style={{ minWidth: '160px' }}
            />
          </div>
          <button
            onClick={fetchAttendance}
            className={styles.attendanceSummaryXLSButton}
            style={{ background: "linear-gradient(135deg, #0052CC 0%, #00B8A9 100%)" }}
          >
            Search
          </button>
          <button onClick={downloadExcel} className={styles.attendanceSummaryXLSButton}>
            <FaFileExcel /> Export Excel
          </button>
          <button
            onClick={handleImportClick}
            className={styles.attendanceSummaryXLSButton}
            style={{ background: "linear-gradient(135deg, #6B46C1 0%, #805AD5 100%)" }}
          >
            <FaFileExcel /> Import Excel
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleImportFile}
            style={{ display: "none" }}
          />
          <button
            onClick={downloadDeductionSummary}
            className={styles.attendanceSummaryXLSButton}
            style={{ background: "linear-gradient(135deg, #C53030 0%, #9B2C2C 100%)" }}
          >
            <FaFileExcel /> Deduction Summary
          </button>
        </div>

        {loading ? (
          <div style={{ padding: 20, color: "#4A5568", textAlign: "center" }}>
            Loading attendance records...
          </div>
        ) : (
          <div className={styles.attendanceCardsGrid}>
            {attendanceByEmployee.length === 0 ? (
              <div className={styles.attendanceSummaryNoRecords}>No attendance records found</div>
            ) : (
              attendanceByEmployee.map((employee) => (
                <div key={employee.employeeId} className={styles.attendanceEmployeeCard}>
                  <div className={styles.attendanceEmployeeHeader}>
                    <div>
                      <div className={styles.attendanceEmployeeName}>{employee.employeeName}</div>
                      <div className={styles.attendanceEmployeeMeta}>
                        {employee.pseudonym} · {employee.departmentName}
                      </div>
                    </div>
                    <div className={styles.attendanceEmployeeActions}>
                      <div className={styles.attendanceEmployeeIdProminent}>Emp. ID {employee.employeeId}</div>
                      <button
                        title="Export this employee's month record as XLS"
                        style={{ background: '#27ae60', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                        onClick={() => downloadEmployeeExcel(employee)}
                      >
                        <FaFileExcel /> Export XLS
                      </button>
                    </div>
                  </div>
                  {/* <div className={styles.attendanceMonthTitle}>{monthInfo.label}</div> */}
                  <div className={styles.attendanceEmployeeTableWrapper}>
                    <table className={`${styles.attendanceEmployeeTable} ${styles.hideAssignedWH}`}>
                      <thead>
                        <tr>
                          <th>Day</th>
                          <th>Date</th>
                          <th>T.Punch in</th>
                          <th>Clock In</th>
                          <th>Clock Out</th>
                          <th>T.Punch out</th>
                          <th>Total W.H</th>
                          <th className={styles.colAssignedWH}>Assigned W.H</th>
                          <th>OverTime</th>
                          <th>Tardy Count</th>
                          <th>Status</th>
                          <th className={styles.colTardyNote}>Tardy Note</th>
                          <th>Deduction</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(employee.isImported && employee.importedDays
                          ? employee.importedDays.map((day: any) => ({
                              dateKey: day.dateKey,
                              weekday: day.weekday,
                              dateDisplay: day.dateDisplay,
                              imported: day,
                              meta: employee.dateMeta[day.dateKey],
                            }))
                          : monthInfo.days.map((day) => ({
                              dateKey: day.dateKey,
                              weekday: day.weekday,
                              dateDisplay: formatDateKey(day.dateKey),
                              imported: null,
                              meta: employee.dateMeta[day.dateKey],
                              day,
                            }))
                        ).flatMap((rowCtx: any) => {
                          if (rowCtx.imported) {
                            const day = rowCtx.imported as ImportedMonthlyDay;
                            const fiveHourShift = importedEmployeeUsesFiveHourShift(
                              employee.importedDays || [],
                            );
                            const meta = employee.dateMeta?.[day.dateKey];
                            const rowStatus =
                              meta?.statusLabel ??
                              getImportedDayDisplayFields(day, { fiveHourShift }).status;
                            const rowDeduction =
                              meta?.deduction ??
                              getImportedDayDisplayFields(day, { fiveHourShift }).deduction;
                            const tardyDisplay = formatImportedRunningLate(meta?.runningLate);
                            return (
                              <tr key={`${employee.employeeId}-${day.dateKey}-import`}>
                                <td>{day.weekday || rowCtx.weekday}</td>
                                <td>{day.dateDisplay}</td>
                                <td>
                                  {day.tPunchIn && day.tPunchIn !== "---" ? day.tPunchIn : "---"}
                                </td>
                                <td>{day.clockIn}</td>
                                <td>{day.clockOut}</td>
                                <td>
                                  {day.tPunchOut && day.tPunchOut !== "---" ? day.tPunchOut : "---"}
                                </td>
                                <td>{day.totalWH}</td>
                                <td className={styles.colAssignedWH}>{day.assignedWH}</td>
                                <td>{day.overtime}</td>
                                <td>{tardyDisplay}</td>
                                <td style={{ color: uiStatusTextColor(rowStatus), fontWeight: 600 }}>
                                  {rowStatus}
                                </td>
                                <td className={styles.colTardyNote}>{tardyNoteForCell(employee.employeeId, day.dateKey, rowStatus)}</td>
                                <td>{rowDeduction}</td>
                              </tr>
                            );
                          }

                          const day = rowCtx.day;
                          const dayRecords = employee.byDate[day.dateKey] || [];
                          const meta = rowCtx.meta;
                          const workingDay = isWorkingDay(day.dateKey);
                          const employeeSessions = sessionsByEmployeeId.get(employee.employeeId) || [];
                          const daySessions = employeeSessions.filter(
                            (s) => s.sessionDate === day.dateKey,
                          );

                          if (daySessions.length === 0 && dayRecords.length === 0) {
                            let statusLabel = workingDay ? "Absent" : "Off";
                            let deduction = workingDay ? "100%" : "";
                            if (
                              workingDay &&
                              approvedLeavesMap[employee.employeeId] &&
                              approvedLeavesMap[employee.employeeId][day.dateKey]
                            ) {
                              statusLabel = "Leave";
                              deduction = "0%";
                            }
                            return (
                              <tr key={`${employee.employeeId}-${day.dateKey}-empty`}>
                                <td>{day.weekday}</td>
                                <td>{formatDateKey(day.dateKey)}</td>
                                <td>---</td>
                                <td>---</td>
                                <td>---</td>
                                <td>---</td>
                                <td>---</td>
                                <td className={styles.colAssignedWH}>---</td>
                                <td>---</td>
                                <td>{meta?.runningLate ? meta.runningLate : ""}</td>
                                <td style={{ color: uiStatusTextColor(statusLabel), fontWeight: 600 }}>
                                  {normalizeAttendanceStatus(statusLabel)}
                                </td>
                                <td className={styles.colTardyNote}>{tardyNoteForCell(employee.employeeId, day.dateKey, statusLabel)}</td>
                                <td>{deduction}</td>
                              </tr>
                            );
                          }

                          const recordStatus = normalizeAttendanceStatus(meta?.statusLabel || "-");
                          const sessionsToShow =
                            daySessions.length > 0
                              ? daySessions
                              : [
                                  {
                                    sessionDate: day.dateKey,
                                    tungstenPunchIn: "-",
                                    hrmClockIn: "-",
                                    hrmClockOut: "-",
                                    tungstenPunchOut: "-",
                                  },
                                ];

                          return sessionsToShow.map((session, index) => {
                            const record = findRecordForSession(dayRecords, session);
                            return (
                              <tr
                                key={`${employee.employeeId}-${day.dateKey}-session-${index}`}
                              >
                                <td>{day.weekday}</td>
                                <td>{formatDateKey(day.dateKey)}</td>
                                <td>{monthlyDash(session.tungstenPunchIn)}</td>
                                <td>
                                  {session.hrmClockIn === "-" ? "---" : session.hrmClockIn}
                                </td>
                                <td>
                                  {session.hrmClockOut === "-" ? (
                                    "---"
                                  ) : (
                                    <>
                                      {session.hrmClockOut}
                                      {isAutoClockOutRecord(record?.auto_clock_out) ? (
                                        <AutoClockOutBadge />
                                      ) : null}
                                    </>
                                  )}
                                </td>
                                <td>{monthlyDash(session.tungstenPunchOut)}</td>
                                <td>
                                  {record ? formatHoursMins(record.total_hours) : "---"}
                                </td>
                                <td className={styles.colAssignedWH}>
                                  {record
                                    ? formatDurationHM(record.assigned_shift_seconds)
                                    : "---"}
                                </td>
                                <td>
                                  {record ? formatDurationHM(record.overtime) : "---"}
                                </td>
                                <td>{meta?.runningLate ? meta.runningLate : ""}</td>
                                <td
                                  style={{
                                    color: uiStatusTextColor(recordStatus),
                                    fontWeight: 600,
                                  }}
                                >
                                  {recordStatus}
                                </td>
                                <td className={styles.colTardyNote}>
                                  {tardyNoteForCell(
                                    employee.employeeId,
                                    day.dateKey,
                                    recordStatus,
                                    record?.id
                                  )}
                                </td>
                                <td>{meta?.deduction || ""}</td>
                              </tr>
                            );
                          });
                        })}
                      </tbody>
                      <tfoot>
                        <tr style={{ fontWeight: 700, backgroundColor: "#F7FAFC", borderTop: "2px solid #E2E8F0" }}>
                          <td colSpan={12} style={{ textAlign: "right", paddingRight: 16 }}>
                            Total Deduction:
                          </td>
                          <td>
                            {employee.isImported && employee.importedFooter?.totalDeduction != null
                              ? `${String(employee.importedFooter.totalDeduction).replace(/%$/, "")}%`
                              : `${calculateTotalDeduction(employee)}%`}
                          </td>
                        </tr>
                        <tr style={{ fontWeight: 700, backgroundColor: "#F7FAFC" }}>
                          <td colSpan={12} style={{ textAlign: "right", paddingRight: 16 }}>
                            Extra Hours:
                          </td>
                          <td>
                            {employee.isImported && employee.importedFooter?.extraHours
                              ? employee.importedFooter.extraHours
                              : getEmployeeTotalOvertime(employee)}
                          </td>
                        </tr>
                        <tr style={{ fontWeight: 700, backgroundColor: "#F7FAFC" }}>
                          <td colSpan={12} style={{ textAlign: "right", paddingRight: 16 }}>
                            Total Working Days:
                          </td>
                          <td>
                            {employee.isImported && employee.importedFooter?.workingDays
                              ? employee.importedFooter.workingDays
                              : getTotalWorkingDays(employee, monthInfo, approvedLeavesMap)}
                          </td>
                        </tr>
                      </tfoot>

                    </table>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </LayoutDashboard>
  );
}
