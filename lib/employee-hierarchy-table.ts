import { pool } from "@/lib/db";
import { getAllOrgChartPhotos } from "@/lib/org-chart-photos-table";

export const HIERARCHY_TABLE = "hrm_employee_hierarchy";
export const TEAM_MEMBERS_TABLE = "hrm_team_members";

export type HierarchyPerson = {
  id: string;
  name: string;
  initials: string;
  role: string;
  jobTitle: string | null;
  departmentName: string | null;
  pseudonym: string | null;
  photo: string | null;
  status: string | null;
};

export type EmployeeHierarchyResult = {
  employeeId: string;
  role: string;
  departmentName: string | null;
  jobTitle: string | null;
  reportsTo: HierarchyPerson | null;
  teamMembers: HierarchyPerson[];
  isTeamLead: boolean;
};

type EmpRow = {
  id: number;
  first_name: string | null;
  last_name: string | null;
  pseudonym: string | null;
  role: string | null;
  status: string | null;
  department_id: number | null;
  department_name: string | null;
  job_title: string | null;
};

const ROLE_RANK: Record<string, number> = {
  "BOD/CEO": 1,
  Management: 2,
  HOD: 3,
  Leader: 4,
  Officer: 5,
};

function roleRank(role: string | null | undefined): number {
  if (!role) return 99;
  return ROLE_RANK[role] ?? 99;
}

