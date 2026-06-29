export type TabId = "roles" | "permissions" | "assign" | "features" | "settings";

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
  roleId: string;
  departmentId: string;
  reportsTo: string | null;
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
  "attendance.summary.view": "View attendance summary reports and filters for employees in scope.",
  "attendance.summary.export": "Download attendance summary as Excel or PDF.",
  "attendance.manage.edit": "Correct punch times, add manual entries, or fix exceptions.",
  "attendance.monthly.view": "Open monthly attendance and deduction views.",
  "attendance.monthly.export": "Export monthly deduction summary for payroll handoff.",
  "attendance.breaks.manage": "Configure break rules and review break usage.",
  "leave.list.view": "See leave requests for scoped employees (not only self).",
  "leave.apply.self": "Submit own leave / PTO requests from employee portal.",
  "leave.approve.manager": "First-step approval as direct manager in the chain.",
  "leave.approve.hr": "Final HR approval before leave is booked.",
  "leave.balances.edit": "Adjust leave balances and entitlements.",
  "payroll.monthly.view": "View monthly payroll sheets and totals.",
  "payroll.monthly.edit": "Edit payroll lines, allowances, and deductions.",
  "payroll.commissions": "Access commission calculation and payout screens.",
  "payroll.advance": "Process salary advance requests.",
  "payroll.loan": "Manage employee loan schedules and deductions.",
  "team.dashboard.view": "Open team-lead dashboard with team KPIs.",
  "team.attendance.view": "View attendance for assigned team members only.",
  "team.management.assign": "Assign employees to team leads (HR function).",
  "system.control.access": "Open System Control administration area.",
  "system.permissions.edit": "Edit role permission matrix and save changes.",
  "system.users.assign": "Assign roles, departments, and reporting lines to users.",
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
  board: { level: 1, portal: "admin-dashboard", scope: "ALL", accent: "#6366f1" },
  partner: { level: 5, portal: "admin-dashboard", scope: "ALL", accent: "#1f2937" },
  director: { level: 10, portal: "admin-dashboard", scope: "DEPARTMENT", accent: "#dc2626" },
  manager: { level: 20, portal: "admin-dashboard", scope: "DEPARTMENT", accent: "#ea580c" },
  lead: { level: 30, portal: "leader-dashboard", scope: "TEAM", accent: "#2563eb" },
  staff: { level: 40, portal: "employee-dashboard", scope: "SELF", accent: "#2563eb" },
  support: { level: 45, portal: "employee-dashboard", scope: "SELF", accent: "#94a3b8" },
  junior: { level: 50, portal: "employee-dashboard", scope: "SELF", accent: "#16a34a" },
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
  { id: "1001", name: "Mahnoor", initials: "MN", roleId: "mp_it", departmentId: "executive", reportsTo: null },
  { id: "1002", name: "Akhtar", initials: "AK", roleId: "mp_finance", departmentId: "executive", reportsTo: null },
  { id: "1003", name: "Saqib", initials: "SQ", roleId: "mp_medical", departmentId: "executive", reportsTo: "1001" },
  { id: "1088", name: "Ali Hassan", initials: "AH", roleId: "it_manager", departmentId: "engineering", reportsTo: "1001" },
  { id: "1201", name: "Sara Khan", initials: "SK", roleId: "team_lead_billing", departmentId: "production", reportsTo: "1003" },
  { id: "1210", name: "Omar Raza", initials: "OR", roleId: "junior_coder", departmentId: "production", reportsTo: "1201" },
  { id: "1042", name: "Zara Malik", initials: "ZM", roleId: "hr_manager", departmentId: "hr", reportsTo: "1003" },
  { id: "1220", name: "Bilal Hussain", initials: "BH", roleId: "senior_coder", departmentId: "production", reportsTo: "1201" },
  { id: "1315", name: "Hina Shah", initials: "HS", roleId: "billing_ops_manager", departmentId: "production", reportsTo: "1003" },
];

export const FEATURE_MODULES = withPermissionHints([
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
    id: "system",
    name: "System Control",
    icon: "⚙",
    permissions: [
      { key: "system.control.access", label: "Open System Control" },
      { key: "system.permissions.edit", label: "Edit permission checkmarks" },
      { key: "system.users.assign", label: "Assign roles to employees" },
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
];

export const TAB_HINT: Record<TabId, string> = {
  roles: "Drag any card onto another to change its reporting line. Click a card to add a role under it, rename it, set its level, or delete it. Changes sync to the other tabs.",
  permissions: "Grant or revoke permissions per role using the matrix. Hover (i) for details.",
  assign: "Assign a primary role to each employee. Changes apply on next login.",
  features: "Globally enable or disable features for the entire organization.",
  settings: "Session defaults, leave workflow, and who can access System Control.",
};

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

export function isCustomRole(roleId: string, customRoles: RoleDef[]) {
  return customRoles.some((r) => r.id === roleId);
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
