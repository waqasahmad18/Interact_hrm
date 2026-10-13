/**
 * Daily Salary Calculator — same attendance/tardy rules as Monthly Attendance.
 * Daily rate = basic ÷ working days; unpaid days = sum(deduction%) / 100.
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
  daily_rate: number;
  deducted_amount: number;
  earned_amount: number;
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
  daily_rate: number;
  total_earned: number;
  total_deducted: number;
  unpaid_days: number;
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

export function amountsForDay(dailyRate: number, deductionPercent: number, countsAsPaidDay: boolean) {
  if (!countsAsPaidDay || dailyRate <= 0) {
    return { deducted_amount: 0, earned_amount: 0 };
  }
  const pct = Math.max(0, Math.min(100, deductionPercent)) / 100;
  const deducted = roundMoney(dailyRate * pct);
  const earned = roundMoney(dailyRate * (1 - pct));
  return { deducted_amount: deducted, earned_amount: earned };
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
 * Build day rows for one employee using Monthly Attendance rules.
 * Working days (denominator) = calendar working days minus approved leave.
 */
export function buildEmployeeDailySalary(params: {
  employeeId: string;
  employeeName: string;
  pseudonym?: string;
  departmentName?: string;
  month: string;
  basicSalary: number;
  gender?: string | null;
  attendanceByDate: Record<string, any[]>;
  approvedLeaveDates: Set<string>;
  calendarOverrides: Record<string, "off" | "working">;
  /** Keep manual edits when regenerating (matched by work_date). */
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
  const dailyRate = workingDays > 0 && basic > 0 ? roundMoney(basic / workingDays) : 0;

  let runningLate = 0;
  const days: DailySalaryDayRow[] = [];

  for (const dateKey of dateKeys) {
    const prevManual = params.previousManualDays?.get(dateKey);
    if (prevManual?.is_manual) {
      // Re-apply amounts with current daily rate unless earned was custom-locked via notes? Keep stored %/status.
      const countsAsPaid =
        prevManual.is_working_day &&
        normalizeAttendanceStatus(prevManual.status_label) !== "Off";
      const amts = amountsForDay(dailyRate, prevManual.deduction_percent, countsAsPaid);
      days.push({
        ...prevManual,
        daily_rate: dailyRate,
        deducted_amount: amts.deducted_amount,
        earned_amount: amts.earned_amount,
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

    // Leave days are paid (excluded from working-days denom) — show rate but no earn/deduct on leave row
    // Paid day = working day in denominator (not Off, not Leave)
    const countsAsPaidDay = isWorking && !onLeave;
    const amts = amountsForDay(dailyRate, deductionPercent, countsAsPaidDay);

    days.push({
      work_date: dateKey,
      is_working_day: isWorking && !onLeave,
      status_label: statusLabel,
      tardy_count: tardyCount,
      deduction_percent: deductionPercent,
      daily_rate: countsAsPaidDay ? dailyRate : 0,
      deducted_amount: amts.deducted_amount,
      earned_amount: amts.earned_amount,
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
    daily_rate: dailyRate,
    days,
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
  daily_rate: number;
  days: DailySalaryDayRow[];
}): DailySalarySummary {
  let totalEarned = 0;
  let totalDeducted = 0;
  let unpaidUnits = 0;
  for (const day of input.days) {
    if (!day.is_working_day) continue;
    totalEarned += day.earned_amount;
    totalDeducted += day.deducted_amount;
    unpaidUnits += day.deduction_percent / 100;
  }
  return {
    ...input,
    total_earned: roundMoney(totalEarned),
    total_deducted: roundMoney(totalDeducted),
    unpaid_days: roundMoney(unpaidUnits),
  };
}

/** Apply an edit to one day and recompute money + summary. */
export function applyDayEdit(
  summary: DailySalarySummary,
  workDate: string,
  patch: {
    status_label?: string;
    deduction_percent?: number;
    notes?: string | null;
    /** When true, use earned/deducted amounts and back-calc deduction %. */
    money_override?: boolean;
    earned_amount?: number;
    deducted_amount?: number;
  },
): DailySalarySummary {
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
    const dailyRate = d.is_working_day ? summary.daily_rate : 0;
    let amts = amountsForDay(dailyRate, deduction, d.is_working_day);

    if (patch.money_override) {
      if (patch.earned_amount != null && Number.isFinite(patch.earned_amount)) {
        amts = {
          earned_amount: roundMoney(patch.earned_amount),
          deducted_amount:
            patch.deducted_amount != null && Number.isFinite(patch.deducted_amount)
              ? roundMoney(patch.deducted_amount)
              : roundMoney(Math.max(0, dailyRate - roundMoney(patch.earned_amount))),
        };
        if (dailyRate > 0) {
          deduction = Math.max(
            0,
            Math.min(100, roundMoney(((dailyRate - amts.earned_amount) / dailyRate) * 100)),
          );
        }
      } else if (patch.deducted_amount != null && Number.isFinite(patch.deducted_amount)) {
        amts = {
          deducted_amount: roundMoney(patch.deducted_amount),
          earned_amount: roundMoney(Math.max(0, dailyRate - roundMoney(patch.deducted_amount))),
        };
        if (dailyRate > 0) {
          deduction = Math.max(0, Math.min(100, roundMoney((amts.deducted_amount / dailyRate) * 100)));
        }
      }
    }
    return {
      ...d,
      status_label: status,
      deduction_percent: deduction,
      daily_rate: dailyRate,
      deducted_amount: amts.deducted_amount,
      earned_amount: amts.earned_amount,
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
    daily_rate: summary.daily_rate,
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
