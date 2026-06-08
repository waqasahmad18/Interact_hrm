export function normalizeAttendanceStatus(status: string): string {
  const s = String(status || "").trim();
  if (s === "Half Day") return "1st-Half Day";
  if (s === "Full Day") return "Tardy";
  return s;
}

export function isTardyStatus(status: string): boolean {
  return normalizeAttendanceStatus(status) === "Tardy";
}

export function isHalfDayStatus(status: string): boolean {
  const s = normalizeAttendanceStatus(status);
  return s === "1st-Half Day" || s === "2nd-Half Day";
}

export function isAbsentOrHalfDayStatus(status: string): boolean {
  const s = normalizeAttendanceStatus(status);
  return s === "Absent" || isHalfDayStatus(s);
}

/** Status column text color on the web UI (no yellow row styling). */
export function uiStatusTextColor(status: string): string {
  const s = normalizeAttendanceStatus(status);
  if (s === "Tardy") return "#E53E3E";
  if (s === "Absent" || isHalfDayStatus(s)) return "#C53030";
  if (s === "Leave") return "#3182CE";
  if (s === "On Time") return "#276749";
  if (s === "Off") return "#4A5568";
  return "#4A5568";
}

export function statusTextColor(status: string): string {
  return uiStatusTextColor(status);
}
