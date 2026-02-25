"use client";

import React, { useEffect, useState } from "react";
import LayoutDashboard from "../../layout-dashboard";
import styles from "../../attendance-summary/attendance-summary.module.css";
import { FaFileExcel } from "react-icons/fa";
import * as XLSX from 'xlsx';

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
    return overtime > 0 ? overtime : 0;
  }

  function formatDurationHM(seconds: number | null) {
    if (!seconds || seconds <= 0) return "-";
    const h = Math.floor(seconds / 3600).toString().padStart(2, "0");
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, "0");
    return `${h}h ${m}m`;
  }

  const [attendance, setAttendance] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [searchName, setSearchName] = useState("");
  const [selectedDepartment, setSelectedDepartment] = useState("");
  
  // Set default dates - start of current month to today
  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
  const todayStr = today.toISOString().split('T')[0];
  
  const [fromDate, setFromDate] = useState(firstDayOfMonth);
  const [toDate, setToDate] = useState(todayStr);
  const [loading, setLoading] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`
  );
  const [calendarOverrides, setCalendarOverrides] = useState<Record<string, CalendarDayOverride>>({});
  const [approvedLeavesMap, setApprovedLeavesMap] = useState<Record<string, Record<string, boolean>>>({});

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

  // Fetch attendance records
  const fetchAttendance = () => {
    setLoading(true);
    let url = "/api/attendance";
    const params = new URLSearchParams();
    
    if (fromDate) params.append("fromDate", fromDate);
    if (toDate) params.append("toDate", toDate);
    // Department filter: match by department name (not id)
    if (selectedDepartment) params.append("departmentName", selectedDepartment);
    // Name filter: match by employee name (case-insensitive)
    if (searchName) params.append("employeeName", searchName);
    
    if (params.toString()) {
      url += "?" + params.toString();
    }

    fetch(url, { cache: "no-store" })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          // First, build a map of employee_id -> most recent valid shift timings
          const empShiftMap: Record<string, {start: string, end: string, seconds: number}> = {};
          (data.attendance || []).forEach((record: any) => {
            const assignedShiftSeconds = getAssignedShiftSeconds(record.shift_start_time, record.shift_end_time);
            if (
              record.employee_id &&
              record.shift_start_time && record.shift_end_time &&
              assignedShiftSeconds && assignedShiftSeconds > 0
            ) {
              empShiftMap[record.employee_id] = {
                start: record.shift_start_time,
                end: record.shift_end_time,
                seconds: assignedShiftSeconds
              };
            }
          });

          let records = (data.attendance || []).map((record: any) => {
            // Calculate total seconds from clock_in and clock_out
            const totalSeconds = record.total_seconds && record.total_seconds > 0 
              ? record.total_seconds 
              : calculateTotalSeconds(record.clock_in, record.clock_out);
            // Use record's shift timings, or fallback to most recent for this employee
            let assignedShiftSeconds = getAssignedShiftSeconds(record.shift_start_time, record.shift_end_time);
            if ((!assignedShiftSeconds || assignedShiftSeconds <= 0) && empShiftMap[record.employee_id]) {
              assignedShiftSeconds = empShiftMap[record.employee_id].seconds;
            }
            // Calculate overtime using assigned shift seconds
            const overtimeSeconds = calculateOvertime(totalSeconds, assignedShiftSeconds);
            return {
              ...record,
              total_hours: formatDuration(totalSeconds),
              assigned_shift_seconds: assignedShiftSeconds,
              overtime: overtimeSeconds,
              is_late: record.is_late,
              late_minutes: record.late_minutes || 0
            };
          });
          // Client-side filter for department and name (in case API doesn't filter)
          if (selectedDepartment) {
            records = records.filter((r: any) => (r.department_name || "").toLowerCase() === selectedDepartment.toLowerCase());
          }
          if (searchName) {
            records = records.filter((r: any) => (r.employee_name || "").toLowerCase().includes(searchName.toLowerCase()));
          }
          setAttendance(records);

          // Fetch approved leaves for employees in the date range
          const uniqueEmployees = [...new Set(records.map((r: any) => String(r.employee_id)))] as string[];
          if (uniqueEmployees.length > 0) {
            fetchApprovedLeaves(uniqueEmployees, fromDate, toDate);
          }
        }
      })
      .catch(err => console.error("Error fetching attendance:", err))
      .finally(() => setLoading(false));
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
            const startDate = new Date(leave.start_date);
            const endDate = new Date(leave.end_date);
            let currentDate = new Date(startDate);

            while (currentDate <= endDate) {
              // Use local date string (not UTC) for correct mapping
              const dateKey = currentDate.getFullYear() + '-' +
                String(currentDate.getMonth() + 1).padStart(2, '0') + '-' +
                String(currentDate.getDate()).padStart(2, '0');
              leavesMap[empId][dateKey] = true;
              currentDate.setDate(currentDate.getDate() + 1);
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


  // Sync filters with page: fetch data whenever any filter changes
  useEffect(() => {
    fetchAttendance();
  }, [fromDate, toDate, selectedDepartment, searchName]);

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
    
    const inTime = new Date(clockIn);
    const outTime = new Date(clockOut);
    
    const diffMilliseconds = outTime.getTime() - inTime.getTime();
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
    const time = new Date(timeString);
    return time.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit'
    });
  }

  function formatDate(dateString: string) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: '2-digit', 
      day: '2-digit', 
      year: 'numeric' 
    });
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
    if (!dateValue) return "";
    const dateOnlyMatch = /^\d{4}-\d{2}-\d{2}$/.exec(dateValue);
    if (dateOnlyMatch) return dateValue;
    const parsed = new Date(dateValue);
    if (Number.isNaN(parsed.getTime())) return dateValue.split("T")[0] || "";
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, "0");
    const day = String(parsed.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function getRecordDateKey(record: any) {
    return getDateKey(record.clock_in || record.clock_out || record.date || "");
  }

  function calculateTotalDeduction(employee: any) {
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

  function isWorkingDay(dateKey: string) {
    if (!dateKey) return false;
    const override = calendarOverrides[dateKey];
    if (override) return override.status === "working";
    const [yearStr, monthStr, dayStr] = dateKey.split("-");
    const year = Number(yearStr);
    const monthIndex = Number(monthStr) - 1;
    const day = Number(dayStr);
    if (!year || monthIndex < 0 || !day) return false;
    const date = new Date(year, monthIndex, day);
    const weekday = date.getDay();
    return weekday !== 0 && weekday !== 6;
  }

  function downloadExcel() {
    const dataToExport = attendance.map(record => ({
      "ID": record.employee_id,
      "Date": formatDate(record.date),
      "Clock In": formatTime(record.clock_in),
      "Clock Out": formatTime(record.clock_out),
      "Total Hours": record.total_hours,
      "Late": record.is_late ? formatLateTime(record.late_minutes) : "On Time"
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Monthly Attendance");
    
    worksheet['!cols'] = [
      { wch: 8 },
      { wch: 18 },
      { wch: 15 },
      { wch: 15 },
      { wch: 12 },
      { wch: 13 },
      { wch: 13 },
      { wch: 12 },
      { wch: 15 }
    ];

    const fileName = `monthly-attendance-${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  }

  // Export single employee's month table
  function downloadEmployeeExcel(employee: any) {
    // Build table rows for this employee for the selected month
    const rows: any[] = [];
    if (!monthInfo.days) return;
    monthInfo.days.forEach((day) => {
      const dayRecords = employee.byDate[day.dateKey] || [];
      const meta = employee.dateMeta[day.dateKey];
      const workingDay = isWorkingDay(day.dateKey);
      if (dayRecords.length === 0) {
        // Check for approved leave
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
        rows.push({
          Day: day.weekday,
          Date: formatDateKey(day.dateKey),
          "Clock In": "---",
          "Clock Out": "---",
          "Total W.H": "---",
          "Assigned W.H": "---",
          OverTime: "---",
          "Tardy Count": meta?.runningLate ? meta.runningLate : "",
          Status: statusLabel,
          Deduction: deduction
        });
      } else {
        dayRecords.forEach((record: any, index: number) => {
          // Use the same formatting as the table
          rows.push({
            Day: day.weekday,
            Date: formatDateKey(day.dateKey),
            "Clock In": formatTime(record.clock_in),
            "Clock Out": formatTime(record.clock_out),
            "Total W.H": record.total_hours ? formatHoursMins(record.total_hours) : "---",
            "Assigned W.H": record.assigned_working_hours ? formatHoursMins(record.assigned_working_hours) : (record.assigned_shift_seconds ? formatDurationHM(record.assigned_shift_seconds) : "---"),
            OverTime: record.overtime ? formatDurationHM(record.overtime) : "---",
            "Tardy Count": meta?.runningLate ? meta.runningLate : "",
            Status: meta?.statusLabel || "",
            Deduction: meta?.deduction || ""
          });
        });
      }
    });
    // Calculate total deduction (same as in table)
    let totalDeduction = 0;
    rows.forEach((row) => {
      if (row.Deduction && typeof row.Deduction === 'string' && row.Deduction.endsWith('%')) {
        const val = parseFloat(row.Deduction.replace('%', ''));
        if (!isNaN(val)) totalDeduction += val;
      }
    });

    // Add summary rows for Total Deduction, Extra Hours, and Total Working Days
    rows.push(
      {
        Day: '',
        Date: '',
        "Clock In": '',
        "Clock Out": '',
        "Total W.H": '',
        "Assigned W.H": '',
        OverTime: '',
        "Tardy Count": '',
        Status: 'Total Deduction:',
        Deduction: `${totalDeduction}%`
      },
      {
        Day: '',
        Date: '',
        "Clock In": '',
        "Clock Out": '',
        "Total W.H": '',
        "Assigned W.H": '',
        OverTime: '',
        "Tardy Count": '',
        Status: 'Extra Hours:',
        Deduction: `${getEmployeeTotalOvertime(employee)}`
      },
      {
        Day: '',
        Date: '',
        "Clock In": '',
        "Clock Out": '',
        "Total W.H": '',
        "Assigned W.H": '',
        OverTime: '',
        "Tardy Count": '',
        Status: 'Total Working Days:',
        Deduction: `${getTotalWorkingDays(employee, monthInfo, approvedLeavesMap)}`
      }
    );

    // Add employee info as header rows ABOVE the table headers
    // First, extract table headers from the first data row
    const tableHeaders = rows.length > 0 ? Object.keys(rows[0]) : [];
    // Build a blank row for spacing
    const blankRow: any = {};
    tableHeaders.forEach(h => blankRow[h] = '');
    // Build header rows as objects with only first column filled
    const headerRows = [
      { [tableHeaders[0]]: `Employee Name: ${employee.employeeName}` },
      { [tableHeaders[0]]: `Pseudonym: ${employee.pseudonym}` },
      { [tableHeaders[0]]: `Department: ${employee.departmentName}` },
      blankRow
    ];
    // Add table headers as the next row
    const headerRowObj: any = {};
    tableHeaders.forEach(h => { headerRowObj[h] = h; });
    const allRows = [...headerRows, headerRowObj, ...rows];

    const worksheet = XLSX.utils.json_to_sheet(allRows, { skipHeader: true });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, employee.employeeName);
    worksheet['!cols'] = [
      { wch: 24 },
      { wch: 12 },
      { wch: 15 },
      { wch: 15 },
      { wch: 12 },
      { wch: 13 },
      { wch: 13 },
      { wch: 12 },
      { wch: 15 },
      { wch: 12 }
    ];
    const fileName = `attendance-${employee.employeeName.replace(/\s+/g, "_")}-${selectedMonth}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  }

  const monthInfo = React.useMemo(() => {
    if (!selectedMonth) return { label: "", days: [] as { day: number; dateKey: string; weekday: string }[] };
    const [yearStr, monthStr] = selectedMonth.split("-");
    const year = Number(yearStr);
    const monthIndex = Number(monthStr) - 1;
    if (!year || monthIndex < 0) return { label: "", days: [] };
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const label = new Date(year, monthIndex, 1).toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });
    const days = Array.from({ length: daysInMonth }, (_, index) => {
      const day = index + 1;
      const dateKey = `${yearStr}-${monthStr}-${String(day).padStart(2, "0")}`;
      const weekday = new Date(year, monthIndex, day).toLocaleDateString("en-US", { weekday: "short" });
      return { day, dateKey, weekday };
    });
    return { label, days };
  }, [selectedMonth]);

  // New logic: Always show all employees from DB, merge attendance if present
  const [allEmployees, setAllEmployees] = React.useState<any[]>([]);
  const [salaryMap, setSalaryMap] = React.useState<Record<string, number>>({});

  // Fetch all employees and their salary (amount, any component)
  React.useEffect(() => {
    // Fetch all employees
    fetch('/api/employee-list')
      .then(res => res.json())
      .then(data => {
        if (data.success && Array.isArray(data.employees)) {
          setAllEmployees(data.employees);
        } else {
          setAllEmployees([]);
        }
      })
      .catch(() => setAllEmployees([]));
    // Fetch all salaries (all components, show amount)
    fetch('/api/employee_salaries/all')
      .then(res => res.json())
      .then(data => {
        if (data.success && Array.isArray(data.salaries)) {
          const map: Record<string, number> = {};
          data.salaries.forEach((row: any) => {
            if (row.employee_id && row.amount !== undefined) {
              map[String(row.employee_id)] = row.amount;
            }
          });
          setSalaryMap(map);
        }
      });
  }, []);

  const attendanceByEmployee = React.useMemo(() => {
    // Build attendance map as before
    const attMap: Record<string, {
      byDate: Record<string, any[]>;
      dateMeta: Record<string, { runningLate: number; statusLabel: string; statusColor: string; deduction: string }>;
      attendanceRecord: any;
    }> = {};
    attendance.forEach((record: any) => {
      if (!record.employee_id) return;
      const empId = record.employee_id;
      if (!attMap[empId]) {
        attMap[empId] = { byDate: {}, dateMeta: {}, attendanceRecord: record };
      }
      const dateKey = getRecordDateKey(record);
      if (!dateKey) return;
      if (!attMap[empId].byDate[dateKey]) attMap[empId].byDate[dateKey] = [];
      attMap[empId].byDate[dateKey].push(record);
    });
    // Calculate dateMeta as before
    Object.entries(attMap).forEach(([empId, employee]) => {
      const allRecords = Object.values(employee.byDate).flat();
      const sorted = [...allRecords].sort((a: any, b: any) => {
        const aKey = getRecordDateKey(a);
        const bKey = getRecordDateKey(b);
        return aKey.localeCompare(bKey);
      });
      let runningLate = 0;
      const seenDates = new Set<string>();
      sorted.forEach((record: any) => {
        const dateKey = getRecordDateKey(record);
        if (!dateKey || seenDates.has(dateKey)) return;
        seenDates.add(dateKey);
        let statusLabel = "On Time";
        let statusColor = "#276749";
        let deduction = "";
        if (record.is_late) {
          runningLate += 1;
          statusLabel = "Tardy";
          statusColor = "#E53E3E";
          if (runningLate === 4) statusLabel = "Half Day";
          else if (runningLate >= 5) statusLabel = "Full Day";
        }
        if (statusLabel === "Tardy") deduction = "0%";
        else if (statusLabel === "Half Day") deduction = "50%";
        else if (statusLabel === "Full Day") deduction = "100%";
        employee.dateMeta[dateKey] = { runningLate, statusLabel, statusColor, deduction };
      });
    });
    // Merge all employees with attendance
    return allEmployees.map(emp => {
      const empId = String(emp.id || emp.employee_id);
      const att = attMap[empId];
      // Always show salary from salaryMap (amount, any component)
      const basicSalary = salaryMap[empId];
      return {
        employeeId: empId,
        employeeName: (emp.first_name && emp.last_name) ? `${emp.first_name} ${emp.last_name}` : (emp.employee_name || "-"),
        pseudonym: emp.pseudonym || "-",
        departmentName: emp.department_name || "-",
        basicSalary,
        byDate: att ? att.byDate : {},
        dateMeta: att ? att.dateMeta : {},
      };
    });
  }, [attendance, allEmployees, salaryMap]);

  // Calculate total overtime (extra hours) for the month for an employee
  function getEmployeeTotalOvertime(emp: any) {
    let totalSeconds = 0;
    Object.values(emp.byDate).forEach((records) => {
      (records as any[]).forEach((record) => {
        if (record.overtime && typeof record.overtime === 'number' && record.overtime > 0) {
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
            Monthly Payroll
          </h1>
          <p style={{ color: "#4A5568", fontSize: "0.9rem", marginTop: 4 }}>
            View and manage all employee payroll records
          </p>
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
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className={styles.attendanceSummaryDate}
          />
          <span style={{ color: "#718096" }}>to</span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className={styles.attendanceSummaryDate}
          />
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
        </div>

        {loading ? (
          <div style={{ padding: 20, color: "#4A5568", textAlign: "center" }}>
            Loading attendance records...
          </div>
        ) : null}

        {/* Cards summary (hidden, not deleted) */}
        {/*
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
                  </div>
                </div>
                <div style={{ padding: 12 }}>
                  <div><b>T.Unpaid Days (Deduction):</b> {Object.keys(employee.byDate).length > 0 ? (() => { const val = calculateTotalDeduction(employee) / 100; return Number.isInteger(val) ? val : val.toFixed(1).replace(/\.0$/, ''); })() : '--'}</div>
                  <div><b>T.W Days:</b> {Object.keys(employee.byDate).length > 0 ? getTotalWorkingDays(employee, monthInfo, approvedLeavesMap) : '--'}</div>
                  <div><b>O.T Hours:</b> {Object.keys(employee.byDate).length > 0 ? getEmployeeTotalOvertime(employee) : '--'}</div>
                </div>
              </div>
            ))
          )}
        </div>
        */}

        <div style={{ marginTop: 40 }}>
          <table style={{ width: '100%', borderRadius: 16, overflow: 'hidden', background: 'linear-gradient(90deg, #0052CC 0%, #00B8A9 100%)', color: '#fff' }}>
            <thead>
              <tr>
                <th style={{ padding: '12px 16px', textAlign: 'left' }}>ID</th>
                <th style={{ padding: '12px 16px', textAlign: 'left' }}>Employee Name</th>
                <th style={{ padding: '12px 16px', textAlign: 'left' }}>Pseudonym</th>
                <th style={{ padding: '12px 16px', textAlign: 'left' }}>Department</th>
                <th style={{ padding: '12px 16px', textAlign: 'left' }}>Basic Salary</th>
                <th style={{ padding: '12px 16px', textAlign: 'left' }}>T.W Days</th>
                <th style={{ padding: '12px 16px', textAlign: 'left' }}>T.Unpaid Days</th>
                <th style={{ padding: '12px 16px', textAlign: 'left' }}>O. T Hours</th>
              </tr>
            </thead>
            <tbody style={{ background: '#fff', color: '#22223B' }}>
              {attendanceByEmployee && attendanceByEmployee.length > 0 ? (
                attendanceByEmployee.map((employee) => (
                  <tr key={employee.employeeId} style={{ background: '#fff', color: '#22223B' }}>
                    <td style={{ padding: '10px 16px' }}>{employee.employeeId}</td>
                    <td style={{ padding: '10px 16px' }}>{employee.employeeName}</td>
                    <td style={{ padding: '10px 16px' }}>{employee.pseudonym}</td>
                    <td style={{ padding: '10px 16px' }}>{employee.departmentName}</td>
                    <td style={{ padding: '10px 16px' }}>{employee.basicSalary !== undefined ? employee.basicSalary : '--'}</td>
                    <td style={{ padding: '10px 16px' }}>{Object.keys(employee.byDate).length > 0 ? getTotalWorkingDays(employee, monthInfo, approvedLeavesMap) : '--'}</td>
                    <td style={{ padding: '10px 16px' }}>{Object.keys(employee.byDate).length > 0 ? (() => { const val = calculateTotalDeduction(employee) / 100; return Number.isInteger(val) ? val : val.toFixed(1).replace(/\.0$/, ''); })() : '--'}</td>
                    <td style={{ padding: '10px 16px' }}>{Object.keys(employee.byDate).length > 0 ? getEmployeeTotalOvertime(employee) : '--'}</td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 16 }}>No records found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </LayoutDashboard>
  );
}
