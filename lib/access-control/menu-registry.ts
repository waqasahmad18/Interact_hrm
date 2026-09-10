/** Permission key → sidebar / quick-link entries for employee (and shared) portal. */

export type AccessMenuItem = {
  permission: string;
  /** Optional global feature key that must be ON (hrm_global_features). */
  featureGate?: string;
  name: string;
  path: string;
  group?: "core" | "attendance" | "leave" | "payroll" | "team" | "system";
};

export const ACCESS_MENU_REGISTRY: AccessMenuItem[] = [
  {
    permission: "team.dashboard.view",
    name: "My Team",
    path: "/employee-dashboard/my-team",
    group: "team",
  },
  {
    permission: "team.attendance.view",
    name: "My Team",
    path: "/employee-dashboard/my-team",
    group: "team",
  },
  {
    permission: "leave.apply.self",
    name: "Leave",
    path: "/employee-dashboard/leave",
    group: "leave",
  },
  {
    permission: "leave.list.view",
    name: "Leave Inbox",
    path: "/leave",
    group: "leave",
  },
  {
    permission: "leave.approve.manager",
    name: "Manage Leaves",
    path: "/admin/manage-leaves",
    group: "leave",
  },
  {
    permission: "leave.approve.hr",
    name: "Manage Leaves",
    path: "/admin/manage-leaves",
    group: "leave",
  },
  {
    permission: "attendance.summary.view",
    name: "Attendance Summary",
    path: "/summaries",
    group: "attendance",
  },
  {
    permission: "attendance.monthly.view",
    name: "Monthly Attendance",
    path: "/admin/monthly-attendance",
    group: "attendance",
  },
  {
    permission: "attendance.manage.edit",
    name: "Manage Attendance",
    path: "/admin/manage-attendance",
    group: "attendance",
  },
  {
    permission: "attendance.breaks.manage",
    name: "Manage Breaks",
    path: "/admin/manage-breaks",
    group: "attendance",
  },
  {
    permission: "payroll.monthly.view",
    name: "Monthly Payroll",
    path: "/admin/monthly-payroll",
    group: "payroll",
  },
  {
    permission: "payroll.commissions",
    name: "Commissions",
    path: "/admin/commissions",
    group: "payroll",
  },
  {
    permission: "payroll.advance",
    name: "Advance",
    path: "/admin/advance",
    group: "payroll",
  },
  {
    permission: "payroll.loan",
    name: "Loan",
    path: "/admin/loan",
    group: "payroll",
  },
  {
    permission: "system.control.access",
    name: "System Control",
    path: "/admin/system-control",
    group: "system",
  },
];

export function buildMenuFromPermissions(
  permissions: string[],
  enabledFeatures: Record<string, boolean>,
): { name: string; path: string; group?: string }[] {
  const permSet = new Set(permissions);
  const seen = new Set<string>();
  const out: { name: string; path: string; group?: string }[] = [];

  for (const item of ACCESS_MENU_REGISTRY) {
    if (!permSet.has(item.permission)) continue;
    if (item.featureGate && enabledFeatures[item.featureGate] === false) continue;
    const key = `${item.path}::${item.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name: item.name, path: item.path, group: item.group });
  }
  return out;
}
