/**
 * Daily Salary Calculator — Monthly Payroll hourly formula + day-by-day status pay.
 *
 * Per hour = Basic ÷ Working Days ÷ Hours/Day  (same as Monthly Payroll OT rate)
 * Full day pay = Per hour × Hours/Day = Basic ÷ Working Days
 * Each working day: hours credited by status (100%/50%/0%) → earned = per hour × hours credited
 */
import { normalizeAttendanceStatus } from "./attendance-status";
import {
  STATUS_FIRST_HALF_DAY,
  STATUS_SECOND_HALF_DAY,
  aggregateDayPunches,
  classifyDayAttendance,
  tardyDeductionFromCount,
} from "./monthly-attendance-status";
import { getDateStringInTimeZone, SERVER_TIMEZONE } from "./timezone";

export type DailySalaryDayRow = {
  work_date: string;
  is_working_day: boolean;
  status_label: string;
  tardy_count: number | null;
  deduction_percent: number;
  /** Same as Monthly Payroll full-day rate (Basic ÷ W.Days). */
  daily_rate: number;
  /** Basic ÷ W.Days ÷ Hours/Day */
  hourly_rate: number;
  /** Hours credited for this day after status deduction (e.g. full 9, half 4.5, absent 0). */
  hours_credited: number;
  deducted_amount: number;
  /** Paisay is din salary mein add hue (absent = 0). */
  earned_amount: number;
  /** Is din tak cumulative earned (kal + pehle + aaj). */
  running_earned: number;
  /** Is din tak cumulative deducted. */
  running_deducted: number;
  clock_in: string | null;
  clock_out: string | null;
  is_manual: boolean;
  notes: string | null;
};

export type DailySalarySummary = {
  employee_id: string;
  employee_name: string;
  pseudonym: string;
  department_name: string;
  month: string;
  basic_salary: number;
  working_days: number;
  /** Paid hours/day used in rate (Monthly Payroll: ~5 or 9). */
  paid_hours_per_day: number;
  hourly_rate: number;
  daily_rate: number;
  total_earned: number;
  total_deducted: number;
  unpaid_days: number;
  /** Sum of hours credited on working days. */
  total_hours_credited: number;
  days: DailySalaryDayRow[];
};

export function monthDateKeys(month: string): string[] {
  const [yStr, mStr] = month.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return [];
  const last = new Date(y, m, 0).getDate();
  const keys: string[] = [];
  for (let d = 1; d <= last; d++) {
    keys.push(`${yStr}-${mStr}-${String(d).padStart(2, "0")}`);
  }
  return keys;
}

export function isDefaultWeekend(dateKey: string): boolean {
  const [y, mo, d] = dateKey.split("-").map(Number);
  const dow = new Date(y, mo - 1, d).getDay();
  return dow === 0 || dow === 6;
}

export function isWorkingDayForKey(
  dateKey: string,
  calendarOverrides: Record<string, "off" | "working">,
): boolean {
  const override = calendarOverrides[dateKey];
  if (override === "off") return false;
  if (override === "working") return true;
  return !isDefaultWeekend(dateKey);
}

export function parseDeductionPercent(value: string | number | null | undefined): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.min(100, value));
  const raw = String(value ?? "").replace(/%/g, "").trim();
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(100, n);
}

