export type TabId = "roles" | "permissions" | "features" | "settings";

export type RoleDef = {
  id: string;
  name: string;
  description: string;
  portal: string;
  scope: string;
  scopeLabel: string;
  hierarchyLevel: number;
  system?: boolean;
  // Org-chart parent. null = top of the tree (root). Drives the hierarchy view.
  parentId?: string | null;
  // Visual/permission tier used for org-chart colour and default permissions.
  tier?: RoleTier;
  accent?: string;
};

export type RoleTier =
  | "board"
  | "partner"
  | "director"
  | "manager"
  | "lead"
  | "staff"
  | "support"
  | "junior";

export type DemoEmployee = {
  id: string;
  name: string;
  initials: string;
  pseudonym?: string;
  profilePhoto?: string;
  roleId: string;
  /** Explicit System Control assignment; null/undefined = not assigned via Permissions. */
  accessRoleSlug?: string | null;
  departmentId: string;
  departmentName?: string;
  reportsTo: string | null;
  /** Live HRM role string (BOD/CEO, HOD, …) before System Control assign. */
  legacyRole?: string;
};

export type FeatureModule = {
  id: string;
  name: string;
  icon: string;
  permissions: { key: string; label: string; desc: string }[];
};

export type GlobalFeature = {
  key: string;
  name: string;
  desc: string;
  on: boolean;
};

const PERM_HINTS: Record<string, string> = {
  "dashboard.view": "Open the main HRM dashboard.",
  "admin.home.view": "Open the admin home page.",
  "attendance.summary.view": "View attendance summary reports and filters for employees in scope.",
  "attendance.summary.export": "Download attendance summary as Excel or PDF.",
  "attendance.manage.edit": "Correct punch times, add manual entries, or fix exceptions.",
  "attendance.monthly.view": "Open monthly attendance and deduction views.",
  "attendance.monthly.export": "Export monthly deduction summary for payroll handoff.",
  "attendance.breaks.manage": "Configure break rules and review break usage.",
  "attendance.tungsten.view": "Open Tungsten biometric IN/OUT punch log.",
  "attendance.presence.view": "Open desktop presence / idle monitoring.",
  "attendance.employee_report.view": "Open per-employee attendance report.",
  "leave.list.view": "See leave requests for scoped employees (not only self).",
  "leave.apply.self": "Submit own leave / PTO requests from employee portal.",
  "leave.approve.manager": "First-step approval as direct manager in the chain.",
  "leave.approve.hr": "Final HR approval before leave is booked.",
  "leave.balances.edit": "Adjust leave balances and entitlements.",
  "leave.calendar.view": "Open company leave calendar.",
  "leave.monthly_summary.view": "Open monthly leave summary reports.",
  "payroll.monthly.view": "View monthly payroll sheets and totals.",
  "payroll.monthly.edit": "Edit payroll lines, allowances, and deductions.",
  "payroll.commissions": "Access commission calculation and payout screens.",
  "payroll.advance": "Process salary advance requests.",
  "payroll.loan": "Manage employee loan schedules and deductions.",
  "payroll.financial_requests.view": "Review advance/loan financial request inbox.",
  "people.employee_list.view": "Browse and search the employee directory.",
  "people.employee.add": "Create new employee records.",
  "people.credentials.manage": "Reset or issue employee login credentials.",
  "people.face_enrollment.manage": "Enroll or update biometric face profiles.",
  "people.files.view": "Access employee document files.",
  "people.appraisals.view": "Review pending appraisal workflows.",
  "people.formats.view": "Open HR formats library.",
  "people.recruitment.view": "Open recruitment module.",
  "shifts.scheduler.view": "Open shift scheduler.",
  "shifts.management.view": "Manage shift templates and assignments.",
  "ops.tickets.view": "Open ticket inbox and reply threads.",
  "ops.events.view": "Manage upcoming company events.",
  "ops.departments.view": "Manage departments.",
  "ops.login_carousel.manage": "Edit login page carousel slides.",
  "ops.company_policy.view": "View or edit company policies.",
  "team.dashboard.view": "Open team-lead dashboard with team KPIs.",
  "team.attendance.view": "View attendance for assigned team members only.",
  "team.management.assign": "Assign employees to team leads (HR function).",
  "portal.my_info.view": "Open personal My Info page.",
  "portal.time.view": "Open employee time / clock page.",
  "portal.tickets.create": "Create support tickets from employee portal.",
  "portal.performance.view": "Open performance page.",
  "system.control.access": "Open System Control in view mode (does not grant edit rights by itself).",
  "system.permissions.edit": "Edit role/user permission checkmarks and save changes.",
  "system.users.assign": "Assign or unassign roles to employees.",
  "system.org_chart.edit": "Create, move, rename, or delete org chart role cards.",
  "system.features.edit": "Toggle organization-wide feature switches.",
};

