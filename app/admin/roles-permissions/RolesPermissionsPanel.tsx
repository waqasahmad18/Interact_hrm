"use client";

import React, { useMemo, useState } from "react";
import styles from "./system-control-demo.module.css";
import SearchableSelect, { type SelectGroup, type SelectOption } from "./SearchableSelect";
import type { DemoEmployee, FeatureModule, RoleDef } from "./system-control-data";
import { groupRolesByOrgSection, roleMeta } from "./system-control-data";

export type SystemControlCaps = {
  systemPermissionsEdit: boolean;
  systemUsersAssign: boolean;
  systemOrgChartEdit: boolean;
  systemFeaturesEdit: boolean;
  systemControlOpen: boolean;
};

type Props = {
  allRoles: RoleDef[];
  employees: DemoEmployee[];
  initialRoleId?: string;
  permissions: Record<string, Set<string>>;
  /** employeeId → custom keys; missing key = using role defaults */
  employeePermissions: Record<string, string[]>;
  modules: FeatureModule[];
  expandedModules: Record<string, boolean>;
  onToggleModuleExpand: (id: string) => void;
  onTogglePermission: (roleId: string, key: string) => void;
  onToggleModuleForRole: (roleId: string, module: FeatureModule, checked: boolean) => void;
  onToggleEmployeePermission: (employeeId: string, key: string) => void;
  onToggleModuleForEmployee: (
    employeeId: string,
    module: FeatureModule,
    checked: boolean,
  ) => void;
  onResetAll: () => void;
  onSaveRole: (roleId: string) => void;
  onSaveEmployee: (employeeId: string) => void;
  onClearEmployeeOverrides: (employeeId: string) => void;
  onAssignEmployees: (employeeIds: string[], roleId: string) => void;
  onUnassignEmployees: (employeeIds: string[], roleId: string) => void;
  isRoleLocked: (roleId: string) => boolean;
  isCustomRole: (id: string) => boolean;
  employeeCountByRole: (roleId: string) => number;
  caps: SystemControlCaps;
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

function explicitSlugs(emp: DemoEmployee): string[] {
  if (Array.isArray(emp.accessRoleSlugs) && emp.accessRoleSlugs.length) {
    return emp.accessRoleSlugs.map((s) => String(s).trim()).filter(Boolean);
  }
  const one =
    emp.accessRoleSlug != null && String(emp.accessRoleSlug).trim()
      ? String(emp.accessRoleSlug).trim()
      : null;
  if (one) return [one];
  // Fallback: Add Employee org role (mapped to System Control slug) until sync runs
  if (emp.roleId) return [String(emp.roleId)];
  return [];
}

function explicitSlug(emp: DemoEmployee) {
  return explicitSlugs(emp)[0] || null;
}

function employeeHasRole(emp: DemoEmployee, roleId: string) {
  return explicitSlugs(emp).includes(roleId);
}

export default function RolesPermissionsPanel({
  allRoles,
  employees,
  initialRoleId,
  permissions,
  employeePermissions,
  modules,
  onTogglePermission,
  onToggleModuleForRole,
  onToggleEmployeePermission,
  onToggleModuleForEmployee,
  onResetAll,
  onSaveRole,
  onSaveEmployee,
  onClearEmployeeOverrides,
  onAssignEmployees,
  onUnassignEmployees,
  isRoleLocked,
  isCustomRole,
  employeeCountByRole,
  caps,
}: Props) {
  const [permSearch, setPermSearch] = useState("");
  const [pickEmployeeId, setPickEmployeeId] = useState("");
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [selectedAssignedIds, setSelectedAssignedIds] = useState<string[]>([]);
  /** When set, matrix edits that employee's custom permissions. */
  const [focusEmployeeId, setFocusEmployeeId] = useState<string | null>(null);

  const canEditPerms = caps.systemPermissionsEdit;
  const canAssign = caps.systemUsersAssign;

  React.useEffect(() => {
    if (!employees.length) return;
    setPickEmployeeId((prev) => {
      if (prev && employees.some((e) => e.id === prev)) return prev;
      return employees[0]?.id ?? "";
    });
  }, [employees]);

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
            meta: `${count} assigned${custom ? " · custom" : ""}`,
          };
        }),
      })),
    [roleSections, employeeCountByRole, isCustomRole],
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

  React.useEffect(() => {
    setPendingIds([]);
    setSelectedAssignedIds([]);
    setFocusEmployeeId(null);
  }, [selectedRoleId]);

  const activeRole =
    matrixRoles.find((r) => r.id === selectedRoleId) ?? matrixRoles[0];
  const activeRoleId = activeRole?.id ?? "";
  const locked = activeRoleId ? isRoleLocked(activeRoleId) : false;

  const focusEmployee = focusEmployeeId
    ? employees.find((e) => e.id === focusEmployeeId) || null
    : null;
  const editingUser = Boolean(focusEmployee);
  const userHasCustom =
    editingUser &&
    focusEmployeeId != null &&
    Object.prototype.hasOwnProperty.call(employeePermissions, focusEmployeeId);

  const roleSet = (activeRoleId && permissions[activeRoleId]) || new Set<string>();
  const activeSet: Set<string> = editingUser
    ? new Set(
        userHasCustom
          ? employeePermissions[focusEmployeeId!] || []
          : [...roleSet],
      )
    : roleSet;

  const assignedUsers = useMemo(
    () =>
      employees
        .filter((e) => employeeHasRole(e, activeRoleId))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [employees, activeRoleId],
  );

  const assignableOptions: SelectOption[] = useMemo(
    () =>
      employees
        .filter((e) => !employeeHasRole(e, activeRoleId))
        .map((emp) => {
          const assigned = explicitSlugs(emp);
          return {
            value: emp.id,
            label: emp.name,
            meta: [
              `ID ${emp.id}`,
              emp.pseudonym ? `P.Name: ${emp.pseudonym}` : null,
              emp.departmentName || null,
              assigned.length
                ? `Also on: ${assigned.map((s) => roleMeta(s, allRoles).name).join(", ")}`
                : emp.legacyRole
                  ? `Default from HR: ${emp.legacyRole}`
                  : "Not assigned",
            ]
              .filter(Boolean)
              .join(" · "),
          };
        }),
    [employees, allRoles, activeRoleId],
  );

  const totalPerms = useMemo(
    () => modules.reduce((sum, m) => sum + m.permissions.length, 0),
    [modules],
  );

  const matrixLocked = locked || !canEditPerms;

  const grantedCount = locked
    ? totalPerms
    : modules.reduce(
        (sum, m) => sum + m.permissions.filter((p) => activeSet.has(p.key)).length,
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
    return module.permissions.every((p) => activeSet.has(p.key));
  }

  function addPendingFromPicker() {
    if (!pickEmployeeId || !canAssign) return;
    setPendingIds((prev) =>
      prev.includes(pickEmployeeId) ? prev : [...prev, pickEmployeeId],
    );
  }

  function removePending(id: string) {
    setPendingIds((prev) => prev.filter((x) => x !== id));
  }

  function handleAssign() {
    if (!activeRoleId || !canAssign) return;
    const ids = pendingIds.length
      ? pendingIds
      : pickEmployeeId
        ? [pickEmployeeId]
        : [];
    if (!ids.length) return;
    onAssignEmployees(ids, activeRoleId);
    setPendingIds([]);
  }

  function toggleAssignedSelect(id: string) {
    setSelectedAssignedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function handleUnassignSelected() {
    if (!selectedAssignedIds.length || !canAssign || !activeRoleId) return;
    onUnassignEmployees(selectedAssignedIds, activeRoleId);
    setSelectedAssignedIds([]);
    if (focusEmployeeId && selectedAssignedIds.includes(focusEmployeeId)) {
      setFocusEmployeeId(null);
    }
  }

  function handleUnassignOne(id: string) {
    if (!canAssign || !activeRoleId) return;
    onUnassignEmployees([id], activeRoleId);
    setSelectedAssignedIds((prev) => prev.filter((x) => x !== id));
    if (focusEmployeeId === id) setFocusEmployeeId(null);
  }

  function onToggleKey(key: string) {
    if (matrixLocked) return;
    if (editingUser && focusEmployeeId) {
      onToggleEmployeePermission(focusEmployeeId, key);
    } else {
      onTogglePermission(activeRoleId, key);
    }
  }

  function onToggleModule(module: FeatureModule, checked: boolean) {
    if (matrixLocked) return;
    if (editingUser && focusEmployeeId) {
      onToggleModuleForEmployee(focusEmployeeId, module, checked);
    } else {
      onToggleModuleForRole(activeRoleId, module, checked);
    }
  }

  const pendingPeople = pendingIds
    .map((id) => employees.find((e) => e.id === id))
    .filter(Boolean) as DemoEmployee[];

  return (
    <div className={styles.permWrap}>
      <div className={styles.permHeader}>
        <div>
          <h2 className={styles.matrixTitle}>Roles &amp; Permissions</h2>
          <p className={styles.matrixSubtitle}>
            Role defaults apply to everyone on that role. Click an assigned user to set{" "}
            <strong>different permissions for that person only</strong>.
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

      {!canEditPerms && (
        <div className={styles.permLockNote}>
          View only — you can open System Control but cannot edit permissions (
          <code>system.permissions.edit</code> required).
        </div>
      )}

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
          label="Add user to this role"
          value={pickEmployeeId}
          onChange={setPickEmployeeId}
          options={assignableOptions}
          searchPlaceholder="Search by name or P.Name…"
          emptyText="No employees available to assign"
          filterOption={employeeFilter}
          disabled={!canAssign || employees.length === 0 || !activeRoleId}
        />
        <div className={styles.permAssignBtnCol}>
          <span className={styles.permSelectLabel} aria-hidden="true">
            &nbsp;
          </span>
          <div className={styles.permAssignBtnRow}>
            <button
              type="button"
              className={styles.btnOutlinePurple}
              disabled={!canAssign || !pickEmployeeId || !activeRoleId}
              onClick={addPendingFromPicker}
            >
              Add to list
            </button>
            <button
              type="button"
              className={styles.permAssignBtn}
              disabled={
                !canAssign ||
                (!pendingIds.length && !pickEmployeeId) ||
                !activeRoleId ||
                locked
              }
              onClick={handleAssign}
            >
              Assign{pendingIds.length > 1 ? ` (${pendingIds.length})` : ""}
            </button>
          </div>
        </div>
      </div>

      {pendingPeople.length > 0 && (
        <div className={styles.permAssignedBar}>
          <div className={styles.permAssignedHead}>
            <strong>Ready to assign</strong>
            <span className={styles.permAssignedCount}>{pendingPeople.length}</span>
          </div>
          <div className={styles.permAssignedChips}>
            {pendingPeople.map((emp) => (
              <span key={emp.id} className={styles.permUserChip}>
                {emp.name}
                <button
                  type="button"
                  className={styles.permUserChipX}
                  aria-label={`Remove ${emp.name} from list`}
                  onClick={() => removePending(emp.id)}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className={styles.permAssignedBar}>
        <div className={styles.permAssignedHead}>
          <strong>
            Assigned users
            {activeRole ? ` — ${activeRole.name}` : ""}
          </strong>
          <span className={styles.permAssignedCount}>{assignedUsers.length}</span>
          {assignedUsers.length > 0 && canAssign && (
            <button
              type="button"
              className={styles.permUnassignBtn}
              disabled={!selectedAssignedIds.length}
              onClick={handleUnassignSelected}
            >
              Unassign selected
              {selectedAssignedIds.length ? ` (${selectedAssignedIds.length})` : ""}
            </button>
          )}
        </div>
        {assignedUsers.length === 0 ? (
          <p className={styles.permAssignedEmpty}>
            No users assigned to this role yet. Add one or more users above.
          </p>
        ) : (
          <div className={styles.permAssignedChips}>
            {assignedUsers.map((emp) => {
              const selected = selectedAssignedIds.includes(emp.id);
              const focused = focusEmployeeId === emp.id;
              const custom = Object.prototype.hasOwnProperty.call(
                employeePermissions,
                emp.id,
              );
              return (
                <label
                  key={emp.id}
                  className={`${styles.permUserChip} ${selected ? styles.permUserChipOn : ""} ${focused ? styles.permUserChipFocus : ""}`}
                  title="Click name to edit this user's permissions"
                >
                  {canAssign && (
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleAssignedSelect(emp.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  )}
                  <button
                    type="button"
                    className={styles.permUserChipName}
                    onClick={() =>
                      setFocusEmployeeId((prev) => (prev === emp.id ? null : emp.id))
                    }
                  >
                    {emp.name}
                    <span className={styles.permUserChipMeta}>
                      #{emp.id}
                      {custom ? " · custom" : ""}
                    </span>
                  </button>
                  {canAssign && (
                    <button
                      type="button"
                      className={styles.permUserChipX}
                      aria-label={`Unassign ${emp.name}`}
                      onClick={(e) => {
                        e.preventDefault();
                        handleUnassignOne(emp.id);
                      }}
                    >
                      ×
                    </button>
                  )}
                </label>
              );
            })}
          </div>
        )}
        <p className={styles.permAssignedHint}>
          Tip: click a user&apos;s name to edit their personal permissions (not the whole role).
        </p>
      </div>

      <div className={styles.permBody}>
        <div className={styles.permBodyHead}>
          <div className={styles.permBodyTitle}>
            <span
              className={styles.permRoleChipDot}
              style={{ background: accentOf(activeRole) }}
            />
            {editingUser ? (
              <>
                Permissions for <strong>{focusEmployee?.name}</strong>
                <span className={styles.permLockBadge}>
                  {userHasCustom ? "Custom" : "From role"}
                </span>
                <button
                  type="button"
                  className={styles.btnOutlinePurple}
                  style={{ marginLeft: 8, minHeight: 28, padding: "0 10px", fontSize: 12 }}
                  onClick={() => setFocusEmployeeId(null)}
                >
                  Back to role defaults
                </button>
              </>
            ) : (
              <>
                Role defaults — <strong>{activeRole?.name ?? "—"}</strong>
                {locked && <span className={styles.permLockBadge}>Locked</span>}
              </>
            )}
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

        {editingUser && (
          <div className={styles.permUserBanner}>
            Changes here apply only to <strong>{focusEmployee?.name}</strong>, even if others
            share the same role.{" "}
            {userHasCustom && canEditPerms && (
              <button
                type="button"
                className={styles.permLinkBtn}
                onClick={() => onClearEmployeeOverrides(focusEmployeeId!)}
              >
                Reset to role defaults
              </button>
            )}
          </div>
        )}

        {locked && !editingUser && (
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
                  {!matrixLocked && (
                    <button
                      type="button"
                      className={`${styles.permAllBtn} ${all ? styles.permAllBtnOn : ""}`}
                      onClick={() => onToggleModule(module, !all)}
                    >
                      {all ? "Clear all" : "Select all"}
                    </button>
                  )}
                </header>

                <div className={styles.permGrid}>
                  {module.permissions.map((perm) => {
                    const checked = locked || activeSet.has(perm.key);
                    return (
                      <label
                        key={perm.key}
                        className={`${styles.permItem} ${checked ? styles.permItemOn : ""} ${matrixLocked ? styles.permItemLocked : ""}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={matrixLocked}
                          onChange={() => onToggleKey(perm.key)}
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
          <span className={styles.legendLocked} />{" "}
          <code>system.control.access</code> only opens this page. Edit needs{" "}
          <code>system.permissions.edit</code> / <code>system.users.assign</code>.
        </p>
        <div className={styles.permFooterActions}>
          {!editingUser && (
            <button
              type="button"
              className={styles.btnOutlinePurple}
              onClick={onResetAll}
              disabled={!canEditPerms}
            >
              Reset role to Default
            </button>
          )}
          <button
            type="button"
            className={styles.btnSolidPurple}
            disabled={
              !canEditPerms ||
              (!editingUser && !activeRoleId) ||
              (editingUser && !focusEmployeeId)
            }
            onClick={() => {
              if (editingUser && focusEmployeeId) onSaveEmployee(focusEmployeeId);
              else onSaveRole(activeRoleId);
            }}
          >
            {editingUser ? "Save user permissions" : "Save role permissions"}
          </button>
        </div>
      </div>
    </div>
  );
}
