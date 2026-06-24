"use client";

import React, { useMemo, useState } from "react";
import LayoutDashboard from "../../layout-dashboard";
import AssignHierarchyPanel from "./AssignHierarchyPanel";
import styles from "./system-control-demo.module.css";

type TabId = "roles" | "permissions" | "assign" | "features" | "settings";

type RoleDemo = {
  id: string;
  name: string;
  slug: string;
  portal: string;
  scope: string;
  level: number;
  users: number;
  system?: boolean;
  description: string;
};

type FeatureModule = {
  id: string;
  name: string;
  permissions: { key: string; label: string }[];
};

const ROLES: RoleDemo[] = [
  {
    id: "super_admin",
    name: "Super Admin",
    slug: "super_admin",
    portal: "Admin shell",
    scope: "All company",
    level: 1,
    users: 2,
    system: true,
    description: "Full system access. Manages roles, permissions, and global features.",
  },
  {
    id: "ceo",
    name: "CEO",
    slug: "ceo",
    portal: "Admin shell",
    scope: "All company",
    level: 2,
    users: 1,
    system: true,
    description: "Same access as Super Admin for business oversight.",
  },
  {
    id: "hr",
    name: "HR",
    slug: "hr",
    portal: "Admin shell",
    scope: "All company",
    level: 10,
    users: 4,
    description: "Employee lifecycle, payroll, final leave approval, attendance corrections.",
  },
  {
    id: "manager",
    name: "Manager",
    slug: "manager",
    portal: "Admin shell",
    scope: "Own department",
    level: 20,
    users: 8,
    description: "Department attendance, first-level leave approval, team oversight.",
  },
  {
    id: "team_lead",
    name: "Team Lead",
    slug: "team_lead",
    portal: "Team Lead shell",
    scope: "Own team",
    level: 30,
    users: 12,
    description: "View-only team attendance and breaks. Cannot edit records or approve leave.",
  },
  {
    id: "officer",
    name: "Officer",
    slug: "officer",
    portal: "Employee shell",
    scope: "Self only",
    level: 90,
    users: 156,
    description: "Clock in/out, own leave, tardy notes, personal dashboard.",
  },
  {
    id: "accountant",
    name: "Accountant",
    slug: "accountant",
    portal: "Admin shell",
    scope: "All company",
    level: 15,
    users: 2,
    description: "Payroll, commissions, advance, and loan modules.",
  },
];

const FEATURE_MODULES: FeatureModule[] = [
  {
    id: "attendance",
    name: "Attendance",
    permissions: [
      { key: "attendance.summary.view", label: "View attendance summary" },
      { key: "attendance.summary.export", label: "Export attendance summary" },
      { key: "attendance.manage.edit", label: "Edit attendance records" },
      { key: "attendance.monthly.view", label: "View monthly attendance" },
      { key: "attendance.monthly.export", label: "Export monthly / deduction summary" },
      { key: "attendance.breaks.manage", label: "Manage breaks" },
      { key: "attendance.employee.report", label: "Employee attendance report" },
    ],
  },
  {
    id: "leave",
    name: "Leave / PTO",
    permissions: [
      { key: "leave.list.view", label: "View all leave requests" },
      { key: "leave.apply.self", label: "Apply own leave" },
      { key: "leave.approve.manager", label: "Approve leave (Manager step)" },
      { key: "leave.approve.hr", label: "Approve leave (HR final)" },
      { key: "leave.balances.edit", label: "Edit leave balances" },
      { key: "leave.summary.view", label: "Monthly leave summary" },
    ],
  },
  {
    id: "people",
    name: "Onboarding & People",
    permissions: [
      { key: "employees.add", label: "Add employee" },
      { key: "employees.list.view", label: "View employee list" },
      { key: "employees.edit", label: "Edit employee records" },
      { key: "employees.face.enroll", label: "Face enrollment" },
      { key: "employees.credentials", label: "Manage credentials" },
    ],
  },
  {
    id: "payroll",
    name: "Payroll & Finance",
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
    name: "Team Lead",
    permissions: [
      { key: "team.dashboard.view", label: "Team dashboard (My Team tab)" },
      { key: "team.attendance.view", label: "View team attendance" },
      { key: "team.management.assign", label: "Assign team members (HR)" },
    ],
  },
  {
    id: "system",
    name: "System Control",
    permissions: [
      { key: "system.control.access", label: "Open System Control page" },
      { key: "system.roles.create", label: "Create / clone roles" },
      { key: "system.permissions.edit", label: "Edit permission checkmarks" },
      { key: "system.users.assign", label: "Assign roles to employees" },
    ],
  },
];

