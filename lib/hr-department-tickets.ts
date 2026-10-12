/**
 * HR department tickets (leave / HRM issue / any ticket raised by HR staff)
 * stay in the HR Manager / Team Lead inbox — not the main Admin Ticket Inbox.
 * Other HR employees may only view their own tickets (no approve / reject).
 */

import { pool } from "@/lib/db";
import { isHrDepartment } from "@/lib/access-control/hr-access";
import {
  isManagerOrgRole,
  isTeamLeadOrgRole,
  isCeoOrgRole,
} from "@/lib/org-role";

export type HrTicketViewer = {
  employeeId: string;
  departmentName: string | null;
  orgRole: string | null;
  accessRoleSlugs: string[];
  /** True: HR Manager or HR Team Lead — may list + approve HR-dept tickets. */
  canModerateHrTickets: boolean;
  /** True: employee is in HR department. */
  isHrStaff: boolean;
};

function parseSlugs(raw: unknown, primary?: string | null): string[] {
  const out: string[] = [];
  if (primary) out.push(String(primary).trim());
  if (Array.isArray(raw)) {
    for (const s of raw) {
      const v = String(s || "").trim();
      if (v) out.push(v);
    }
  } else if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const s of parsed) {
          const v = String(s || "").trim();
          if (v) out.push(v);
        }
      }
    } catch {
      out.push(raw.trim());
    }
  }
  return [...new Set(out.map((s) => s.toLowerCase()))];
}

/** HR Manager / Team Lead (org role or access slug). */
export function isHrTicketModerator(opts: {
  departmentName?: string | null;
  orgRole?: string | null;
  accessRoleSlugs?: string[];
}): boolean {
  if (!isHrDepartment(opts.departmentName)) return false;
  if (isManagerOrgRole(opts.orgRole) || isTeamLeadOrgRole(opts.orgRole)) {
    return true;
  }
  const slugs = opts.accessRoleSlugs || [];
  return slugs.some(
    (s) =>
      s === "hr_manager" ||
      s === "team_lead_hr" ||
      s.includes("hr_manager") ||
      s.includes("team_lead_hr")
  );
}

export async function loadHrTicketViewer(
  employeeId: string | number | null | undefined
): Promise<HrTicketViewer | null> {
  const eid = String(employeeId || "").trim();
  if (!eid || !/^\d+$/.test(eid)) return null;

  try {
    const [rows] = await pool.execute(
      `SELECT e.id, e.role, e.access_role_slug, e.access_role_slugs,
              d.name AS department_name
       FROM hrm_employees e
       LEFT JOIN employee_jobs j ON e.id = j.employee_id
       LEFT JOIN departments d ON j.department_id = d.id
       WHERE e.id = ?
       LIMIT 1`,
      [Number(eid)]
    );
    const row = (
      rows as {
        id: number;
        role?: string | null;
        access_role_slug?: string | null;
        access_role_slugs?: unknown;
        department_name?: string | null;
      }[]
    )[0];
    if (!row) return null;

    const departmentName = row.department_name
      ? String(row.department_name).trim()
      : null;
    const orgRole = row.role ? String(row.role).trim() : null;
    const accessRoleSlugs = parseSlugs(row.access_role_slugs, row.access_role_slug);
    const isHrStaff = isHrDepartment(departmentName);
    const canModerateHrTickets =
      isHrTicketModerator({ departmentName, orgRole, accessRoleSlugs }) ||
      isCeoOrgRole(orgRole);

    return {
      employeeId: eid,
      departmentName,
      orgRole,
      accessRoleSlugs,
      canModerateHrTickets,
      isHrStaff,
    };
  } catch {
    return null;
  }
}

/** Cached set of employee ids whose department chip is HR. */
let hrIdCache: { at: number; ids: Set<string> } | null = null;

export async function getHrEmployeeIdSet(): Promise<Set<string>> {
  const now = Date.now();
  if (hrIdCache && now - hrIdCache.at < 60_000) return hrIdCache.ids;

  const ids = new Set<string>();
  try {
    const [rows] = await pool.execute(
      `SELECT e.id, d.name AS department_name
       FROM hrm_employees e
       LEFT JOIN employee_jobs j ON e.id = j.employee_id
       LEFT JOIN departments d ON j.department_id = d.id`
    );
    for (const r of rows as { id: number; department_name?: string | null }[]) {
      if (isHrDepartment(r.department_name)) ids.add(String(r.id));
    }
  } catch {
    /* empty */
  }
  hrIdCache = { at: now, ids };
  return ids;
}

export function isHrDepartmentSubmitter(
  employeeId: string | number | null | undefined,
  hrIds: Set<string>
): boolean {
  const id = String(employeeId || "").trim();
  return Boolean(id && hrIds.has(id));
}

/**
 * Filter tickets for list APIs.
 * - inbox=admin (default): hide tickets raised by HR staff
 * - inbox=hr: only HR-staff tickets; viewer must be HR Manager/TL
 * - employeeId own list: always allow owner's tickets
 */
export function filterTicketsForInbox<T extends { employee_id?: string | number }>(
  tickets: T[],
  opts: {
    inbox: "admin" | "hr" | "own";
    viewer: HrTicketViewer | null;
    hrIds: Set<string>;
  }
): T[] {
  const { inbox, viewer, hrIds } = opts;

  if (inbox === "own") {
    if (!viewer) return [];
    return tickets.filter((t) => String(t.employee_id) === viewer.employeeId);
  }

  if (inbox === "hr") {
    if (!viewer?.canModerateHrTickets) return [];
    return tickets.filter((t) => isHrDepartmentSubmitter(t.employee_id, hrIds));
  }

  // admin inbox — never show HR-department tickets
  return tickets.filter((t) => !isHrDepartmentSubmitter(t.employee_id, hrIds));
}

/** May change status (approve/reject/resolve) on this ticket? */
export function canModerateTicketStatus(opts: {
  ticketEmployeeId: string | number;
  viewer: HrTicketViewer | null;
  hrIds: Set<string>;
}): boolean {
  const { ticketEmployeeId, viewer, hrIds } = opts;
  const hrTicket = isHrDepartmentSubmitter(ticketEmployeeId, hrIds);

  // HR department tickets → only HR Manager / Team Lead (or CEO).
  if (hrTicket) {
    if (!viewer) return false;
    if (isCeoOrgRole(viewer.orgRole)) return true;
    return viewer.canModerateHrTickets;
  }

  // Non-HR tickets → Admin Ticket Inbox (viewer optional for classic admin page).
  if (!viewer) return true;
  if (isCeoOrgRole(viewer.orgRole)) return true;
  // HR officers cannot approve from the employee portal.
  if (viewer.isHrStaff && !viewer.canModerateHrTickets) return false;
  return true;
}
