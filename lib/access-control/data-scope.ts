import { pool } from "@/lib/db";
import { orgDeptChipLabel } from "@/app/admin/roles-permissions/system-control-data";
import {
  loadEmployeePermissionOverrides,
  loadPermissionsForRole,
  resolveEmployeeAccessRoleSlug,
} from "@/lib/access-control/store";
import {
  getEmployeeHierarchy,
  TEAM_MEMBERS_TABLE,
} from "@/lib/employee-hierarchy-table";

export type ViewerDataScope = {
  mode: "all" | "department" | "team" | "self";
  /** Canonical org chip e.g. IT (Marketing folds into IT). */
  orgChip: string | null;
  /** Allowed raw department names from DB (e.g. IT, Marketing). */
  departmentNames: string[];
  /** Employee ids in scope (string). Always includes self when scoped. */
  employeeIds: string[];
};

type EmpDeptRow = {
  id: number;
  department_id: number | null;
  department_name: string | null;
};

function normName(s: string | null | undefined): string {
  return String(s || "").trim().toLowerCase();
}

/** Same org family? Marketing ↔ IT via orgDeptChipLabel. */
export function sameOrgDeptFamily(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const ca = orgDeptChipLabel(a);
  const cb = orgDeptChipLabel(b);
  if (!ca || !cb) return normName(a) === normName(b) && Boolean(normName(a));
  return ca.toLowerCase() === cb.toLowerCase();
}

async function loadEmployeesWithDept(): Promise<EmpDeptRow[]> {
  const [rows] = await pool.execute(`
    SELECT
      e.id,
      j.department_id,
      d.name AS department_name
    FROM hrm_employees e
    LEFT JOIN employee_jobs j ON e.id = j.employee_id
    LEFT JOIN departments d ON j.department_id = d.id
    WHERE e.status IS NULL OR e.status IN ('enabled', 'active', 'Enabled', 'Active')
  `);
  return rows as EmpDeptRow[];
}

function collectDeptNamesForChip(
  all: EmpDeptRow[],
  chip: string | null,
  fallbackName: string | null,
): string[] {
  if (!chip) {
    return fallbackName ? [fallbackName] : [];
  }
  const names = new Set<string>();
  for (const e of all) {
    const label = orgDeptChipLabel(e.department_name);
    if (label && label.toLowerCase() === chip.toLowerCase() && e.department_name) {
      names.add(String(e.department_name).trim());
    }
  }
  if (fallbackName) names.add(fallbackName);
  if (chip.toLowerCase() === "it") {
    for (const e of all) {
      const raw = normName(e.department_name);
      if ((raw === "marketing" || raw.includes("marketing")) && e.department_name) {
        names.add(String(e.department_name).trim());
      }
    }
  }
  return [...names];
}

function inOrgFamily(
  e: EmpDeptRow,
  orgChip: string | null,
  self: EmpDeptRow | undefined,
): boolean {
  if (orgChip) {
    const label = orgDeptChipLabel(e.department_name);
    if (label && label.toLowerCase() === orgChip.toLowerCase()) return true;
    if (orgChip.toLowerCase() === "it") {
      const raw = normName(e.department_name);
      if (raw === "marketing" || raw.includes("marketing")) return true;
    }
    return false;
  }
  return (
    self?.department_id != null &&
    e.department_id != null &&
    Number(e.department_id) === Number(self.department_id)
  );
}

async function loadViewerPermissionKeys(eid: string): Promise<string[]> {
  const emp = await resolveEmployeeAccessRoleSlug(eid);
  const override = await loadEmployeePermissionOverrides(emp.employeeId);
  if (override != null) {
    return override.filter((k) => k !== "__custom__");
  }
  const sets = await Promise.all(emp.roleSlugs.map((slug) => loadPermissionsForRole(slug)));
  return [...new Set(sets.flat())];
}

/**
 * Resolve which employees / departments a viewer may see for team|department scoped pages.
 * - department.* → entire org-dept family (IT includes Marketing)
 * - team.* → same family (My Team = department roster) + explicit team members
 * - otherwise → all (admin / unscoped)
 */
export async function resolveViewerDataScope(
  viewerEmployeeId: string | number,
): Promise<ViewerDataScope> {
  const eid = String(viewerEmployeeId || "").trim();
  if (!eid || !/^\d+$/.test(eid)) {
    return { mode: "all", orgChip: null, departmentNames: [], employeeIds: [] };
  }

  const perms = new Set(await loadViewerPermissionKeys(eid));

  const hasDept =
    perms.has("department.attendance.view") ||
    perms.has("department.breaks.view") ||
    perms.has("department.leaves.view") ||
    perms.has("department.monthly.view");
  const hasTeam =
    perms.has("team.dashboard.view") ||
    perms.has("team.attendance.view") ||
    perms.has("team.breaks.view") ||
    perms.has("team.leaves.view") ||
    perms.has("team.management.assign");

  if (!hasTeam && !hasDept) {
    return { mode: "all", orgChip: null, departmentNames: [], employeeIds: [] };
  }

  const all = await loadEmployeesWithDept();
  const self = all.find((e) => String(e.id) === eid);
  const selfDeptName = self?.department_name ? String(self.department_name).trim() : null;
  const orgChip = orgDeptChipLabel(selfDeptName);

  const departmentNames = collectDeptNamesForChip(all, orgChip, selfDeptName);
  const idSet = new Set<string>();
  idSet.add(eid);
  for (const e of all) {
    if (inOrgFamily(e, orgChip, self)) idSet.add(String(e.id));
  }

  try {
    const hier = await getEmployeeHierarchy(eid);
    for (const m of hier?.teamMembers || []) {
      if (m?.id) idSet.add(String(m.id));
    }
  } catch {
    /* ignore */
  }

  // Explicit team table (in case hierarchy path missed)
  try {
    const [rows] = await pool.execute(
      `SELECT member_employee_id FROM ${TEAM_MEMBERS_TABLE} WHERE team_lead_employee_id = ?`,
      [Number(eid)],
    );
    for (const r of rows as { member_employee_id: number }[]) {
      idSet.add(String(r.member_employee_id));
    }
  } catch {
    /* table may not exist yet */
  }

  return {
    mode: hasDept ? "department" : "team",
    orgChip,
    departmentNames,
    employeeIds: [...idSet],
  };
}

export function rowInViewerScope(
  scope: ViewerDataScope,
  opts: {
    employeeId?: string | number | null;
    departmentName?: string | null;
  },
): boolean {
  if (scope.mode === "all") return true;
  const id = opts.employeeId != null ? String(opts.employeeId).trim() : "";
  if (id && scope.employeeIds.includes(id)) return true;
  const dept = opts.departmentName != null ? String(opts.departmentName).trim() : "";
  if (dept && scope.departmentNames.some((d) => normName(d) === normName(dept))) {
    return true;
  }
  if (
    dept &&
    scope.orgChip &&
    orgDeptChipLabel(dept)?.toLowerCase() === scope.orgChip.toLowerCase()
  ) {
    return true;
  }
  return false;
}
