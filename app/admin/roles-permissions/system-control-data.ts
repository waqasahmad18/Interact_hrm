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
};

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

export const BASE_ROLES: RoleDef[] = [
  {
    id: "super_admin",
    name: "Super Admin",
    description: "Full system access. Cannot be deleted or restricted.",
    portal: "admin-dashboard",
    scope: "ALL",
    scopeLabel: "ALL — unlimited",
    hierarchyLevel: 1,
    system: true,
  },
  {
    id: "ceo",
    name: "CEO",
    description: "Executive leadership with full company visibility.",
    portal: "admin-dashboard",
    scope: "ALL",
    scopeLabel: "ALL — unlimited",
    hierarchyLevel: 2,
  },
  {
    id: "hr",
    name: "HR",
    description: "Human resources — company-wide employee and leave management.",
    portal: "admin-dashboard",
    scope: "ALL",
    scopeLabel: "ALL company",
    hierarchyLevel: 10,
  },
  {
    id: "accountant",
    name: "Accountant",
    description: "Payroll and finance operations across the company.",
    portal: "admin-dashboard",
    scope: "ALL",
    scopeLabel: "ALL company",
    hierarchyLevel: 15,
  },
  {
    id: "manager",
    name: "Manager",
    description: "Department head — manages team within their department.",
    portal: "admin-dashboard",
    scope: "DEPARTMENT",
    scopeLabel: "DEPARTMENT",
    hierarchyLevel: 20,
  },
  {
    id: "team_lead",
    name: "Team Lead",
    description: "Leads a team — team dashboard and team attendance.",
    portal: "leader-dashboard",
    scope: "TEAM",
    scopeLabel: "TEAM",
    hierarchyLevel: 30,
  },
  {
    id: "officer",
    name: "Officer",
    description: "Standard employee — self-service portal only.",
    portal: "employee-dashboard",
    scope: "SELF",
    scopeLabel: "SELF",
    hierarchyLevel: 90,
  },
];

export const DEPARTMENTS = [
  { id: "executive", name: "Executive" },
  { id: "engineering", name: "Engineering" },
  { id: "production", name: "Production" },
  { id: "hr", name: "HR" },
  { id: "sales", name: "Sales" },
];

export const INITIAL_EMPLOYEES: DemoEmployee[] = [
  { id: "1001", name: "CEO Office", initials: "CEO", roleId: "ceo", departmentId: "executive", reportsTo: null },
  { id: "1088", name: "Ali Hassan", initials: "AH", roleId: "manager", departmentId: "production", reportsTo: "1001" },
  { id: "1201", name: "Sara Khan", initials: "SK", roleId: "team_lead", departmentId: "production", reportsTo: "1088" },
  { id: "1210", name: "Omar Raza", initials: "OR", roleId: "officer", departmentId: "production", reportsTo: "1201" },
  { id: "1042", name: "Zara Malik", initials: "ZM", roleId: "hr", departmentId: "hr", reportsTo: "1001" },
  { id: "1220", name: "Bilal Hussain", initials: "BH", roleId: "officer", departmentId: "production", reportsTo: "1201" },
  { id: "1315", name: "Hina Shah", initials: "HS", roleId: "manager", departmentId: "sales", reportsTo: "1001" },
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

export const DEFAULT_PERMISSIONS: Record<string, Set<string>> = {
  super_admin: new Set(FEATURE_MODULES.flatMap((m) => m.permissions.map((p) => p.key))),
  ceo: new Set(FEATURE_MODULES.flatMap((m) => m.permissions.map((p) => p.key))),
  hr: new Set([
    "attendance.summary.view",
    "attendance.manage.edit",
    "attendance.monthly.view",
    "leave.list.view",
    "leave.approve.hr",
    "leave.balances.edit",
    "payroll.monthly.view",
    "team.management.assign",
    "system.users.assign",
  ]),
  manager: new Set([
    "attendance.summary.view",
    "attendance.manage.edit",
    "attendance.monthly.view",
    "leave.list.view",
    "leave.approve.manager",
  ]),
  team_lead: new Set(["leave.apply.self", "team.dashboard.view", "team.attendance.view"]),
  officer: new Set(["leave.apply.self"]),
  accountant: new Set(["payroll.monthly.view", "payroll.monthly.edit", "payroll.commissions"]),
};

export const GLOBAL_FEATURES: GlobalFeature[] = [
  { key: "biometric", name: "Biometric face clock-in", desc: "Require face verify on clock in/out", on: true },
  { key: "tungsten", name: "Tungsten IN/OUT sync", desc: "Punch reconciliation page", on: true },
  { key: "prayer", name: "Prayer break tracking", desc: "Prayer module on employee time page", on: true },
  { key: "two_step_leave", name: "Two-step leave approval", desc: "Manager first, then HR final", on: false },
  { key: "team_lead_module", name: "Team Lead module", desc: "Leader dashboard and team summaries", on: false },
];

export const TAB_HINT: Record<TabId, string> = {
  roles: "Set hierarchy level per role (lower number = higher rank). Cards reorder automatically; lowering level inherits permissions from all roles below.",
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
  return allRoles.find((r) => r.id === roleId) || allRoles.find((r) => r.id === "officer") || BASE_ROLES[6];
}

export function isSystemRole(roleId: string) {
  const base = BASE_ROLES.find((r) => r.id === roleId);
  return Boolean(base?.system);
}

export function isCustomRole(roleId: string, customRoles: RoleDef[]) {
  return customRoles.some((r) => r.id === roleId);
}

export function isRoleLocked(roleId: string) {
  return roleId === "super_admin";
}

export function empNameById(employees: DemoEmployee[], id: string | null) {
  if (!id) return null;
  return employees.find((e) => e.id === id)?.name || null;
}

export function deptNameById(deptId: string) {
  return DEPARTMENTS.find((d) => d.id === deptId)?.name || deptId;
}