function withPermissionHints(
  modules: {
    id: string;
    name: string;
    icon: string;
    permissions: { key: string; label: string }[];
  }[],
): FeatureModule[] {
  return modules.map((mod) => ({
    ...mod,
    permissions: mod.permissions.map((perm) => ({
      ...perm,
      desc: PERM_HINTS[perm.key] || `Controls access to: ${perm.label.toLowerCase()}.`,
    })),
  }));
}

// Per-tier defaults: org-chart colour, dashboard portal, data scope, and the
// hierarchy level (lower number = higher rank).
const TIER_META: Record<
  RoleTier,
  { level: number; portal: string; scope: string; accent: string }
> = {
  board: { level: 1, portal: "admin-dashboard", scope: "ALL", accent: "#a78bfa" },
  partner: { level: 5, portal: "admin-dashboard", scope: "ALL", accent: "#1a1a1a" },
  director: { level: 10, portal: "admin-dashboard", scope: "DEPARTMENT", accent: "#b91c1c" },
  manager: { level: 20, portal: "admin-dashboard", scope: "DEPARTMENT", accent: "#ea580c" },
  lead: { level: 30, portal: "leader-dashboard", scope: "TEAM", accent: "#2b6cb0" },
  staff: { level: 40, portal: "employee-dashboard", scope: "SELF", accent: "#2b6cb0" },
  support: { level: 45, portal: "employee-dashboard", scope: "SELF", accent: "#38a169" },
  junior: { level: 50, portal: "employee-dashboard", scope: "SELF", accent: "#38a169" },
};

// [id, display name, parentId, tier] — the company's actual org structure.
type RoleSeed = [string, string, string | null, RoleTier];

const ROLE_SEEDS: RoleSeed[] = [
  // Top
  ["exec_board", "Executive Board / Managing Partners", null, "board"],

  // ── IT & Technology ──────────────────────────────────────────
  ["mp_it", "Managing Partner — IT & Technology", "exec_board", "partner"],
  ["dir_it", "Director of IT", "mp_it", "director"],
  ["it_manager", "IT Manager", "dir_it", "manager"],
  ["sysadmin", "System Administrator / Network Engineer", "it_manager", "lead"],
  ["it_support", "IT Support Specialist", "sysadmin", "staff"],
  ["helpdesk", "Helpdesk Associate", "it_support", "junior"],
  ["telephony", "Telephony & Voice Specialist (Genesys / Avaya)", "it_manager", "staff"],
  ["voice_infra", "Support Voice Infrastructure", "telephony", "support"],

  // ── Finance & Data Analytics ─────────────────────────────────
  ["mp_finance", "Managing Partner — Finance & Data Analytics", "exec_board", "partner"],
  ["dir_privacy", "Director of Privacy", "mp_finance", "director"],
  ["finance_manager", "Finance Manager", "dir_privacy", "manager"],
  ["accountant_billing", "Accountant / Billing Specialist", "finance_manager", "staff"],
  ["dir_data", "Director of Data Mining & Analytics", "mp_finance", "director"],
  ["bd_sourcing", "BD / Sourcing Manager", "dir_data", "manager"],
  ["data_engineer", "Data Engineers / ETL Specialists", "bd_sourcing", "staff"],
  ["data_analyst", "Data Analysts / BI Reporters", "bd_sourcing", "staff"],
  ["junior_data_analyst", "Junior Data Analyst", "data_analyst", "junior"],
  ["provider_insights", "Provider System Performance Insights", "data_analyst", "support"],
  ["provider_forecast", "Provider Reimbursement / P&L Forecasting", "data_analyst", "support"],

  // ── Medical Billing Operations ───────────────────────────────
  ["mp_medical", "Managing Partner — Medical Billing Operations", "exec_board", "partner"],
  // Client Billing & Collections
  ["dir_billing", "Director — Medical Billing Operations", "mp_medical", "director"],
  ["qa_manager", "QA & Assurance Manager (HIPAA / Compliance)", "dir_billing", "manager"],
  ["qa_lead", "QA Lead / Auditor", "qa_manager", "lead"],
  ["qa_analyst", "QA Analyst / Chart Reviewer", "qa_lead", "junior"],
  ["billing_ops_manager", "Medical Billing Operations Manager", "dir_billing", "manager"],
  ["team_lead_billing", "Team Lead / Supervisor", "billing_ops_manager", "lead"],
  ["senior_coder", "Senior Medical Coder / Biller", "team_lead_billing", "staff"],
  ["junior_coder", "Junior Medical Coder / CDI", "senior_coder", "junior"],
  // Recruit & Onboard / HR & Admin
  ["dir_hr", "Director of Human Resources & Admin", "mp_medical", "director"],
  ["hr_manager", "HR Manager", "dir_hr", "manager"],
  ["recruitment", "Recruitment / Talent Acquisition", "hr_manager", "staff"],
  ["hr_coordinator", "HR Coordinators / Payroll", "hr_manager", "staff"],
  ["admin_manager", "Administration Manager", "dir_hr", "manager"],
  ["admin_officer", "Admin Officers / Facility Executive", "admin_manager", "staff"],
];

