export const SERVER_TIMEZONE = "Asia/Karachi";

type DateInput = Date | string | number;

function toDate(value: DateInput) {
  return value instanceof Date ? value : new Date(value);
}

function getParts(value: DateInput, timeZone: string = SERVER_TIMEZONE) {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return null;

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const parts = formatter.formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  const second = Number(parts.find((part) => part.type === "second")?.value);

  if (
    [year, month, day, hour, minute, second].some((num) => Number.isNaN(num))
  ) {
    return null;
  }

  return { year, month, day, hour, minute, second };
}

export function getDateStringInTimeZone(
  value: DateInput,
  timeZone: string = SERVER_TIMEZONE
) {
  const parts = getParts(value, timeZone);
  if (!parts) return "";
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

/** MySQL DATETIME string in the given zone (wall clock), not UTC — keeps DATE(clock_in) aligned with business day (e.g. Asia/Karachi). */
export function formatMysqlDateTimeInTimeZone(
  value: DateInput,
  timeZone: string = SERVER_TIMEZONE
): string {
  const parts = getParts(value, timeZone);
  if (!parts) return "";
  const { year, month, day, hour, minute, second } = parts;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")} ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`;
}

/** Parse MySQL DATETIME stored as Asia/Karachi wall time (naive) into a correct Date for APIs/UI. */
export function parseMysqlNaiveDateTimeKarachi(value: string | null | undefined): Date | null {
  if (value == null || String(value).trim() === "") return null;
  const s = String(value).trim();
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::(\d{2}))?$/.exec(s);
  if (m) {
    const sec = m[3] || "00";
    const d = new Date(`${m[1]}T${m[2]}:${sec}+05:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function getTimeStringInTimeZone(
  value: DateInput,
  timeZone: string = SERVER_TIMEZONE
) {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

export function getTimeInMinutesInTimeZone(
  value: DateInput,
  timeZone: string = SERVER_TIMEZONE
) {
  const parts = getParts(value, timeZone);
  if (!parts) return null;
  return parts.hour * 60 + parts.minute;
}

export function getDateTimeLocalInTimeZone(
  value: DateInput,
  timeZone: string = SERVER_TIMEZONE
) {
  const parts = getParts(value, timeZone);
  if (!parts) return "";
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}T${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

export function dateTimeLocalToIsoInTimeZone(
  dateTimeLocal: string,
  timeZone: string = SERVER_TIMEZONE
) {
  if (!dateTimeLocal) return "";
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::(\d{2}))?$/.exec(
    dateTimeLocal
  );
  if (!match) return "";

  const datePart = match[1];
  const timePart = match[2];
  const seconds = match[3] || "00";

  if (timeZone === SERVER_TIMEZONE) {
    const parsed = new Date(`${datePart}T${timePart}:${seconds}+05:00`);
    return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
  }

  const fallback = new Date(`${datePart}T${timePart}:${seconds}`);
  return Number.isNaN(fallback.getTime()) ? "" : fallback.toISOString();
}