function fullName(row: Pick<EmpRow, "first_name" | "last_name">): string {
  return `${row.first_name || ""} ${row.last_name || ""}`.trim() || "Employee";
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "E";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

async function ensureHierarchyTables(conn: Awaited<ReturnType<typeof pool.getConnection>>) {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS ${HIERARCHY_TABLE} (
      employee_id INT UNSIGNED NOT NULL PRIMARY KEY,
      reports_to_employee_id INT UNSIGNED NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_reports_to (reports_to_employee_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS ${TEAM_MEMBERS_TABLE} (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      team_lead_employee_id INT UNSIGNED NOT NULL,
      member_employee_id INT UNSIGNED NOT NULL,
      assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_member (member_employee_id),
      KEY idx_team_lead (team_lead_employee_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function fetchEmployees(conn: Awaited<ReturnType<typeof pool.getConnection>>): Promise<EmpRow[]> {
  const [rows] = await conn.execute(`
    SELECT
      e.id,
      e.first_name,
      e.last_name,
      e.pseudonym,
      e.role,
      e.status,
      j.department_id,
      d.name AS department_name,
      j.job_title
    FROM hrm_employees e
    LEFT JOIN employee_jobs j ON e.id = j.employee_id
    LEFT JOIN departments d ON j.department_id = d.id
    WHERE e.status IS NULL OR e.status IN ('enabled', 'active', 'Enabled', 'Active')
    ORDER BY e.id ASC
  `);
  return rows as EmpRow[];
}

async function fetchExplicitReportsTo(
  conn: Awaited<ReturnType<typeof pool.getConnection>>,
  employeeId: number,
): Promise<number | null> {
  try {
    const [rows] = await conn.execute(
      `SELECT reports_to_employee_id FROM ${HIERARCHY_TABLE} WHERE employee_id = ? LIMIT 1`,
      [employeeId],
    );
    const row = (rows as { reports_to_employee_id: number | null }[])[0];
    return row?.reports_to_employee_id ?? null;
  } catch {
    return null;
  }
}

async function fetchTeamMemberIds(
  conn: Awaited<ReturnType<typeof pool.getConnection>>,
  teamLeadId: number,
): Promise<number[]> {
  try {
    const [rows] = await conn.execute(
      `SELECT member_employee_id FROM ${TEAM_MEMBERS_TABLE} WHERE team_lead_employee_id = ?`,
      [teamLeadId],
    );
    return (rows as { member_employee_id: number }[]).map((r) => r.member_employee_id);
  } catch {
    return [];
  }
}

function inferReportsTo(emp: EmpRow, deptEmployees: EmpRow[]): EmpRow | null {
  const rank = roleRank(emp.role);
  if (rank <= 1) return null;

  const higher = deptEmployees.filter(
    (e) => e.id !== emp.id && roleRank(e.role) < rank,
  );
  if (higher.length === 0) {
    return null;
  }

  if (rank >= 5) {
    const lead = higher.find((e) => e.role === "Leader");
    if (lead) return lead;
  }
  if (rank >= 4) {
    const hod = higher.find((e) => e.role === "HOD");
    if (hod) return hod;
  }
  if (rank >= 3) {
    const mgmt = higher.find((e) => e.role === "Management");
    if (mgmt) return mgmt;
  }

  return [...higher].sort((a, b) => roleRank(a.role) - roleRank(b.role))[0] ?? null;
}

function inferTeamMembers(emp: EmpRow, deptEmployees: EmpRow[]): EmpRow[] {
  const rank = roleRank(emp.role);
  if (rank > 4) return [];

  return deptEmployees.filter((e) => {
    if (e.id === emp.id) return false;
    const manager = inferReportsTo(e, deptEmployees);
    return manager?.id === emp.id;
  });
}

function resolvePhoto(
  employeeId: string,
  employeePhotos: Record<string, string>,
  shellAvatars: Record<string, string>,
): string | null {
  return (
    employeePhotos[employeeId] ??
    shellAvatars[employeeId] ??
    null
  );
}

function toPerson(
  row: EmpRow,
  employeePhotos: Record<string, string>,
  shellAvatars: Record<string, string>,
): HierarchyPerson {
  const name = fullName(row);
  const id = String(row.id);
  return {
    id,
    name,
    initials: initials(name),
    role: row.role || "Officer",
    jobTitle: row.job_title,
    departmentName: row.department_name,
    pseudonym: row.pseudonym,
    photo: resolvePhoto(id, employeePhotos, shellAvatars),
    status: row.status,
  };
}

export async function getEmployeeHierarchy(
  employeeId: string | number,
): Promise<EmployeeHierarchyResult | null> {
  const conn = await pool.getConnection();
  try {
    await ensureHierarchyTables(conn);
    const all = await fetchEmployees(conn);
    const targetId = Number(employeeId);
    const emp = all.find((e) => e.id === targetId);
    if (!emp) return null;

    const deptEmployees =
      emp.department_id != null
        ? all.filter((e) => e.department_id === emp.department_id)
        : all;

    const photos = await getAllOrgChartPhotos();
    const employeePhotos = photos.employeePhotos;
    const shellAvatars = photos.shellBranding.employeeAvatars;

    let reportsToRow: EmpRow | null = null;
    const explicitManagerId = await fetchExplicitReportsTo(conn, targetId);
    if (explicitManagerId) {
      reportsToRow = all.find((e) => e.id === explicitManagerId) ?? null;
    } else {
      reportsToRow = inferReportsTo(emp, deptEmployees);
      if (!reportsToRow) {
        reportsToRow = inferReportsTo(emp, all);
      }
    }

    let teamRows: EmpRow[] = [];
    const explicitMemberIds = await fetchTeamMemberIds(conn, targetId);
    if (explicitMemberIds.length > 0) {
      teamRows = explicitMemberIds
        .map((id) => all.find((e) => e.id === id))
        .filter((e): e is EmpRow => Boolean(e));
    } else {
      teamRows = inferTeamMembers(emp, deptEmployees);
    }

    const isTeamLead = teamRows.length > 0 || roleRank(emp.role) <= 4;

    return {
      employeeId: String(emp.id),
      role: emp.role || "Officer",
      departmentName: emp.department_name,
      jobTitle: emp.job_title,
      reportsTo: reportsToRow ? toPerson(reportsToRow, employeePhotos, shellAvatars) : null,
      teamMembers: teamRows.map((r) => toPerson(r, employeePhotos, shellAvatars)),
      isTeamLead,
    };
  } finally {
    conn.release();
  }
}