export const BASE_ROLES: RoleDef[] = ROLE_SEEDS.map(([id, name, parentId, tier], i) => {
  const meta = TIER_META[tier];
  return {
    id,
    name,
    description: `${name} — ${tier} level.`,
    portal: meta.portal,
    scope: meta.scope,
    scopeLabel: scopeLabelFromScope(meta.scope),
    // Keep levels unique-ish per node so card sorting is stable within a tier.
    hierarchyLevel: meta.level * 100 + i,
    system: tier === "board",
    parentId,
    tier,
    accent: meta.accent,
  };
});

export const DEPARTMENTS = [
  { id: "executive", name: "Executive" },
  { id: "engineering", name: "Engineering" },
  { id: "production", name: "Production" },
  { id: "hr", name: "HR" },
  { id: "sales", name: "Sales" },
];

export const INITIAL_EMPLOYEES: DemoEmployee[] = [
  { id: "1001", name: "Mahnoor", initials: "MN", pseudonym: "MN-Exec", roleId: "mp_it", departmentId: "executive", reportsTo: null },
  { id: "1002", name: "Akhtar", initials: "AK", pseudonym: "AK-Finance", roleId: "mp_finance", departmentId: "executive", reportsTo: null },
  { id: "1003", name: "Saqib", initials: "SQ", pseudonym: "SQ-Medical", roleId: "mp_medical", departmentId: "executive", reportsTo: "1001" },
  { id: "1088", name: "Ali Hassan", initials: "AH", pseudonym: "Developer", roleId: "it_manager", departmentId: "engineering", reportsTo: "1001" },
  { id: "1201", name: "Sara Khan", initials: "SK", pseudonym: "SK-Billing", roleId: "team_lead_billing", departmentId: "production", reportsTo: "1003" },
  { id: "1210", name: "Omar Raza", initials: "OR", pseudonym: "OR-Coder", roleId: "junior_coder", departmentId: "production", reportsTo: "1201" },
  { id: "1042", name: "Zara Malik", initials: "ZM", pseudonym: "ZM-HR", roleId: "hr_manager", departmentId: "hr", reportsTo: "1003" },
  { id: "1220", name: "Bilal Hussain", initials: "BH", pseudonym: "BH-Senior", roleId: "senior_coder", departmentId: "production", reportsTo: "1201" },
  { id: "1315", name: "Hina Shah", initials: "HS", pseudonym: "HS-Ops", roleId: "billing_ops_manager", departmentId: "production", reportsTo: "1003" },
];

