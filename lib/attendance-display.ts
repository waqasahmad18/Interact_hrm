import { getDateStringInTimeZone, getParts, SERVER_TIMEZONE } from "@/lib/timezone";

/** Same as Attendance Summary page formatDateOnly */
export function formatDateOnly(dateValue: string | null | undefined) {
  if (!dateValue) return "";
  const dateOnlyMatch = /^\d{4}-\d{2}-\d{2}$/.exec(dateValue);
  if (dateOnlyMatch) return dateValue;
  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) return dateValue;
  return getDateStringInTimeZone(parsed, SERVER_TIMEZONE);
}

export function monthStartFromDate(dateStr: string) {
  return `${dateStr.slice(0, 7)}-01`;
}

/** YYYY-MM → first and last day of month (last day capped to today if current month). */
export function monthRangeFromMonth(monthStr: string) {
  const [yearStr, monthStrNum] = monthStr.split("-");
  const year = Number(yearStr);
  const monthIndex = Number(monthStrNum) - 1;
  if (!year || monthIndex < 0) {
    const today = getDateStringInTimeZone(new Date(), SERVER_TIMEZONE);
    return { from: today, to: today };
  }
  const from = `${yearStr}-${monthStrNum}-01`;
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const monthEnd = `${yearStr}-${monthStrNum}-${String(daysInMonth).padStart(2, "0")}`;
  const today = getDateStringInTimeZone(new Date(), SERVER_TIMEZONE);
  const to = monthEnd > today ? today : monthEnd;
  return { from, to };
}

/** Elapsed seconds from clock_in to now (Karachi), matching the clock widget sync. */
export function elapsedSecondsSinceClockIn(clockIn: string | null | undefined): number {
  if (!clockIn) return 0;
  const inParts = getParts(clockIn, SERVER_TIMEZONE);
  if (!inParts) return 0;
  const start = Date.UTC(
    inParts.year,
    inParts.month - 1,
    inParts.day,
    inParts.hour,
    inParts.minute,
    inParts.second,
  );
  const nowParts = getParts(new Date(), SERVER_TIMEZONE);
  if (!nowParts) return 0;
  const end = Date.UTC(
    nowParts.year,
    nowParts.month - 1,
    nowParts.day,
    nowParts.hour,
    nowParts.minute,
    nowParts.second,
  );
  return Math.max(0, Math.floor((end - start) / 1000));
}

/** Hours-only label for dashboard (e.g. "0.2h", "3h", "3.5h") — never minutes. */
export function formatDashboardHoursOnly(hours: number): string {
  if (hours <= 0) return "0h";
  const rounded = Math.round(hours * 10) / 10;
  if (Number.isInteger(rounded)) return `${rounded}h`;
  return `${rounded.toFixed(1)}h`;
}

/** Alias for formatDashboardHoursOnly. */
export function formatDashboardHours(hours: number): string {
  return formatDashboardHoursOnly(hours);
}
