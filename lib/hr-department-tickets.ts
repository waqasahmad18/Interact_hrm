/**
 * HR department tickets stay in the HR ticket inbox — not the main Admin Ticket Inbox.
 *
 * - All HR employees may VIEW the HR inbox.
 * - HR Manager / HR Team Lead may approve / reject HR-dept tickets.
 * - Any department Team Lead / Manager may approve leave tickets (not their own).
 * - HR officers (non-manager, non-TL) are view-only.
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
  /** True: any HR staff (or CEO) — may open HR ticket inbox (view). */
  canViewHrInbox: boolean;
  /** True: HR Manager / HR Team Lead (or CEO) — may approve HR-dept tickets. */
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

/** HR Manager or HR Team Lead (org role or access slug). */
export function isHrTicketModerator(opts: {
  departmentName?: string | null;
  orgRole?: string | null;
  accessRoleSlugs?: string[];
}): boolean {
  if (isCeoOrgRole(opts.orgRole)) return true;
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
    const canViewHrInbox = isHrStaff || isCeoOrgRole(orgRole);
    const canModerateHrTickets = isHrTicketModerator({
      departmentName,
      orgRole,
      accessRoleSlugs,
    });

    return {
      employeeId: eid,
      departmentName,
      orgRole,
      accessRoleSlugs,
      canViewHrInbox,
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
 * - inbox=hr: HR-staff tickets; any HR employee may view
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
    if (!viewer?.canViewHrInbox) return [];
    return tickets.filter((t) => isHrDepartmentSubmitter(t.employee_id, hrIds));
  }

  // admin inbox — never show HR-department tickets
  return tickets.filter((t) => !isHrDepartmentSubmitter(t.employee_id, hrIds));
}

function isLeaveApproverRole(orgRole: string | null | undefined): boolean {
  return (
    isCeoOrgRole(orgRole) ||
    isManagerOrgRole(orgRole) ||
    isTeamLeadOrgRole(orgRole)
  );
}

/**
 * May change status (approve/reject/resolve) on this ticket?
 * - Leave: Manager or Team Lead (any dept), not own ticket.
 * - Other HR tickets: HR Manager / HR Team Lead.
 * - HR officers: view only.
 */
export function canModerateTicketStatus(opts: {
  ticketEmployeeId: string | number;
  viewer: HrTicketViewer | null;
  hrIds: Set<string>;
  ticketType?: string | null;
}): boolean {
  const { ticketEmployeeId, viewer, hrIds, ticketType } = opts;

  // Never self-approve / self-reject.
  if (viewer && String(ticketEmployeeId) === viewer.employeeId) {
    return false;
  }

  const isLeave = String(ticketType || "").toLowerCase() === "leave";

  // HR officers (not Manager / Team Lead / CEO) — view only.
  if (
    viewer?.isHrStaff &&
    !isManagerOrgRole(viewer.orgRole) &&
    !isTeamLeadOrgRole(viewer.orgRole) &&
    !isCeoOrgRole(viewer.orgRole)
  ) {
    return false;
  }

  // Leave tickets — Manager or Team Lead (any department).
  if (isLeave) {
    if (!viewer) return true; // classic admin inbox
    return isLeaveApproverRole(viewer.orgRole);
  }

  const hrTicket = isHrDepartmentSubmitter(ticketEmployeeId, hrIds);

  // Non-leave HR department tickets → HR Manager / HR Team Lead / CEO.
  if (hrTicket) {
    if (!viewer) return false;
    return viewer.canModerateHrTickets;
  }

  // Non-HR non-leave → admin inbox or Manager / CEO.
  if (!viewer) return true;
  if (isCeoOrgRole(viewer.orgRole) || isManagerOrgRole(viewer.orgRole)) {
    return true;
  }
  return false;
}