export const FEATURE_MODULES = withPermissionHints([
  {
    id: "dashboard",
    name: "Dashboard & Admin",
    icon: "🏠",
    permissions: [
      { key: "dashboard.view", label: "View main dashboard" },
      { key: "admin.home.view", label: "View admin home" },
    ],
  },
  {
    id: "attendance",
    name: "Attendance",
    icon: "⏱",
    permissions: [
      { key: "attendance.summary.view", label: "View attendance summary" },
      { key: "attendance.summary.export", label: "Export attendance summary" },
      { key: "attendance.manage.edit", label: "Edit attendance records" },
      { key: "attendance.monthly.view", label: "View monthly attendance" },
      { key: "attendance.monthly.export", label: "Export deduction summary" },
      { key: "attendance.breaks.manage", label: "Manage breaks" },
      { key: "attendance.tungsten.view", label: "Tungsten IN/OUT page" },
      { key: "attendance.presence.view", label: "Presence / Idle page" },
      { key: "attendance.employee_report.view", label: "Employee attendance report" },
    ],
  },
  {
    id: "leave",
    name: "Leave / PTO",
    icon: "🌴",
    permissions: [
      { key: "leave.list.view", label: "View all leave requests" },
      { key: "leave.apply.self", label: "Apply own leave" },
      { key: "leave.approve.manager", label: "Approve leave (Manager step)" },
      { key: "leave.approve.hr", label: "Approve leave (HR final)" },
      { key: "leave.balances.edit", label: "Edit leave balances" },
      { key: "leave.calendar.view", label: "Leave calendar" },
      { key: "leave.monthly_summary.view", label: "Monthly leave summary" },
    ],
  },
  {
    id: "payroll",
    name: "Payroll & Finance",
    icon: "💰",
    permissions: [
      { key: "payroll.monthly.view", label: "View monthly payroll" },
      { key: "payroll.monthly.edit", label: "Edit monthly payroll" },
      { key: "payroll.commissions", label: "Commissions" },
      { key: "payroll.advance", label: "Advance" },
      { key: "payroll.loan", label: "Loan" },
      { key: "payroll.financial_requests.view", label: "Financial request inbox" },
    ],
  },
  {
    id: "people",
    name: "People & Onboarding",
    icon: "👤",
    permissions: [
      { key: "people.employee_list.view", label: "Employee list" },
      { key: "people.employee.add", label: "Add employee" },
      { key: "people.credentials.manage", label: "Employee credentials" },
      { key: "people.face_enrollment.manage", label: "Face enrollment" },
      { key: "people.files.view", label: "Employee files" },
      { key: "people.appraisals.view", label: "Pending appraisals" },
      { key: "people.formats.view", label: "Formats library" },
      { key: "people.recruitment.view", label: "Recruitment" },
    ],
  },
  {
    id: "shifts",
    name: "Shifts",
    icon: "📅",
    permissions: [
      { key: "shifts.scheduler.view", label: "Shift scheduler" },
      { key: "shifts.management.view", label: "Shift management" },
    ],
  },
  {
    id: "ops",
    name: "Operations & Org",
    icon: "🏢",
    permissions: [
      { key: "ops.tickets.view", label: "Ticket inbox" },
      { key: "ops.events.view", label: "Events" },
      { key: "ops.departments.view", label: "Departments" },
      { key: "ops.login_carousel.manage", label: "Login carousel" },
      { key: "ops.company_policy.view", label: "Company policy" },
    ],
  },
  {
    id: "team",
    name: "Team Lead module",
    icon: "👥",
    permissions: [
      { key: "team.dashboard.view", label: "Team dashboard" },
      { key: "team.attendance.view", label: "View team attendance" },
      { key: "team.management.assign", label: "Assign team members (HR)" },
    ],
  },
  {
    id: "portal",
    name: "Employee portal",
    icon: "📱",
    permissions: [
      { key: "portal.my_info.view", label: "My Info" },
      { key: "portal.time.view", label: "Time / clock page" },
      { key: "portal.tickets.create", label: "Generate ticket" },
      { key: "portal.performance.view", label: "Performance" },
    ],
  },
  {
    id: "system",
    name: "System Control",
    icon: "⚙",
    permissions: [
      { key: "system.control.access", label: "Open System Control" },
      { key: "system.permissions.edit", label: "Edit permission checkmarks" },
      { key: "system.users.assign", label: "Assign roles to employees" },
      { key: "system.org_chart.edit", label: "Edit org chart cards" },
      { key: "system.features.edit", label: "Edit global features toggles" },
    ],
  },
]);

const ALL_PERMISSION_KEYS = FEATURE_MODULES.flatMap((m) =>
  m.permissions.map((p) => p.key),
);

