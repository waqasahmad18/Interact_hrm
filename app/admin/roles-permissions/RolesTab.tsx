"use client";

import React, { useMemo } from "react";
import styles from "./system-control-demo.module.css";
import type { RoleDef } from "./system-control-data";
import { isCustomRole, isRoleLocked } from "./system-control-data";

type Props = {
  allRoles: RoleDef[];
  customRoles: RoleDef[];
  roleSearch: string;
  onRoleSearchChange: (q: string) => void;
  employeeCountByRole: (roleId: string) => number;
  permCountByRole: (roleId: string) => number;
  totalPermCount: number;
  onNewRole: () => void;
  onCloneRole: (roleId: string) => void;
  onDeleteRole: (roleId: string) => void;
  onManageRole: (roleId: string) => void;
  onUpdateLevel: (roleId: string, level: number) => void;
};

function LevelEditor({
  level,
  disabled,
  onCommit,
}: {
  level: number;
  disabled: boolean;
  onCommit: (level: number) => void;
}) {
  const [value, setValue] = React.useState(String(level));

  React.useEffect(() => {
    setValue(String(level));
  }, [level]);

  function commit(next: string) {
    const n = parseInt(next, 10);
    if (!Number.isNaN(n) && n !== level) onCommit(n);
    else setValue(String(level));
  }

  return (
    <div className={styles.levelEditor}>
      <span className={styles.levelEditorLabel}>Level</span>
      <input
        type="number"
        min={1}
        className={styles.levelEditorInput}
        value={value}
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        title={disabled ? "Super Admin level is fixed" : "Set hierarchy level (lower = higher rank)"}
      />
    </div>
  );
}

const ROLE_ACCENTS: Record<string, string> = {
  super_admin: "#dc2626",
  ceo: "#9333ea",
  hr: "#2563eb",
  accountant: "#0891b2",
  manager: "#ea580c",
  team_lead: "#16a34a",
  officer: "#64748b",
};

function accentFor(roleId: string) {
  return ROLE_ACCENTS[roleId] || "#9333ea";
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function RolesTab({
  allRoles,
  customRoles,
  roleSearch,
  onRoleSearchChange,
  employeeCountByRole,
  permCountByRole,
  totalPermCount,
  onNewRole,
  onCloneRole,
  onDeleteRole,
  onManageRole,
  onUpdateLevel,
}: Props) {
  const filtered = useMemo(
    () =>
      allRoles.filter(
        (r) =>
          !roleSearch.trim() ||
          r.name.toLowerCase().includes(roleSearch.toLowerCase()) ||
          r.id.includes(roleSearch.toLowerCase()),
      ),
    [allRoles, roleSearch],
  );

  const totalUsers = allRoles.reduce((n, r) => n + employeeCountByRole(r.id), 0);
  const systemCount = allRoles.filter((r) => r.system).length;
  const customCount = customRoles.length;

  return (
    <div className={styles.rolesTab}>
      <div className={styles.rolesToolbar}>
        <div className={styles.rolesSearchWrap}>
          <span className={styles.rolesSearchIcon}>⌕</span>
          <input
            className={styles.rolesSearchInput}
            placeholder="Search roles by name…"
            value={roleSearch}
            onChange={(e) => onRoleSearchChange(e.target.value)}
          />
        </div>
        <button type="button" className={styles.btnSolidPurple} onClick={onNewRole}>
          + Create Role
        </button>
      </div>

      <div className={styles.rolesStatStrip}>
        <div className={styles.rolesStat}>
          <span className={styles.rolesStatValue}>{allRoles.length}</span>
          <span className={styles.rolesStatLabel}>Total roles</span>
        </div>
        <div className={styles.rolesStatDivider} />
        <div className={styles.rolesStat}>
          <span className={styles.rolesStatValue}>{systemCount}</span>
          <span className={styles.rolesStatLabel}>System</span>
        </div>
        <div className={styles.rolesStatDivider} />
        <div className={styles.rolesStat}>
          <span className={styles.rolesStatValue}>{customCount}</span>
          <span className={styles.rolesStatLabel}>Custom</span>
        </div>
        <div className={styles.rolesStatDivider} />
        <div className={styles.rolesStat}>
          <span className={styles.rolesStatValue}>{totalUsers}</span>
          <span className={styles.rolesStatLabel}>Assigned users</span>
        </div>
      </div>

      <div className={styles.rolesGrid}>
        {filtered.map((role) => {
          const accent = accentFor(role.id);
          const users = employeeCountByRole(role.id);
          const perms = permCountByRole(role.id);
          const custom = isCustomRole(role.id, customRoles);
          return (
            <div key={role.id} className={styles.roleCard}>
              <div className={styles.roleCardTop}>
                <div
                  className={styles.roleCardAvatar}
                  style={{ background: `${accent}1a`, color: accent }}
                >
                  {initials(role.name)}
                </div>
                <div className={styles.roleCardHeadText}>
                  <div className={styles.roleCardName}>
                    {role.name}
                    {role.system && <span className={styles.badgeSystem}>System</span>}
                    {custom && <span className={styles.tagCustom}>Custom</span>}
                  </div>
                  <div className={styles.roleCardSlug}>{role.id}</div>
                </div>
              </div>

              <p className={styles.roleCardDesc}>{role.description}</p>

              <div className={styles.roleCardChips}>
                <span className={styles.roleChip}>{role.portal}</span>
                <span className={styles.roleChip}>Scope: {role.scopeLabel}</span>
                <LevelEditor
                  level={role.hierarchyLevel}
                  disabled={isRoleLocked(role.id)}
                  onCommit={(n) => onUpdateLevel(role.id, n)}
                />
              </div>

              <div className={styles.roleCardMetrics}>
                <div className={styles.roleMetric}>
                  <span className={styles.roleMetricValue}>{users}</span>
                  <span className={styles.roleMetricLabel}>Users</span>
                </div>
                <div className={styles.roleMetricBarWrap}>
                  <div className={styles.roleMetricBarHead}>
                    <span>Permissions</span>
                    <span>
                      {perms}/{totalPermCount}
                    </span>
                  </div>
                  <div className={styles.roleMetricBar}>
                    <div
                      className={styles.roleMetricBarFill}
                      style={{
                        width: `${totalPermCount ? (perms / totalPermCount) * 100 : 0}%`,
                        background: accent,
                      }}
                    />
                  </div>
                </div>
              </div>

              <div className={styles.roleCardActions}>
                <button
                  type="button"
                  className={styles.btnSolidPurpleSm}
                  onClick={() => onManageRole(role.id)}
                >
                  Manage permissions
                </button>
                <button
                  type="button"
                  className={styles.btnIconGhost}
                  title="Duplicate role"
                  aria-label={`Duplicate ${role.name}`}
                  onClick={() => onCloneRole(role.id)}
                >
                  ⧉
                </button>
                <button
                  type="button"
                  className={styles.btnIconDanger}
                  title={
                    role.system
                      ? "Core system role cannot be deleted"
                      : "Delete role"
                  }
                  aria-label={`Delete ${role.name}`}
                  disabled={role.system}
                  onClick={() => onDeleteRole(role.id)}
                >
                  🗑
                </button>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className={styles.rolesEmpty}>
            No roles match “{roleSearch}”.
            <button type="button" className={styles.btnGhost} onClick={() => onRoleSearchChange("")}>
              Clear search
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
