"use client";

import React, { useMemo, useState } from "react";
import styles from "./system-control-demo.module.css";
import SearchableSelect, { type SelectGroup, type SelectOption } from "./SearchableSelect";
import type { DemoEmployee, FeatureModule, RoleDef } from "./system-control-data";
import { groupRolesByOrgSection, roleMeta } from "./system-control-data";

type Props = {
  allRoles: RoleDef[];
  employees: DemoEmployee[];
  initialRoleId?: string;
  permissions: Record<string, Set<string>>;
  modules: FeatureModule[];
  expandedModules: Record<string, boolean>;
  onToggleModuleExpand: (id: string) => void;
  onTogglePermission: (roleId: string, key: string) => void;
  onToggleModuleForRole: (roleId: string, module: FeatureModule, checked: boolean) => void;
  onResetAll: () => void;
  onSave: () => void;
  onAssignEmployee: (employeeId: string, roleId: string) => void;
  isRoleLocked: (roleId: string) => boolean;
  isCustomRole: (id: string) => boolean;
  employeeCountByRole: (roleId: string) => number;
};

function accentOf(role: RoleDef | undefined) {
  return role?.accent || "#9333ea";
}

function roleFilter(opt: SelectOption, query: string) {
  return opt.label.toLowerCase().includes(query);
}

function employeeFilter(opt: SelectOption, query: string) {
  const hay = `${opt.label} ${opt.meta ?? ""}`.toLowerCase();
  return hay.includes(query);
}