const DEFAULT_PERMISSIONS: Record<string, Set<string>> = {
  super_admin: new Set(FEATURE_MODULES.flatMap((m) => m.permissions.map((p) => p.key))),
  ceo: new Set(FEATURE_MODULES.flatMap((m) => m.permissions.map((p) => p.key))),
  hr: new Set([
    "attendance.summary.view",
    "attendance.manage.edit",
    "attendance.monthly.view",
    "attendance.monthly.export",
    "leave.list.view",
    "leave.approve.hr",
    "leave.balances.edit",
    "leave.summary.view",
    "employees.add",
    "employees.list.view",
    "employees.edit",
    "employees.face.enroll",
    "employees.credentials",
    "payroll.monthly.view",
    "payroll.monthly.edit",
    "payroll.commissions",
    "payroll.advance",
    "payroll.loan",
    "team.management.assign",
    "system.users.assign",
  ]),
  manager: new Set([
    "attendance.summary.view",
    "attendance.summary.export",
    "attendance.manage.edit",
    "attendance.monthly.view",
    "attendance.monthly.export",
    "attendance.employee.report",
    "leave.list.view",
    "leave.approve.manager",
    "employees.list.view",
  ]),
  team_lead: new Set([
    "leave.apply.self",
    "team.dashboard.view",
    "team.attendance.view",
  ]),
  officer: new Set(["leave.apply.self"]),
  accountant: new Set([
    "payroll.monthly.view",
    "payroll.monthly.edit",
    "payroll.commissions",
    "payroll.advance",
    "payroll.loan",
    "attendance.monthly.view",
  ]),
};

const GLOBAL_FEATURES = [
  {
    key: "biometric",
    name: "Biometric face clock-in",
    desc: "Require face verify on employee clock in/out",
    on: true,
  },
  {
    key: "tungsten",
    name: "Tungsten IN/OUT sync",
    desc: "Show Tungsten punch reconciliation page",
    on: true,
  },
  {
    key: "prayer",
    name: "Prayer break tracking",
    desc: "Prayer break module in employee time page",
    on: true,
  },
  {
    key: "two_step_leave",
    name: "Two-step leave approval",
    desc: "Manager first, then HR final approval",
    on: false,
  },
  {
    key: "team_lead_module",
    name: "Team Lead module",
    desc: "My Team tab and team-scoped summaries",
    on: false,
  },
];

const TAB_FLOW: Record<TabId, string> = {
  roles: "Step 1 — Create or select a role (e.g. Manager, Team Lead, custom role)",
  permissions: "Step 2 — Tick which features this role can use",
  assign: "Step 3 — Configure org hierarchy: departments, managers, teams, and reporting lines",
  features: "Step 4 — Turn modules ON/OFF for entire company",
  settings: "Step 5 — Workflow rules (leave steps, defaults)",
};

function clonePermissionMap() {
  const out: Record<string, Set<string>> = {};
  for (const [roleId, set] of Object.entries(DEFAULT_PERMISSIONS)) {
    out[roleId] = new Set(set);
  }
  return out;
}