/** Default granted permissions for a tier. Users fine-tune in Permissions tab. */
function permissionsForTier(tier: RoleTier): string[] {
  switch (tier) {
    case "board":
    case "partner":
      return ALL_PERMISSION_KEYS;
    case "director":
      return [
        "attendance.summary.view",
        "attendance.summary.export",
        "attendance.manage.edit",
        "attendance.monthly.view",
        "attendance.monthly.export",
        "leave.list.view",
        "leave.approve.manager",
        "leave.approve.hr",
        "team.dashboard.view",
        "team.attendance.view",
        "team.management.assign",
        "payroll.monthly.view",
      ];
    case "manager":
      return [
        "attendance.summary.view",
        "attendance.manage.edit",
        "attendance.monthly.view",
        "leave.list.view",
        "leave.approve.manager",
        "team.dashboard.view",
        "team.attendance.view",
      ];
    case "lead":
      return ["leave.apply.self", "team.dashboard.view", "team.attendance.view"];
    default:
      return ["leave.apply.self"];
  }
}

export const DEFAULT_PERMISSIONS: Record<string, Set<string>> = Object.fromEntries(
  BASE_ROLES.map((r) => [r.id, new Set(permissionsForTier(r.tier ?? "staff"))]),
);

export const GLOBAL_FEATURES: GlobalFeature[] = [
  { key: "biometric", name: "Biometric face clock-in", desc: "Require face verify on clock in/out", on: true },
  { key: "tungsten", name: "Tungsten IN/OUT sync", desc: "Punch reconciliation page", on: true },
  { key: "prayer", name: "Prayer break tracking", desc: "Prayer module on employee time page", on: true },
  { key: "two_step_leave", name: "Two-step leave approval", desc: "Manager first, then HR final", on: false },
  { key: "team_lead_module", name: "Team Lead module", desc: "Leader dashboard and team summaries", on: false },
  { key: "tickets", name: "Ticket system", desc: "Employee tickets and admin ticket inbox", on: true },
  { key: "recruitment", name: "Recruitment module", desc: "Recruitment workflows and pages", on: true },
  { key: "presence_agent", name: "Desktop presence agent", desc: "Presence / idle monitoring integration", on: true },
  { key: "login_carousel", name: "Login carousel", desc: "Branded login page slides", on: true },
  { key: "employee_files", name: "Employee files", desc: "HR document library for employees", on: true },
  { key: "appraisals", name: "Appraisals", desc: "Pending appraisal workflows", on: true },
  { key: "financial_requests", name: "Financial requests", desc: "Advance/loan request inbox", on: true },
  { key: "events", name: "Company events", desc: "Upcoming events module", on: true },
  { key: "shift_management", name: "Shift management", desc: "Shift scheduler and management pages", on: true },
];

export const TAB_HINT: Record<TabId, string> = {
  roles: "Drag any card onto another to change its reporting line. Click a card to add a role under it, rename it, set its level, or delete it. All card changes are saved to the database and survive refresh.",
  permissions: "Select a role to configure permissions across every HRM module, assign it to a live employee, then Save — stored in Mongo/MySQL.",
  features: "Globally enable or disable features for the entire organization. Save writes to the database.",
  settings: "Session defaults, leave workflow, and who can access System Control.",
};

/** Managing partners — each owns one org-chart department column. */
export const ORG_DEPT_ROOT_IDS = ["mp_it", "mp_finance", "mp_medical"] as const;

/** "Managing Partner — IT & Technology" → "IT & Technology" */
export function deptSectionLabel(partnerName: string): string {
  const dash = partnerName.indexOf("—");
  if (dash >= 0) return partnerName.slice(dash + 1).trim();
  return partnerName;
}

/** Pre-order traversal of a role subtree (root included), top-down like the org chart. */
export function rolesInSubtree(roles: RoleDef[], rootId: string): RoleDef[] {
  const root = roles.find((r) => r.id === rootId);
  if (!root) return [];
  const out: RoleDef[] = [root];
  const walk = (parentId: string) => {
    const kids = childRoles(roles, parentId).sort(
      (a, b) => a.hierarchyLevel - b.hierarchyLevel,
    );
    for (const k of kids) {
      out.push(k);
      walk(k.id);
    }
  };
  walk(rootId);
  return out;
}