export function roundMoney(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

export function roundHours(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

/** Monthly Payroll: shift ≤ 5.5h → 5 paid hours; else 9. */
export function paidHoursFromShiftSeconds(shiftSeconds: number | null | undefined): number {
  if (shiftSeconds == null || !(shiftSeconds > 0)) return 9;
  const hours = shiftSeconds / 3600;
  if (hours <= 5.5) return 5;
  return 9;
}

export function ratesFromBasic(
  basicSalary: number,
  workingDays: number,
  paidHoursPerDay: number,
): { hourly_rate: number; daily_rate: number } {
  const basic = Number(basicSalary) || 0;
  const wd = Number(workingDays) || 0;
  const hours = Number(paidHoursPerDay) > 0 ? Number(paidHoursPerDay) : 9;
  if (basic <= 0 || wd <= 0) return { hourly_rate: 0, daily_rate: 0 };
  const hourly = basic / wd / hours;
  return {
    hourly_rate: roundMoney(hourly),
    daily_rate: roundMoney(hourly * hours),
  };
}

/**
 * Status → pay: full hours, half, or zero (via deduction %).
 * earned = hourly_rate × hours_credited
 * deducted = hourly_rate × (fullHours − hours_credited)
 */
export function amountsForDay(params: {
  hourlyRate: number;
  paidHoursPerDay: number;
  deductionPercent: number;
  countsAsPaidDay: boolean;
}) {
  const hoursDay = Number(params.paidHoursPerDay) > 0 ? Number(params.paidHoursPerDay) : 9;
  const hourly = Number(params.hourlyRate) || 0;
  if (!params.countsAsPaidDay || hourly <= 0 || hoursDay <= 0) {
    return { hours_credited: 0, deducted_amount: 0, earned_amount: 0 };
  }
  const pct = Math.max(0, Math.min(100, params.deductionPercent)) / 100;
  const hoursCredited = roundHours(hoursDay * (1 - pct));
  const earned = roundMoney(hourly * hoursCredited);
  const deducted = roundMoney(hourly * (hoursDay - hoursCredited));
  return { hours_credited: hoursCredited, deducted_amount: deducted, earned_amount: earned };
}

export function recordDateKey(record: {
  clock_in?: string | null;
  clock_out?: string | null;
  date?: string | null;
}): string | null {
  const raw = record.clock_in || record.clock_out || record.date || "";
  if (!raw) return null;
  const fromTz = getDateStringInTimeZone(raw, SERVER_TIMEZONE);
  if (fromTz && /^\d{4}-\d{2}-\d{2}$/.test(fromTz)) return fromTz;
  const s = String(raw);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}

function deductionForStatus(statusLabel: string, tardyCount: number | null): number {
  const s = normalizeAttendanceStatus(statusLabel);
  if (s === "Absent") return 100;
  if (s === STATUS_FIRST_HALF_DAY || s === STATUS_SECOND_HALF_DAY) return 50;
  if (s === "Tardy") return parseDeductionPercent(tardyDeductionFromCount(tardyCount));
  return 0;
}

/**
 * Build day rows: per-hour rate × hours credited by attendance status.
 */
export function buildEmployeeDailySalary(params: {
  employeeId: string;
  employeeName: string;
  pseudonym?: string;
  departmentName?: string;
  month: string;
  basicSalary: number;
  /** Default 9 — same as Monthly Payroll when shift unknown. */
  paidHoursPerDay?: number;
  gender?: string | null;
  attendanceByDate: Record<string, any[]>;
  approvedLeaveDates: Set<string>;
  calendarOverrides: Record<string, "off" | "working">;
  previousManualDays?: Map<string, DailySalaryDayRow>;
}): DailySalarySummary {
  const dateKeys = monthDateKeys(params.month);
  const workingDayKeys = dateKeys.filter((dk) => {
    if (!isWorkingDayForKey(dk, params.calendarOverrides)) return false;
    if (params.approvedLeaveDates.has(dk)) return false;
    return true;
  });
  const workingDays = workingDayKeys.length;
  const basic = Number(params.basicSalary) || 0;
  const paidHoursPerDay =
    Number(params.paidHoursPerDay) > 0 ? Number(params.paidHoursPerDay) : 9;
  const { hourly_rate: hourlyRate, daily_rate: dailyRate } = ratesFromBasic(
    basic,
    workingDays,
    paidHoursPerDay,
  );

  let runningLate = 0;
  const days: DailySalaryDayRow[] = [];

  for (const dateKey of dateKeys) {
    const prevManual = params.previousManualDays?.get(dateKey);
    if (prevManual?.is_manual) {
      const countsAsPaid =
        prevManual.is_working_day &&
        normalizeAttendanceStatus(prevManual.status_label) !== "Off";
      const amts = amountsForDay({
        hourlyRate,
        paidHoursPerDay,
        deductionPercent: prevManual.deduction_percent,
        countsAsPaidDay: countsAsPaid,
      });
      days.push({
        ...prevManual,
        daily_rate: countsAsPaid ? dailyRate : 0,
        hourly_rate: countsAsPaid ? hourlyRate : 0,
        hours_credited: amts.hours_credited,
        deducted_amount: amts.deducted_amount,
        earned_amount: amts.earned_amount,
        running_earned: 0,
        running_deducted: 0,
        is_manual: true,
      });
      if (
        normalizeAttendanceStatus(prevManual.status_label) === "Tardy" &&
        prevManual.is_working_day &&
        !params.approvedLeaveDates.has(dateKey)
      ) {
        const tc = Number(prevManual.tardy_count);
        if (Number.isFinite(tc) && tc > runningLate) runningLate = tc;
      }
      continue;
    }

    const isWorking = isWorkingDayForKey(dateKey, params.calendarOverrides);
    const onLeave = params.approvedLeaveDates.has(dateKey);
    const dayRecords = params.attendanceByDate[dateKey] || [];

    let statusLabel = "";
    let tardyCount: number | null = null;
    let deductionPercent = 0;
    let clockIn: string | null = null;
    let clockOut: string | null = null;

    if (!isWorking) {
      statusLabel = "Off";
      deductionPercent = 0;
    } else if (onLeave) {
      statusLabel = "Leave";
      deductionPercent = 0;
    } else if (dayRecords.length === 0) {
      statusLabel = "Absent";
      deductionPercent = 100;
    } else {
      const { clockIn: cin, clockOut: cout, record } = aggregateDayPunches(dayRecords);
      clockIn = cin;
      clockOut = cout;
      const dayStatus = classifyDayAttendance({
        dateKey,
        clockIn: cin,
        clockOut: cout,
        shiftStart: record?.shift_start_time ?? null,
        shiftEnd: record?.shift_end_time ?? null,
        gender: params.gender,
      });
      statusLabel = normalizeAttendanceStatus(dayStatus.statusLabel);

      if (statusLabel === "Tardy" && dayStatus.isLate) {
        runningLate += 1;
        tardyCount = runningLate;
        deductionPercent = parseDeductionPercent(tardyDeductionFromCount(runningLate));
      } else if (statusLabel === "Absent") {
        deductionPercent = 100;
      } else if (statusLabel === STATUS_FIRST_HALF_DAY || statusLabel === STATUS_SECOND_HALF_DAY) {
        deductionPercent = 50;
      } else {
        deductionPercent = 0;
      }
    }

    const countsAsPaidDay = isWorking && !onLeave;
    const amts = amountsForDay({
      hourlyRate,
      paidHoursPerDay,
      deductionPercent,
      countsAsPaidDay,
    });

    days.push({
      work_date: dateKey,
      is_working_day: isWorking && !onLeave,
      status_label: statusLabel,
      tardy_count: tardyCount,
      deduction_percent: deductionPercent,
      daily_rate: countsAsPaidDay ? dailyRate : 0,
      hourly_rate: countsAsPaidDay ? hourlyRate : 0,
      hours_credited: amts.hours_credited,
      deducted_amount: amts.deducted_amount,
      earned_amount: amts.earned_amount,
      running_earned: 0,
      running_deducted: 0,
      clock_in: clockIn,
      clock_out: clockOut,
      is_manual: false,
      notes: null,
    });
  }

  return summarizeEmployeeDays({
    employee_id: params.employeeId,
    employee_name: params.employeeName,
    pseudonym: params.pseudonym || "",
    department_name: params.departmentName || "",
    month: params.month,
    basic_salary: basic,
    working_days: workingDays,
    paid_hours_per_day: paidHoursPerDay,
    hourly_rate: hourlyRate,
    daily_rate: dailyRate,
    days,
  });
}

/**
 * Chronological running totals: each day adds its earned (0 if absent/off),
 * so "till this date" salary is accurate day-by-day.
 */
export function attachRunningTotals(days: DailySalaryDayRow[]): DailySalaryDayRow[] {
  const sorted = [...days].sort((a, b) => a.work_date.localeCompare(b.work_date));
  let runningEarned = 0;
  let runningDeducted = 0;
  return sorted.map((day) => {
    // Off / leave: no pay change. Working day: add earned (may be 0 if absent).
    if (day.is_working_day) {
      runningEarned = roundMoney(runningEarned + (Number(day.earned_amount) || 0));
      runningDeducted = roundMoney(runningDeducted + (Number(day.deducted_amount) || 0));
    }
    return {
      ...day,
      running_earned: runningEarned,
      running_deducted: runningDeducted,
    };
  });
}

export function summarizeEmployeeDays(input: {
  employee_id: string;
  employee_name: string;
  pseudonym: string;
  department_name: string;
  month: string;
  basic_salary: number;
  working_days: number;
  paid_hours_per_day: number;
  hourly_rate: number;
  daily_rate: number;
  days: DailySalaryDayRow[];
}): DailySalarySummary {
  const days = attachRunningTotals(input.days);
  let totalEarned = 0;
  let totalDeducted = 0;
  let unpaidUnits = 0;
  let totalHours = 0;
  for (const day of days) {
    if (!day.is_working_day) continue;
    totalEarned += day.earned_amount;
    totalDeducted += day.deducted_amount;
    unpaidUnits += day.deduction_percent / 100;
    totalHours += day.hours_credited || 0;
  }
  return {
    ...input,
    days,
    total_earned: roundMoney(totalEarned),
    total_deducted: roundMoney(totalDeducted),
    unpaid_days: roundMoney(unpaidUnits),
    total_hours_credited: roundHours(totalHours),
  };
}

export function applyDayEdit(
  summary: DailySalarySummary,
  workDate: string,
  patch: {
    status_label?: string;
    deduction_percent?: number;
    notes?: string | null;
    money_override?: boolean;
    earned_amount?: number;
    deducted_amount?: number;
  },
): DailySalarySummary {
  const paidHours = summary.paid_hours_per_day > 0 ? summary.paid_hours_per_day : 9;
  const hourly = summary.hourly_rate;
  const dailyRate = summary.daily_rate;

  const days = summary.days.map((d) => {
    if (d.work_date !== workDate) return d;
    const status = patch.status_label != null ? normalizeAttendanceStatus(patch.status_label) : d.status_label;
    let deduction =
      patch.deduction_percent != null
        ? parseDeductionPercent(patch.deduction_percent)
        : d.deduction_percent;
    if (patch.status_label != null && patch.deduction_percent == null) {
      deduction = deductionForStatus(status, d.tardy_count);
    }

    let amts = amountsForDay({
      hourlyRate: hourly,
      paidHoursPerDay: paidHours,
      deductionPercent: deduction,
      countsAsPaidDay: d.is_working_day,
    });

    if (patch.money_override) {
      if (patch.earned_amount != null && Number.isFinite(patch.earned_amount)) {
        const earned = roundMoney(patch.earned_amount);
        const deducted =
          patch.deducted_amount != null && Number.isFinite(patch.deducted_amount)
            ? roundMoney(patch.deducted_amount)
            : roundMoney(Math.max(0, dailyRate - earned));
        amts = {
          hours_credited: hourly > 0 ? roundHours(earned / hourly) : 0,
          earned_amount: earned,
          deducted_amount: deducted,
        };
        if (dailyRate > 0) {
          deduction = Math.max(0, Math.min(100, roundMoney((deducted / dailyRate) * 100)));
        }
      } else if (patch.deducted_amount != null && Number.isFinite(patch.deducted_amount)) {
        const deducted = roundMoney(patch.deducted_amount);
        const earned = roundMoney(Math.max(0, dailyRate - deducted));
        amts = {
          hours_credited: hourly > 0 ? roundHours(earned / hourly) : 0,
          earned_amount: earned,
          deducted_amount: deducted,
        };
        if (dailyRate > 0) {
          deduction = Math.max(0, Math.min(100, roundMoney((deducted / dailyRate) * 100)));
        }
      }
    }

    return {
      ...d,
      status_label: status,
      deduction_percent: deduction,
      daily_rate: d.is_working_day ? dailyRate : 0,
      hourly_rate: d.is_working_day ? hourly : 0,
      hours_credited: amts.hours_credited,
      deducted_amount: amts.deducted_amount,
      earned_amount: amts.earned_amount,
      running_earned: d.running_earned ?? 0,
      running_deducted: d.running_deducted ?? 0,
      is_manual: true,
      notes: patch.notes !== undefined ? patch.notes : d.notes,
    };
  });

  return summarizeEmployeeDays({
    employee_id: summary.employee_id,
    employee_name: summary.employee_name,
    pseudonym: summary.pseudonym,
    department_name: summary.department_name,
    month: summary.month,
    basic_salary: summary.basic_salary,
    working_days: summary.working_days,
    paid_hours_per_day: paidHours,
    hourly_rate: hourly,
    daily_rate: dailyRate,
    days,
  });
}

export const DAILY_SALARY_STATUS_OPTIONS = [
  "On Time",
  "Tardy",
  "Absent",
  "1st-Half Day",
  "2nd-Half Day",
  "Leave",
  "Off",
] as const;
