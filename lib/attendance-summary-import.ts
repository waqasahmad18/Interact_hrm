import * as XLSX from "xlsx";

export type ImportedAttendanceSummaryRow = {
  id: string;
  employeeId: string;
  employeeName: string;
  pseudonym: string;
  departmentName: string;
  dateKey: string;
  dateDisplay: string;
  clockIn: string;
  clockOut: string;
  totalHours: string;
  late: string;
  lateIsNegative: boolean;
};

export type ImportedAttendanceSummarySnapshot = {
  month: string;
  fromDate: string;
  toDate: string;
  rows: ImportedAttendanceSummaryRow[];
};

const STORAGE_PREFIX = "attendance-summary-import:";

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ");
}

function cellStr(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) {
    const h = value.getHours();
    const m = value.getMinutes();
    const s = value.getSeconds();
    if (h || m || s) {
      const ampm = h >= 12 ? "PM" : "AM";
      const h12 = h % 12 || 12;
      return `${h12}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")} ${ampm}`;
    }
    const mo = value.getMonth() + 1;
    const d = value.getDate();
    const y = value.getFullYear();
    return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value > 0 && value < 1) {
      const totalSeconds = Math.floor(value * 24 * 3600);
      const hour = Math.floor(totalSeconds / 3600);
      const minute = Math.floor((totalSeconds % 3600) / 60);
      const second = totalSeconds % 60;
      const ampm = hour >= 12 ? "PM" : "AM";
      const h12 = hour % 12 || 12;
      return `${h12}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")} ${ampm}`;
    }
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      if (parsed.H || parsed.M || parsed.S) {
        const hour = parsed.H;
        const ampm = hour >= 12 ? "PM" : "AM";
        const h12 = hour % 12 || 12;
        return `${h12}:${String(parsed.M).padStart(2, "0")}:${String(Math.floor(parsed.S || 0)).padStart(2, "0")} ${ampm}`;
      }
      return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
    }
  }
  return String(value).trim();
}

function parseDateKey(value: unknown): string | null {
  if (value == null || String(value).trim() === "") return null;
  const asStr = cellStr(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(asStr)) return asStr;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
    }
  }
  const slash = asStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    return `${slash[3]}-${slash[1].padStart(2, "0")}-${slash[2].padStart(2, "0")}`;
  }
  const dt = new Date(asStr);
  if (!Number.isNaN(dt.getTime())) {
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const d = String(dt.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return null;
}

function findHeaderRowIndex(rows: unknown[][]) {
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const headers = (rows[i] || []).map((c) => normalizeHeader(c));
    const hasName = headers.some((h) => h === "full name" || h === "employee name" || h === "name");
    const hasDate = headers.includes("date");
    if (hasName && hasDate) return i;
    if (headers.includes("id") && hasDate) return i;
  }
  return -1;
}

function colIndex(headers: string[], aliases: string[]) {
  for (const alias of aliases) {
    const idx = headers.indexOf(normalizeHeader(alias));
    if (idx >= 0) return idx;
  }
  return -1;
}

function lateStyle(late: string) {
  const s = late.toLowerCase();
  return s.includes("late");
}

function parseSheetRows(sheet: XLSX.WorkSheet): ImportedAttendanceSummaryRow[] {
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: true }) as unknown[][];
  const headerRowIndex = findHeaderRowIndex(matrix);
  if (headerRowIndex < 0) return [];

  const headers = (matrix[headerRowIndex] || []).map((c) => normalizeHeader(c));
  const iId = colIndex(headers, ["id", "employee id", "emp id"]);
  const iName = colIndex(headers, ["full name", "employee name", "name"]);
  const iPseudo = colIndex(headers, ["p.name", "p name", "pseudonym"]);
  const iDept = colIndex(headers, ["department", "dept"]);
  const iDate = colIndex(headers, ["date"]);
  const iIn = colIndex(headers, ["clock in", "clock_in", "in"]);
  const iOut = colIndex(headers, ["clock out", "clock_out", "out"]);
  const iTotal = colIndex(headers, ["total hours", "total hour", "total w.h"]);
  const iLate = colIndex(headers, ["late", "status"]);

  const out: ImportedAttendanceSummaryRow[] = [];

  for (let r = headerRowIndex + 1; r < matrix.length; r++) {
    const row = matrix[r] || [];
    const employeeName = iName >= 0 ? cellStr(row[iName]) : "";
    const employeeId = iId >= 0 ? cellStr(row[iId]) : "";
    const dateKey = parseDateKey(iDate >= 0 ? row[iDate] : null);
    if (!dateKey && !employeeName && !employeeId) continue;
    if (!dateKey) continue;

    const late = iLate >= 0 ? cellStr(row[iLate]) : "On Time";
    const clockOut = iOut >= 0 ? cellStr(row[iOut]) : "";

    out.push({
      id: `import-${r}-${employeeId || employeeName}`,
      employeeId: employeeId || "-",
      employeeName: employeeName || "-",
      pseudonym: iPseudo >= 0 ? cellStr(row[iPseudo]) || "-" : "-",
      departmentName: iDept >= 0 ? cellStr(row[iDept]) || "-" : "-",
      dateKey,
      dateDisplay: cellStr(iDate >= 0 ? row[iDate] : dateKey) || dateKey,
      clockIn: iIn >= 0 ? cellStr(row[iIn]) : "",
      clockOut,
      totalHours: iTotal >= 0 ? cellStr(row[iTotal]) : "",
      late: late || "On Time",
      lateIsNegative: lateStyle(late),
    });
  }

  return out;
}

export function parseAttendanceSummaryWorkbook(buffer: ArrayBuffer): ImportedAttendanceSummarySnapshot {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  let rows: ImportedAttendanceSummaryRow[] = [];

  workbook.SheetNames.forEach((name) => {
    rows = rows.concat(parseSheetRows(workbook.Sheets[name]));
  });

  let fromDate = "";
  let toDate = "";
  let month = "";

  if (rows.length) {
    const keys = rows.map((r) => r.dateKey).sort();
    fromDate = keys[0];
    toDate = keys[keys.length - 1];
    month = fromDate.slice(0, 7);
  }

  return { month, fromDate, toDate, rows };
}

export function saveImportedAttendanceSummarySnapshot(snapshot: ImportedAttendanceSummarySnapshot) {
  if (!snapshot.month || typeof window === "undefined") return;
  localStorage.setItem(`${STORAGE_PREFIX}${snapshot.month}`, JSON.stringify(snapshot));
}

export function loadImportedAttendanceSummarySnapshot(month: string): ImportedAttendanceSummarySnapshot | null {
  if (!month || typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${month}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ImportedAttendanceSummarySnapshot;
    if (!parsed?.rows?.length) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function filterImportedRows(
  snapshot: ImportedAttendanceSummarySnapshot,
  fromDate: string,
  toDate: string,
  search: string,
  department: string,
) {
  const term = search.trim().toLowerCase();
  return snapshot.rows.filter((row) => {
    if (fromDate && row.dateKey < fromDate) return false;
    if (toDate && row.dateKey > toDate) return false;
    if (department && row.departmentName !== department) return false;
    if (term) {
      const name = row.employeeName.toLowerCase();
      const pseudo = row.pseudonym.toLowerCase();
      if (!name.includes(term) && !pseudo.includes(term)) return false;
    }
    return true;
  });
}