/** Department branch root (`mp_*`) for a role, or null when above the three columns. */
export function deptRootForRole(roles: RoleDef[], roleId: string): string | null {
  let cur = roles.find((r) => r.id === roleId);
  while (cur) {
    if ((ORG_DEPT_ROOT_IDS as readonly string[]).includes(cur.id)) return cur.id;
    if (cur.parentId == null) return null;
    cur = roles.find((r) => r.id === cur!.parentId);
  }
  return null;
}

export type RoleSectionGroup = {
  id: string;
  title: string;
  roles: RoleDef[];
  variant: "executive" | "department";
};

/** Group roles into executive + three org-chart department sections. */
export function groupRolesByOrgSection(roles: RoleDef[]): RoleSectionGroup[] {
  const sections: RoleSectionGroup[] = [];

  const topRoles = roles
    .filter((r) => {
      if ((ORG_DEPT_ROOT_IDS as readonly string[]).includes(r.id)) return false;
      return deptRootForRole(roles, r.id) === null;
    })
    .sort((a, b) => a.hierarchyLevel - b.hierarchyLevel);

  if (topRoles.length > 0) {
    sections.push({
      id: "executive",
      title: "Executive Board",
      roles: topRoles,
      variant: "executive",
    });
  }

  for (const rootId of ORG_DEPT_ROOT_IDS) {
    const root = roles.find((r) => r.id === rootId);
    if (!root) continue;
    const subtree = rolesInSubtree(roles, rootId);
    if (subtree.length === 0) continue;
    sections.push({
      id: rootId,
      title: deptSectionLabel(root.name),
      roles: subtree,
      variant: "department",
    });
  }

  const assigned = new Set(sections.flatMap((s) => s.roles.map((r) => r.id)));
  const orphans = roles.filter((r) => !assigned.has(r.id));
  if (orphans.length > 0) {
    sections.push({
      id: "other",
      title: "Other roles",
      roles: orphans.sort((a, b) => a.hierarchyLevel - b.hierarchyLevel),
      variant: "executive",
    });
  }

  return sections;
}

export function clonePermissionMap() {
  const out: Record<string, Set<string>> = {};
  for (const [roleId, set] of Object.entries(DEFAULT_PERMISSIONS)) {
    out[roleId] = new Set(set);
  }
  return out;
}

export function scopeLabelFromScope(scope: string) {
  const map: Record<string, string> = {
    ALL: "ALL company",
    DEPARTMENT: "DEPARTMENT",
    TEAM: "TEAM",
    SELF: "SELF",
  };
  return map[scope] || scope;
}

export function slugifyRoleName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

export function roleMeta(roleId: string, allRoles: RoleDef[]) {
  return (
    allRoles.find((r) => r.id === roleId) ||
    allRoles.find((r) => r.id === "exec_board") ||
    BASE_ROLES[0]
  );
}

export function isSystemRole(roleId: string) {
  const base = BASE_ROLES.find((r) => r.id === roleId);
  return Boolean(base?.system);
}

export function isCustomRole(roleId: string, customRoles?: RoleDef[]) {
  if (customRoles && customRoles.length) {
    return customRoles.some((r) => r.id === roleId);
  }
  return !BASE_ROLES.some((r) => r.id === roleId);
}

export function isRoleLocked(roleId: string) {
  return roleId === "exec_board";
}

/** Direct children of a role in the org tree. */
export function childRoles(roles: RoleDef[], parentId: string | null) {
  return roles.filter((r) => (r.parentId ?? null) === parentId);
}

/**
 * True if `maybeDescendantId` sits anywhere below `rootId` in the tree. Used to
 * stop an illegal drag-drop that would create a cycle (dropping a role onto one
 * of its own descendants).
 */
export function isDescendantOf(
  roles: RoleDef[],
  rootId: string,
  maybeDescendantId: string,
): boolean {
  const stack = [...childRoles(roles, rootId)];
  while (stack.length) {
    const node = stack.pop()!;
    if (node.id === maybeDescendantId) return true;
    stack.push(...childRoles(roles, node.id));
  }
  return false;
}

export function empNameById(employees: DemoEmployee[], id: string | null) {
  if (!id) return null;
  return employees.find((e) => e.id === id)?.name || null;
}

export function deptNameById(deptId: string) {
  return DEPARTMENTS.find((d) => d.id === deptId)?.name || deptId;
}
