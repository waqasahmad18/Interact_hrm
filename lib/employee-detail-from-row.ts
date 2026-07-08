import type { EmployeeDetailPayload } from "@/app/components/EmployeeDetailPopup";
import { lookupEmployeeDirectory } from "@/lib/employee-directory-client-cache";

export type EmployeeRowLike = {
  employee_id?: string | number | null;
  employeeId?: string | number | null;
  id?: string | number | null;
  employee_name?: string | null;
  employeeName?: string | null;
  full_name?: string | null;
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
  pseudonym?: string | null;
  department_name?: string | null;
  department?: string | null;
  email?: string | null;
  email_work?: string | null;
  email_other?: string | null;
  phone?: string | null;
  phone_mobile?: string | null;
  contact_number?: string | null;
  shift_name?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  shift_start_time?: string | null;
  shift_end_time?: string | null;
};

export function resolveEmployeeName(row: EmployeeRowLike): string {
  if (row.employee_name?.trim()) return row.employee_name.trim();
  if (row.employeeName?.trim()) return row.employeeName.trim();
  if (row.full_name?.trim()) return row.full_name.trim();
  const parts = [row.first_name, row.middle_name, row.last_name].filter(Boolean);
  return parts.join(" ").trim();
}

export function resolveEmployeeId(row: EmployeeRowLike): string | number {
  return row.employee_id ?? row.employeeId ?? row.id ?? "";
}

function pickEmail(row: EmployeeRowLike) {
  const fromRow = (row.email || row.email_work || row.email_other || "").trim();
  return fromRow || null;
}

function pickPhone(row: EmployeeRowLike) {
  const fromRow = (row.phone_mobile || row.phone || row.contact_number || "")
    .toString()
    .trim();
  return fromRow || null;
}

function pickShiftStart(row: EmployeeRowLike) {
  return row.start_time ?? row.shift_start_time ?? null;
}

function pickShiftEnd(row: EmployeeRowLike) {
  return row.end_time ?? row.shift_end_time ?? null;
}

export async function buildEmployeeDetailPayload(
  row: EmployeeRowLike,
  getPhoto: (id: string | number | null | undefined) => string | null
): Promise<EmployeeDetailPayload> {
  const employeeId = resolveEmployeeId(row);
  const name = resolveEmployeeName(row);
  const directory = await lookupEmployeeDirectory(employeeId, name);
  const resolvedId = directory?.id || employeeId;

  return {
    employeeId: resolvedId,
    name: name || directory?.name || "",
    pseudonym: row.pseudonym?.trim() || directory?.pseudonym || null,
    department: row.department_name?.trim() || row.department?.trim() || directory?.department || null,
    email: pickEmail(row) || directory?.email || null,
    phone: pickPhone(row) || directory?.phone || null,
    photo: getPhoto(resolvedId),
    shiftName: null,
    shiftStart: pickShiftStart(row) || directory?.shiftStart || null,
    shiftEnd: pickShiftEnd(row) || directory?.shiftEnd || null,
  };
}
