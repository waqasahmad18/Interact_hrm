/**
 * HR department access defaults + salary privacy helpers.
 * Protocol applies only when the viewer's department chip is HR.
 */

import { orgDeptChipLabel } from "@/app/admin/roles-permissions/system-control-data";
import { isCeoOrgRole, isManagerOrgRole, normalizeOrgRole, ORG_ROLE_DB } from "@/lib/org-role";

/** Tabs / ops every HR employee gets automatically (no System Control). */
export const HR_DEPARTMENT_DEFAULT_PERMISSIONS: string[] = [
  "attendance.summary.view",
  "attendance.breaks.manage",
  "attendance.monthly.view",
  "attendance.manage.edit",
  "department.attendance.view",
  "department.breaks.view",
  "department.leaves.view",
  "department.monthly.view",
  "leave.list.view",
  "leave.approval_status.view",
  "leave.monthly_summary.view",
  "payroll.monthly.view",
  "payroll.advance",
  "payroll.loan",
  "people.employee_list.view",
  "ops.tickets.view",
  "portal.tickets.create",
  "portal.my_info.view",
];

/** Managers only — features / roles update in System Control. */
export const MANAGER_SYSTEM_CONTROL_PERMISSIONS: string[] = [
  "system.control.access",
  "system.permissions.edit",
  "system.users.assign",
  "system.org_chart.edit",
  "system.features.edit",
];

/** Manager toggle in Permissions: see salaries of own department (at/below own level). */
export const DEPT_SALARY_VIEW_PERMISSION = "department.salary.view";

const ROLE_RANK: Record<string, number> = {
  [ORG_ROLE_DB.CEO]: 1,
  [ORG_ROLE_DB.MANAGER]: 2,
  HOD: 2,
  [ORG_ROLE_DB.TEAM_LEAD]: 3,
  [ORG_ROLE_DB.OFFICER]: 4,
};

export function isHrDepartment(departmentName: string | null | undefined): boolean {
  return orgDeptChipLabel(departmentName) === "HR";
}

function roleRank(role: unknown): number {
  const n = normalizeOrgRole(role);
  return ROLE_RANK[n] ?? 99;
}

/** Target is higher in org than viewer (e.g. Manager above Officer). */
export function isOrgSeniorOf(targetRole: unknown, viewerRole: unknown): boolean {
  return roleRank(targetRole) < roleRank(viewerRole);
}

export function mergeHrAccessPermissions(opts: {
  permissions: string[];
  departmentName: string | null | undefined;
  orgRole: string | null | undefined;
}): string[] {
  const set = new Set(opts.permissions.filter(Boolean));
  const hr = isHrDepartment(opts.departmentName);
  const manager = isManagerOrgRole(opts.orgRole);

  if (hr) {
    for (const k of HR_DEPARTMENT_DEFAULT_PERMISSIONS) set.add(k);
  }

  if (manager) {
    for (const k of MANAGER_SYSTEM_CONTROL_PERMISSIONS) set.add(k);
  } else {
    for (const k of [...set]) {
      if (k.startsWith("system.")) set.delete(k);
    }
  }

  return [...set];
}

export type SalaryVisibilityInput = {
  viewerId: string;
  targetId: string;
  viewerPermissions: string[];
  viewerOrgRole: string | null | undefined;
  targetOrgRole: string | null | undefined;
  viewerDepartmentName: string | null | undefined;
  targetDepartmentName: string | null | undefined;
};

/**
 * Who may see another employee's salary amount / bank fields.
 *
 * - Own salary: always
 * - CEO: always
 * - HR protocol: may see OTHER departments (payroll work); within HR hide
 *   colleagues / seniors / juniors unless `department.salary.view` is on,
 *   and never show someone ranked above you
 * - Non-HR: same-dept only with `department.salary.view`, never seniors
 */
export function canViewEmployeeSalary(input: SalaryVisibilityInput): boolean {
  const viewerId = String(input.viewerId || "").trim();
  const targetId = String(input.targetId || "").trim();
  if (!viewerId || !targetId) return false;
  if (viewerId === targetId) return true;
  if (isCeoOrgRole(input.viewerOrgRole)) return true;

  const perms = new Set(input.viewerPermissions);
  const hasDeptSalary = perms.has(DEPT_SALARY_VIEW_PERMISSION);
  const viewerHr = isHrDepartment(input.viewerDepartmentName);
  const targetHr = isHrDepartment(input.targetDepartmentName);
  const senior = isOrgSeniorOf(input.targetOrgRole, input.viewerOrgRole);

  // Never show someone above you in the hierarchy
  if (senior) return false;

  if (viewerHr) {
    // Other departments → payroll work (need payroll view)
    if (!targetHr) {
      return perms.has("payroll.monthly.view") || perms.has("payroll.monthly.edit");
    }
    // Same HR department → only if manager enabled dept salary view
    return hasDeptSalary;
  }

  // Non-HR managers: own department only when toggle is on
  if (!hasDeptSalary) return false;
  const vChip = orgDeptChipLabel(input.viewerDepartmentName);
  const tChip = orgDeptChipLabel(input.targetDepartmentName);
  if (!vChip || !tChip) return false;
  return vChip.toLowerCase() === tChip.toLowerCase();
}

export function redactSalaryRow<T extends Record<string, unknown>>(row: T): T {
  const out = { ...row };
  for (const k of [
    "amount",
    "basic_salary",
    "basicSalary",
    "account_number",
    "accountNumber",
    "routing_number",
    "routingNumber",
    "deposit_amount",
    "depositAmount",
    "pay_grade",
    "payGrade",
  ]) {
    if (k in out) (out as Record<string, unknown>)[k] = null;
  }
  (out as Record<string, unknown>).salary_hidden = true;
  return out;
}
