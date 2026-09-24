import type { ReactNode } from "react";

/** Permission key → links shown inside the employee dashboard shell (never admin chrome). */

export type AccessMenuItem = {
  permission: string;
  featureGate?: string;
  name: string;
  path: string;
  group?: "core" | "attendance" | "leave" | "payroll" | "team" | "system" | "ops";
};

/**
 * All privileged links stay under `/employee-dashboard/*` so the employee
 * sidebar/chrome never switches to the admin layout.
 *
 * Tab titles match the admin HR dashboard (no "Dept" / "Team" prefixes on
 * attendance / breaks / leaves — HR needs company-wide views under the same names).
 */
export const ACCESS_MENU_REGISTRY: AccessMenuItem[] = [
  {
    permission: "team.dashboard.view",
    name: "My Team",
    path: "/employee-dashboard/my-team",
    group: "team",
  },
  // Attendance / breaks / leaves — same labels as admin Attendance dropdown
  {
    permission: "attendance.summary.view",
    name: "Attendance Summary",
    path: "/employee-dashboard/summaries",
    group: "attendance",
  },
  {
    permission: "department.attendance.view",
    name: "Attendance Summary",
    path: "/employee-dashboard/summaries",
    group: "attendance",
  },
  {
    permission: "team.attendance.view",
    name: "Attendance Summary",
    path: "/employee-dashboard/summaries",
    group: "attendance",
  },
  {
    permission: "attendance.summary.view",
    name: "Break Summary",
    path: "/employee-dashboard/summaries?view=break",
    group: "attendance",
  },
  {
    permission: "department.breaks.view",
    name: "Break Summary",
    path: "/employee-dashboard/summaries?view=break",
    group: "attendance",
  },
  {
    permission: "team.breaks.view",
    name: "Break Summary",
    path: "/employee-dashboard/summaries?view=break",
    group: "attendance",
  },
  {
    permission: "attendance.summary.view",
    name: "Prayer Break Summary",
    path: "/employee-dashboard/summaries?view=prayer",
    group: "attendance",
  },
  {
    permission: "department.breaks.view",
    name: "Prayer Break Summary",
    path: "/employee-dashboard/summaries?view=prayer",
    group: "attendance",
  },
  {
    permission: "team.breaks.view",
    name: "Prayer Break Summary",
    path: "/employee-dashboard/summaries?view=prayer",
    group: "attendance",
  },
  {
    permission: "attendance.manage.edit",
    name: "Manage Attendance",
    path: "/employee-dashboard/manage-attendance",
    group: "attendance",
  },
  {
    permission: "attendance.breaks.manage",
    name: "Manage Breaks",
    path: "/employee-dashboard/manage-breaks",
    group: "attendance",
  },
  {
    permission: "attendance.monthly.view",
    name: "Monthly Attendance",
    path: "/employee-dashboard/monthly-attendance",
    group: "attendance",
  },
  {
    permission: "department.monthly.view",
    name: "Monthly Attendance",
    path: "/employee-dashboard/monthly-attendance",
    group: "attendance",
  },
  {
    permission: "leave.apply.self",
    name: "Leave",
    path: "/employee-dashboard/leave",
    group: "leave",
  },
  {
    permission: "leave.list.view",
    name: "Leaves",
    path: "/employee-dashboard/leave-inbox",
    group: "leave",
  },
  {
    permission: "department.leaves.view",
    name: "Leaves",
    path: "/employee-dashboard/leave-inbox",
    group: "leave",
  },
  {
    permission: "team.leaves.view",
    name: "Leaves",
    path: "/employee-dashboard/leave-inbox",
    group: "leave",
  },
  {
    permission: "leave.approval_status.view",
    name: "Leaves",
    path: "/employee-dashboard/leave-inbox",
    group: "leave",
  },
  {
    permission: "leave.approve.manager",
    name: "Leaves",
    path: "/employee-dashboard/leave-inbox",
    group: "leave",
  },
  {
    permission: "payroll.monthly.view",
    name: "Monthly Payroll",
    path: "/employee-dashboard/monthly-payroll",
    group: "payroll",
  },
  {
    permission: "payroll.commissions",
    name: "Commissions",
    path: "/employee-dashboard/commissions",
    group: "payroll",
  },
  {
    permission: "payroll.advance",
    name: "Advance",
    path: "/employee-dashboard/advance",
    group: "payroll",
  },
  {
    permission: "payroll.loan",
    name: "Loan",
    path: "/employee-dashboard/loan",
    group: "payroll",
  },
  {
    permission: "ops.tickets.view",
    featureGate: "tickets",
    name: "Ticket Inbox",
    path: "/employee-dashboard/tickets",
    group: "ops",
  },
  {
    permission: "portal.tickets.create",
    featureGate: "tickets",
    name: "Generate Ticket",
    path: "/employee-dashboard/generate-ticket",
    group: "core",
  },
  {
    permission: "portal.my_info.view",
    name: "My Info",
    path: "/employee-dashboard/my-info",
    group: "core",
  },
  {
    permission: "portal.time.view",
    name: "Time",
    path: "/employee-dashboard/time",
    group: "attendance",
  },
  {
    permission: "system.control.access",
    name: "System Control",
    path: "/employee-dashboard/system-control",
    group: "system",
  },
];

/** Old admin URLs → employee-shell equivalents (for bookmarks / stale links). */
export const ADMIN_PATH_TO_EMPLOYEE: Record<string, string> = {
  "/leave": "/employee-dashboard/leave-inbox",
  "/summaries": "/employee-dashboard/summaries",
  "/admin/manage-leaves": "/employee-dashboard/manage-leaves",
  "/admin/monthly-attendance": "/employee-dashboard/monthly-attendance",
  "/admin/manage-attendance": "/employee-dashboard/manage-attendance",
  "/admin/manage-breaks": "/employee-dashboard/manage-breaks",
  "/admin/monthly-payroll": "/employee-dashboard/monthly-payroll",
  "/admin/commissions": "/employee-dashboard/commissions",
  "/admin/advance": "/employee-dashboard/advance",
  "/admin/loan": "/employee-dashboard/loan",
  "/admin/system-control": "/employee-dashboard/system-control",
  "/admin/tickets": "/employee-dashboard/tickets",
};

export function buildMenuFromPermissions(
  permissions: string[],
  enabledFeatures: Record<string, boolean>,
): { name: string; path: string; group?: string }[] {
  const permSet = new Set(permissions);
  const seenPath = new Set<string>();
  const out: { name: string; path: string; group?: string }[] = [];

  for (const item of ACCESS_MENU_REGISTRY) {
    if (!permSet.has(item.permission)) continue;
    if (item.featureGate && enabledFeatures[item.featureGate] === false) continue;
    // One tab per path — admin-style names, no Dept/Team duplicates
    if (seenPath.has(item.path)) continue;
    seenPath.add(item.path);
    out.push({ name: item.name, path: item.path, group: item.group });
  }
  return out;
}

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
    const base = p.split("?")[0];
    if (pathname === p || pathname === base || pathname.startsWith(`${base}/`)) return true;
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