export default function SystemControlDemoPage() {
  const [activeTab, setActiveTab] = useState<TabId>("roles");
  const [selectedRoleId, setSelectedRoleId] = useState("manager");
  const [permRoleId, setPermRoleId] = useState("manager");
  const [permissions, setPermissions] = useState(clonePermissionMap);
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({
    attendance: true,
    leave: true,
  });
  const [globalFeatures, setGlobalFeatures] = useState(GLOBAL_FEATURES);
  const [twoStepLeave, setTwoStepLeave] = useState(false);
  const [toast, setToast] = useState("");
  const [showNewRole, setShowNewRole] = useState(false);
  const [customRoles, setCustomRoles] = useState<RoleDemo[]>([]);

  const allRoles = useMemo(() => [...ROLES, ...customRoles], [customRoles]);
  const selectedRole = allRoles.find((r) => r.id === selectedRoleId) || allRoles[0];
  const permRole = allRoles.find((r) => r.id === permRoleId) || allRoles[0];

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(""), 2800);
  }

  function togglePermission(roleId: string, key: string) {
    if (roleId === "super_admin" || roleId === "ceo") return;
    setPermissions((prev) => {
      const next = { ...prev };
      const set = new Set(prev[roleId] || []);
      if (set.has(key)) set.delete(key);
      else set.add(key);
      next[roleId] = set;
      return next;
    });
  }

  function toggleModule(roleId: string, module: FeatureModule, checked: boolean) {
    if (roleId === "super_admin" || roleId === "ceo") return;
    setPermissions((prev) => {
      const next = { ...prev };
      const set = new Set(prev[roleId] || []);
      for (const p of module.permissions) {
        if (checked) set.add(p.key);
        else set.delete(p.key);
      }
      next[roleId] = set;
      return next;
    });
  }

  function handleSavePermissions() {
    showToast(`Permissions saved for "${permRole.name}" (demo — would write to database)`);
  }

  function handleCreateRole(name: string, cloneFrom: string) {
    const slug = name.toLowerCase().replace(/\s+/g, "_");
    const clone = allRoles.find((r) => r.id === cloneFrom);
    const newRole: RoleDemo = {
      id: slug,
      name,
      slug,
      portal: clone?.portal || "Admin shell",
      scope: clone?.scope || "Own department",
      level: 50,
      users: 0,
      description: `Custom role cloned from ${clone?.name || "Manager"}.`,
    };
    setCustomRoles((prev) => [...prev, newRole]);
    setPermissions((prev) => ({
      ...prev,
      [slug]: new Set(prev[cloneFrom] || []),
    }));
    setSelectedRoleId(slug);
    setShowNewRole(false);
    showToast(`Role "${name}" created — now set permissions in next tab`);
    setActiveTab("permissions");
    setPermRoleId(slug);
  }

  const rolePermCount = (permissions[permRoleId] || new Set()).size;

  return (
    <LayoutDashboard>
      <div className={styles.page}>
        <div className={styles.demoBanner}>
          <span className={styles.demoBadge}>Static demo</span>
          <div>
            <strong>System Control — interactive preview.</strong> Buttons save locally only
            (no database). This shows the full flow: create role → tick permissions → assign
            employees → toggle global features. Final build will connect to MySQL tables from
            the access control plan.
          </div>
        </div>

        <div className={styles.headerCard}>
          <div>
            <h1 className={styles.headerTitle}>System Control</h1>
            <p className={styles.headerSub}>
              Centralized roles, permissions, and employee access for Interact HRM
            </p>
          </div>
          <div className={styles.headerMeta}>
            Logged in as <strong>Super Admin</strong>
            <br />
            8 roles · 62 features · 187 employees
          </div>
        </div>

        <div className={styles.statGrid}>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{allRoles.length}</div>
            <div className={styles.statLabel}>Roles</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue}>62</div>
            <div className={styles.statLabel}>Features</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue}>11</div>
            <div className={styles.statLabel}>Demo employees</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{rolePermCount}</div>
            <div className={styles.statLabel}>Permissions (selected role)</div>
          </div>
        </div>

        <div className={styles.flowCard}>
          <p className={styles.flowTitle}>How it works — {TAB_FLOW[activeTab]}</p>
          <div className={styles.flowSteps}>
            <span className={styles.flowStep}>1. Roles</span>
            <span className={styles.flowArrow}>→</span>
            <span className={styles.flowStep}>2. Permissions ✓</span>
            <span className={styles.flowArrow}>→</span>
            <span className={styles.flowStep}>3. Org hierarchy</span>
            <span className={styles.flowArrow}>→</span>
            <span className={styles.flowStep}>4. Live menu & API access</span>
          </div>
        </div>

        <div className={styles.tabBar}>
          {(
            [
              ["roles", "Roles"],
              ["permissions", "Permissions"],
              ["assign", "Assign Users"],
              ["features", "Features"],
              ["settings", "Settings"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`${styles.tab} ${activeTab === id ? styles.tabActive : ""}`}
              onClick={() => setActiveTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        {/* TAB 1 — ROLES */}
        {activeTab === "roles" && (
          <div className={styles.panel}>
            <div className={styles.split}>
              <div className={styles.sideList}>
                <div className={styles.sideListHeader}>
                  <span className={styles.sideListTitle}>All roles</span>
                  <button
                    type="button"
                    className={styles.btnPrimary}
                    style={{ padding: "6px 12px", fontSize: "0.8rem" }}
                    onClick={() => setShowNewRole(true)}
                  >
                    + New
                  </button>
                </div>
                {allRoles.map((role) => (
                  <button
                    key={role.id}
                    type="button"
                    className={`${styles.roleItem} ${
                      selectedRoleId === role.id ? styles.roleItemActive : ""
                    }`}
                    onClick={() => setSelectedRoleId(role.id)}
                  >
                    <div className={styles.roleItemName}>
                      {role.name}
                      {role.system ? " 🔒" : ""}
                    </div>
                    <div className={styles.roleItemMeta}>
                      {role.portal} · {role.users} users
                    </div>
                  </button>
                ))}
              </div>

              <div className={styles.detailPane}>
                <h2 style={{ margin: "0 0 8px", fontSize: "1.2rem" }}>{selectedRole.name}</h2>
                <p style={{ color: "#718096", margin: "0 0 18px", fontSize: "0.9rem" }}>
                  {selectedRole.description}
                </p>

                <div className={styles.fieldGrid}>
                  <div className={styles.field}>
                    <label>Display name</label>
                    <input defaultValue={selectedRole.name} readOnly={selectedRole.system} />
                  </div>
                  <div className={styles.field}>
                    <label>Slug (system id)</label>
                    <input defaultValue={selectedRole.slug} readOnly />
                  </div>
                  <div className={styles.field}>
                    <label>Portal / dashboard</label>
                    <select defaultValue={selectedRole.portal} disabled={selectedRole.system}>
                      <option>Admin shell</option>
                      <option>Employee shell</option>
                      <option>Team Lead shell</option>
                    </select>
                  </div>
                  <div className={styles.field}>
                    <label>Data scope</label>
                    <select defaultValue={selectedRole.scope} disabled={selectedRole.system}>
                      <option>All company</option>
                      <option>Own department</option>
                      <option>Own team</option>
                      <option>Self only</option>
                    </select>
                  </div>
                  <div className={styles.field}>
                    <label>Hierarchy level</label>
                    <input type="number" defaultValue={selectedRole.level} readOnly={selectedRole.system} />
                  </div>
                  <div className={styles.field}>
                    <label>Employees with this role</label>
                    <input defaultValue={String(selectedRole.users)} readOnly />
                  </div>
                </div>

                <div className={styles.chipRow}>
                  <span className={`${styles.chip} ${styles.chipBlue}`}>{selectedRole.portal}</span>
                  <span className={`${styles.chip} ${styles.chipGreen}`}>{selectedRole.scope}</span>
                  {selectedRole.system && (
                    <span className={`${styles.chip} ${styles.chipPurple}`}>System role</span>
                  )}
                </div>

                <div className={styles.btnRow}>
                  <button
                    type="button"
                    className={styles.btnPrimary}
                    onClick={() => {
                      setPermRoleId(selectedRoleId);
                      setActiveTab("permissions");
                    }}
                  >
                    Edit permissions →
                  </button>
                  <button
                    type="button"
                    className={styles.btnSecondary}
                    onClick={() =>
                      showToast(`Clone "${selectedRole.name}" (demo)`)
                    }
                  >
                    Clone role
                  </button>
                  {selectedRole.system ? (
                    <button type="button" className={styles.btnDanger} disabled>
                      Cannot delete system role
                    </button>
                  ) : (
                    <button type="button" className={styles.btnSecondary}>
                      Delete role
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2 — PERMISSIONS */}
        {activeTab === "permissions" && (
          <div className={styles.panel}>
            <div className={styles.toolbar}>
              <div className={styles.toolbarLeft}>
                <label htmlFor="perm-role">Editing role:</label>
                <select
                  id="perm-role"
                  value={permRoleId}
                  onChange={(e) => setPermRoleId(e.target.value)}
                >
                  {allRoles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
                <span style={{ fontSize: "0.85rem", color: "#718096" }}>
                  {rolePermCount} permissions enabled
                </span>
              </div>
              <button type="button" className={styles.btnPrimary} onClick={handleSavePermissions}>
                Save changes
              </button>
            </div>

            <div className={styles.panelBody}>
              {(permRoleId === "super_admin" || permRoleId === "ceo") && (
                <div className={styles.previewBox}>
                  <strong>Super Admin / CEO</strong>
                  All permissions are always ON and cannot be unchecked (full access).
                </div>
              )}

              {FEATURE_MODULES.map((module) => {
                const rolePerms = permissions[permRoleId] || new Set();
                const allChecked = module.permissions.every((p) => rolePerms.has(p.key));
                const someChecked = module.permissions.some((p) => rolePerms.has(p.key));
                const isOpen = expandedModules[module.id] !== false;

                return (
                  <div key={module.id} className={styles.accordion}>
                    <button
                      type="button"
                      className={styles.accordionHead}
                      onClick={() =>
                        setExpandedModules((prev) => ({
                          ...prev,
                          [module.id]: !isOpen,
                        }))
                      }
                    >
                      <span>
                        {isOpen ? "▼" : "▶"} {module.name}
                        {someChecked && (
                          <span style={{ color: "#00b8a9", marginLeft: 8, fontSize: "0.8rem" }}>
                            ({module.permissions.filter((p) => rolePerms.has(p.key)).length}/
                            {module.permissions.length})
                          </span>
                        )}
                      </span>
                      <span
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                        role="presentation"
                      >
                        <label style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                          <input
                            type="checkbox"
                            checked={allChecked}
                            disabled={permRoleId === "super_admin" || permRoleId === "ceo"}
                            onChange={(e) =>
                              toggleModule(permRoleId, module, e.target.checked)
                            }
                            style={{ marginRight: 6 }}
                          />
                          Select all
                        </label>
                      </span>
                    </button>
                    {isOpen && (
                      <div className={styles.accordionBody}>
                        {module.permissions.map((perm) => (
                          <label key={perm.key} className={styles.permRow}>
                            <input
                              type="checkbox"
                              checked={rolePerms.has(perm.key)}
                              disabled={permRoleId === "super_admin" || permRoleId === "ceo"}
                              onChange={() => togglePermission(permRoleId, perm.key)}
                            />
                            <span>
                              <div className={styles.permLabel}>{perm.label}</div>
                              <div className={styles.permKey}>{perm.key}</div>
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              <div className={styles.previewBox}>
                <strong>After save — what happens for users with this role</strong>
                Sidebar shows only pages matching checked keys. APIs return 403 if permission
                missing. Data filtered by scope: {permRole.scope}.
              </div>
            </div>
          </div>
        )}

        {/* TAB 3 — ASSIGN USERS / ORG HIERARCHY */}
        {activeTab === "assign" && (
          <div className={styles.panel}>
            <div className={styles.panelBody}>
              <AssignHierarchyPanel
                roles={allRoles.map((r) => ({ id: r.id, name: r.name }))}
                onToast={showToast}
              />
            </div>
          </div>
        )}

        {/* TAB 4 — FEATURES */}
        {activeTab === "features" && (
          <div className={styles.panel}>
            <div className={styles.panelBody}>
              <p style={{ color: "#718096", marginTop: 0, fontSize: "0.9rem" }}>
                Global switches — if OFF, feature hidden for every role even if permission is
                checked.
              </p>
              {globalFeatures.map((feat, idx) => (
                <div key={feat.key} className={styles.featureRow}>
                  <div>
                    <div className={styles.featureName}>{feat.name}</div>
                    <div className={styles.featureDesc}>{feat.desc}</div>
                  </div>
                  <label className={styles.toggle}>
                    <input
                      type="checkbox"
                      checked={feat.on}
                      onChange={() => {
                        setGlobalFeatures((prev) =>
                          prev.map((f, i) => (i === idx ? { ...f, on: !f.on } : f)),
                        );
                        showToast(
                          `${feat.name} turned ${feat.on ? "OFF" : "ON"} (demo)`,
                        );
                      }}
                    />
                    <span className={styles.toggleSlider} />
                  </label>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 5 — SETTINGS */}
        {activeTab === "settings" && (
          <div className={styles.panel}>
            <div className={styles.panelBody}>
              <div className={styles.settingsSection}>
                <h3>Leave workflow</h3>
                <div className={styles.settingRow}>
                  <div>
                    <div className={styles.settingLabel}>Two-step approval</div>
                    <div className={styles.settingHint}>
                      Manager approves first, then HR gives final approval
                    </div>
                  </div>
                  <label className={styles.toggle}>
                    <input
                      type="checkbox"
                      checked={twoStepLeave}
                      onChange={() => {
                        setTwoStepLeave(!twoStepLeave);
                        showToast(
                          `Two-step leave ${!twoStepLeave ? "enabled" : "disabled"} (demo)`,
                        );
                      }}
                    />
                    <span className={styles.toggleSlider} />
                  </label>
                </div>
              </div>

              <div className={styles.settingsSection}>
                <h3>Defaults</h3>
                <div className={styles.fieldGrid}>
                  <div className={styles.field}>
                    <label>Default role for new employees</label>
                    <select defaultValue="officer">
                      {allRoles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className={styles.field}>
                    <label>Who can open System Control</label>
                    <select defaultValue="super_admin">
                      <option value="super_admin">Super Admin only</option>
                      <option value="ceo">CEO + Super Admin</option>
                      <option value="hr">HR + Super Admin</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className={styles.btnRow}>
                <button
                  type="button"
                  className={styles.btnPrimary}
                  onClick={() => showToast("Settings saved (demo)")}
                >
                  Save settings
                </button>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={() =>
                    showToast("Feature registry synced from code (demo)")
                  }
                >
                  Sync feature registry
                </button>
              </div>
            </div>
          </div>
        )}

        {showNewRole && (
          <NewRoleModal
            roles={allRoles}
            onClose={() => setShowNewRole(false)}
            onCreate={handleCreateRole}
          />
        )}

        {toast && <div className={styles.toast}>{toast}</div>}
      </div>
    </LayoutDashboard>
  );
}

function NewRoleModal({
  roles,
  onClose,
  onCreate,
}: {
  roles: RoleDemo[];
  onClose: () => void;
  onCreate: (name: string, cloneFrom: string) => void;
}) {
  const [name, setName] = useState("");
  const [cloneFrom, setCloneFrom] = useState("manager");

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 999,
        padding: 20,
      }}
      onClick={onClose}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
      role="presentation"
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 14,
          padding: 24,
          maxWidth: 420,
          width: "100%",
          boxShadow: "0 20px 50px rgba(0,0,0,0.2)",
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-role-title"
      >
        <h2 id="new-role-title" style={{ margin: "0 0 16px", fontSize: "1.15rem" }}>
          Create new role
        </h2>
        <div className={styles.field} style={{ marginBottom: 14 }}>
          <label>Role name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Warehouse Manager"
          />
        </div>
        <div className={styles.field} style={{ marginBottom: 20 }}>
          <label>Clone permissions from</label>
          <select value={cloneFrom} onChange={(e) => setCloneFrom(e.target.value)}>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.btnRow} style={{ marginTop: 0, paddingTop: 0, border: "none" }}>
          <button
            type="button"
            className={styles.btnPrimary}
            disabled={!name.trim()}
            onClick={() => onCreate(name.trim(), cloneFrom)}
          >
            Create & edit permissions
          </button>
          <button type="button" className={styles.btnSecondary} onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
