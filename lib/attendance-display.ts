import { getParts, SERVER_TIMEZONE } from "./timezone";

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

/** @deprecated Use formatDashboardHoursOnly for employee dashboard stats. */
export function formatDashboardHours(hours: number): string {
  return formatDashboardHoursOnly(hours);
}