export default function RolesPermissionsPanel({
  allRoles,
  employees,
  initialRoleId,
  permissions,
  modules,
  onTogglePermission,
  onToggleModuleForRole,
  onResetAll,
  onSave,
  onAssignEmployee,
  isRoleLocked,
  isCustomRole,
  employeeCountByRole,
}: Props) {
  const [permSearch, setPermSearch] = useState("");
  const [assignEmployeeId, setAssignEmployeeId] = useState(() => employees[0]?.id ?? "");

  const matrixRoles = useMemo(
    () => allRoles.filter((r) => !isRoleLocked(r.id)),
    [allRoles, isRoleLocked],
  );

  const roleSections = useMemo(
    () => groupRolesByOrgSection(matrixRoles),
    [matrixRoles],
  );

  const roleSelectGroups: SelectGroup[] = useMemo(
    () =>
      roleSections.map((section) => ({
        id: section.id,
        label: section.title,
        options: section.roles.map((role) => {
          const count = employeeCountByRole(role.id);
          const custom = isCustomRole(role.id);
          return {
            value: role.id,
            label: role.name,
            accent: accentOf(role),
            meta: `${count} ${count === 1 ? "user" : "users"}${custom ? " · custom" : ""}`,
          };
        }),
      })),
    [roleSections, employeeCountByRole, isCustomRole],
  );

  const employeeOptions: SelectOption[] = useMemo(
    () =>
      employees.map((emp) => ({
        value: emp.id,
        label: emp.name,
        meta: [
          emp.pseudonym ? `P.Name: ${emp.pseudonym}` : null,
          `Current: ${roleMeta(emp.roleId, allRoles).name}`,
        ]
          .filter(Boolean)
          .join(" · "),
      })),
    [employees, allRoles],
  );

  const [selectedRoleId, setSelectedRoleId] = useState<string>(() => {
    if (initialRoleId && matrixRoles.some((r) => r.id === initialRoleId)) {
      return initialRoleId;
    }
    return matrixRoles[0]?.id ?? "";
  });

  React.useEffect(() => {
    if (initialRoleId && matrixRoles.some((r) => r.id === initialRoleId)) {
      setSelectedRoleId(initialRoleId);
    }
  }, [initialRoleId, matrixRoles]);

  const activeRole =
    matrixRoles.find((r) => r.id === selectedRoleId) ?? matrixRoles[0];
  const activeRoleId = activeRole?.id ?? "";
  const locked = activeRoleId ? isRoleLocked(activeRoleId) : false;
  const roleSet = (activeRoleId && permissions[activeRoleId]) || new Set<string>();

  const assignEmployee = employees.find((e) => e.id === assignEmployeeId);
  const assignChanged =
    Boolean(assignEmployee && activeRoleId && assignEmployee.roleId !== activeRoleId);

  const totalPerms = useMemo(
    () => modules.reduce((sum, m) => sum + m.permissions.length, 0),
    [modules],
  );

  const grantedCount = locked
    ? totalPerms
    : modules.reduce(
        (sum, m) => sum + m.permissions.filter((p) => roleSet.has(p.key)).length,
        0,
      );

  const filteredModules = useMemo(() => {
    const q = permSearch.trim().toLowerCase();
    if (!q) return modules;
    return modules
      .map((m) => ({
        ...m,
        permissions: m.permissions.filter(
          (p) =>
            p.label.toLowerCase().includes(q) ||
            p.key.toLowerCase().includes(q) ||
            p.desc.toLowerCase().includes(q) ||
            m.name.toLowerCase().includes(q),
        ),
      }))
      .filter((m) => m.permissions.length > 0);
  }, [modules, permSearch]);

  function roleHasAll(module: FeatureModule) {
    if (locked) return true;
    return module.permissions.every((p) => roleSet.has(p.key));
  }

  function handleAssign() {
    if (!assignEmployeeId || !activeRoleId || !assignChanged) return;
    onAssignEmployee(assignEmployeeId, activeRoleId);
  }

  return (
    <div className={styles.permWrap}>
      <div className={styles.permHeader}>
        <div>
          <h2 className={styles.matrixTitle}>Roles &amp; Permissions</h2>
          <p className={styles.matrixSubtitle}>
            Select a role, assign it to an employee, then toggle what it can access.
          </p>
        </div>
        <div className={styles.matrixSearchWrap}>
          <span className={styles.matrixSearchIcon}>⌕</span>
          <input
            className={styles.matrixSearch}
            placeholder="Search permission…"
            value={permSearch}
            onChange={(e) => setPermSearch(e.target.value)}
          />
        </div>
      </div>

      <div className={styles.permPickerBar}>
        <SearchableSelect
          id="perm-role"
          label="Select role"
          value={selectedRoleId}
          onChange={setSelectedRoleId}
          groups={roleSelectGroups}
          searchPlaceholder="Search by role name…"
          emptyText="No roles match your search"
          filterOption={roleFilter}
        />
        <SearchableSelect
          id="perm-employee"
          label="Assign to user"
          value={assignEmployeeId}
          onChange={setAssignEmployeeId}
          options={employeeOptions}
          searchPlaceholder="Search by name or P.Name…"
          emptyText="No employees match your search"
          filterOption={employeeFilter}
          disabled={employees.length === 0}
        />
        <div className={styles.permAssignBtnCol}>
          <span className={styles.permSelectLabel} aria-hidden="true">
            &nbsp;
          </span>
          <button
            type="button"
            className={styles.permAssignBtn}
            disabled={!assignChanged}
            onClick={handleAssign}
          >
            Assign role
          </button>
        </div>
      </div>

      <div className={styles.permBody}>
        <div className={styles.permBodyHead}>
          <div className={styles.permBodyTitle}>
            <span
              className={styles.permRoleChipDot}
              style={{ background: accentOf(activeRole) }}
            />
            Configuring <strong>{activeRole?.name ?? "—"}</strong>
            {locked && <span className={styles.permLockBadge}>Locked</span>}
          </div>
          <div className={styles.permProgress}>
            <span className={styles.permProgressText}>
              {grantedCount}/{totalPerms} permissions
            </span>
            <span className={styles.permProgressBar}>
              <span
                className={styles.permProgressFill}
                style={{
                  width: totalPerms
                    ? `${Math.round((grantedCount / totalPerms) * 100)}%`
                    : "0%",
                  background: accentOf(activeRole),
                }}
              />
            </span>
          </div>
        </div>

        {locked && (
          <div className={styles.permLockNote}>
            This role has full system access by design and cannot be edited.
          </div>
        )}

        <div className={styles.permModules}>
          {filteredModules.map((module) => {
            const all = roleHasAll(module);
            return (
              <section key={module.id} className={styles.permModule}>
                <header className={styles.permModuleHead}>
                  <span className={styles.permModuleTitle}>
                    <span className={styles.matrixCatIcon}>{module.icon}</span>
                    {module.name}
                    <span className={styles.permModuleCount}>
                      {module.permissions.length}
                    </span>
                  </span>
                  {!locked && (
                    <button
                      type="button"
                      className={`${styles.permAllBtn} ${all ? styles.permAllBtnOn : ""}`}
                      onClick={() => onToggleModuleForRole(activeRoleId, module, !all)}
                    >
                      {all ? "Clear all" : "Select all"}
                    </button>
                  )}
                </header>

                <div className={styles.permGrid}>
                  {module.permissions.map((perm) => {
                    const checked = locked || roleSet.has(perm.key);
                    return (
                      <label
                        key={perm.key}
                        className={`${styles.permItem} ${checked ? styles.permItemOn : ""} ${locked ? styles.permItemLocked : ""}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={locked}
                          onChange={() => onTogglePermission(activeRoleId, perm.key)}
                        />
                        <span className={styles.permItemBox} />
                        <span className={styles.permItemLabel}>{perm.label}</span>
                        <span className={styles.infoWrap}>
                          <button
                            type="button"
                            className={styles.infoBtnMatrix}
                            aria-label={`About ${perm.label}`}
                            onClick={(e) => e.preventDefault()}
                          >
                            i
                          </button>
                          <span className={styles.infoTooltip} role="tooltip">
                            {perm.desc}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </section>
            );
          })}

          {filteredModules.length === 0 && (
            <div className={styles.matrixEmpty}>
              No permissions match “{permSearch}”.
            </div>
          )}
        </div>
      </div>

      <div className={styles.matrixFooter}>
        <p className={styles.matrixFooterHint}>
          <span className={styles.legendLocked} /> Only Super Admin is locked with
          full access. Role changes apply on the employee&apos;s next login.
        </p>
        <div className={styles.permFooterActions}>
          <button type="button" className={styles.btnOutlinePurple} onClick={onResetAll}>
            Reset to Default
          </button>
          <button type="button" className={styles.btnSolidPurple} onClick={onSave}>
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}
