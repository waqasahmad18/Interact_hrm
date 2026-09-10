import type { ReactNode } from "react";

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

/** Paths this permission set may open (admin or employee). */
export function allowedPathsFromPermissions(permissions: string[]): Set<string> {
  const permSet = new Set(permissions);
  const paths = new Set<string>();
  for (const item of ACCESS_MENU_REGISTRY) {
    if (permSet.has(item.permission)) paths.add(item.path);
  }
  paths.add("/employee-dashboard");
  paths.add("/employee-dashboard/my-info");
  paths.add("/employee-dashboard/generate-ticket");
  return paths;
}

export function isPathAllowed(pathname: string, allowed: Set<string>): boolean {
  if (!pathname) return false;
  if (allowed.has(pathname)) return true;
  for (const p of allowed) {
    if (pathname === p || pathname.startsWith(`${p}/`)) return true;
  }
  return false;
}

type SidebarSubLink = { name: string; path: string; icon?: ReactNode };
type SidebarLink = {
  name: string;
  path?: string;
  icon?: ReactNode;
  dropdown?: SidebarSubLink[];
};
type SidebarGroup = { group: string; links: SidebarLink[] };

/** Keep only links whose path is permitted; drop empty dropdowns/groups. */
export function filterAdminSidebarByPaths(
  groups: SidebarGroup[],
  allowed: Set<string>,
): SidebarGroup[] {
  const out: SidebarGroup[] = [];
  for (const g of groups) {
    const links: SidebarLink[] = [];
    for (const link of g.links) {
      if (link.dropdown?.length) {
        const dropdown = link.dropdown.filter((d) => allowed.has(d.path));
        if (dropdown.length) links.push({ ...link, dropdown });
        continue;
      }
      if (link.path && allowed.has(link.path)) links.push(link);
    }
    if (links.length) out.push({ group: g.group, links });
  }
  return out;
}
