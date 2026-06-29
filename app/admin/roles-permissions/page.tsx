"use client";

import React, { useMemo, useState } from "react";
import LayoutDashboard from "../../layout-dashboard";
import AssignUsersTab from "./AssignUsersTab";
import FeaturesTab from "./FeaturesTab";
import NewRoleModal from "./NewRoleModal";
import OrgChartTab from "./OrgChartTab";
import RolesPermissionsPanel from "./RolesPermissionsPanel";
import SettingsTab from "./SettingsTab";
import styles from "./system-control-demo.module.css";
import {
  BASE_ROLES,
  childRoles,
  clonePermissionMap,
  FEATURE_MODULES,
  GLOBAL_FEATURES,
  INITIAL_EMPLOYEES,
  TAB_HINT,
  isCustomRole,
  isDescendantOf,
  isRoleLocked,
  roleMeta,
  scopeLabelFromScope,
  slugifyRoleName,
  type DemoEmployee,
  type RoleDef,
  type TabId,
} from "./system-control-data";

export default function SystemControlPage() {
  const [activeTab, setActiveTab] = useState<TabId>("roles");
  const [employees, setEmployees] = useState<DemoEmployee[]>(INITIAL_EMPLOYEES);
  const [customRoles, setCustomRoles] = useState<RoleDef[]>([]);
  const [deletedBaseIds, setDeletedBaseIds] = useState<string[]>([]);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [levelOverrides, setLevelOverrides] = useState<Record<string, number>>({});
  // Org-chart structure overrides (in-memory). parentOverrides re-parents roles
  // via drag-drop; nameOverrides renames roles inline from the chart.
  const [parentOverrides, setParentOverrides] = useState<Record<string, string | null>>({});
  const [nameOverrides, setNameOverrides] = useState<Record<string, string>>({});
  const [newRoleParentId, setNewRoleParentId] = useState<string | null>(null);
  const [permissions, setPermissions] = useState(clonePermissionMap);
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({
    attendance: true,
    leave: true,
    payroll: true,
    team: true,
    system: true,
  });

  const [selectedRoleId, setSelectedRoleId] = useState("it_manager");
  const [globalFeatures, setGlobalFeatures] = useState(GLOBAL_FEATURES);
  const [sessionTimeout, setSessionTimeout] = useState("480");
  const [defaultRole, setDefaultRole] = useState("helpdesk");
  const [twoStepLeave, setTwoStepLeave] = useState(true);
  const [systemControlRoles, setSystemControlRoles] = useState(["exec_board"]);
  const [toast, setToast] = useState("");

  const [showNewRoleModal, setShowNewRoleModal] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleCloneFrom, setNewRoleCloneFrom] = useState("it_manager");
  const [newRolePortal, setNewRolePortal] = useState("admin-dashboard");
  const [newRoleScope, setNewRoleScope] = useState("DEPARTMENT");

  const allRoles = useMemo(
    () =>
      [
        ...BASE_ROLES.filter((r) => !deletedBaseIds.includes(r.id)),
        ...customRoles,
      ]
        .map((r) => ({
          ...r,
          name: nameOverrides[r.id] ?? r.name,
          hierarchyLevel: levelOverrides[r.id] ?? r.hierarchyLevel,
          parentId:
            parentOverrides[r.id] !== undefined
              ? parentOverrides[r.id]
              : (r.parentId ?? null),
        }))
        .sort((a, b) => a.hierarchyLevel - b.hierarchyLevel),
    [customRoles, deletedBaseIds, levelOverrides, nameOverrides, parentOverrides],
  );
  const totalPermCount = FEATURE_MODULES.reduce((n, m) => n + m.permissions.length, 0);

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(""), 2800);
  }

  function employeeCountByRole(roleId: string) {
    return employees.filter((e) => e.roleId === roleId).length;
  }

  function permCountByRole(roleId: string) {
    return (permissions[roleId] || new Set()).size;
  }

  function togglePermission(roleId: string, key: string) {
    if (isRoleLocked(roleId)) return;
    setPermissions((prev) => {
      const next = { ...prev };
      const set = new Set(prev[roleId] || []);
      if (set.has(key)) set.delete(key);
      else set.add(key);
      next[roleId] = set;
      return next;
    });
  }

  function toggleModuleForRole(
    roleId: string,
    module: { permissions: { key: string }[] },
    checked: boolean,
  ) {
    if (isRoleLocked(roleId)) return;
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

  function openNewRoleModal(cloneFrom?: string) {
    const base = cloneFrom || selectedRoleId;
    const clone = roleMeta(base, allRoles);
    setNewRoleName("");
    setNewRoleCloneFrom(isRoleLocked(base) ? "it_manager" : base);
    setNewRolePortal(clone.portal);
    setNewRoleScope(clone.scope);
    setShowNewRoleModal(true);
  }

  function applyCloneDefaults(cloneId: string) {
    const clone = roleMeta(cloneId, allRoles);
    setNewRoleCloneFrom(cloneId);
    setNewRolePortal(clone.portal);
    setNewRoleScope(clone.scope);
  }

  function handleCreateRole() {
    const name = newRoleName.trim();
    if (!name) {
      showToast("Enter a role name");
      return;
    }
    const slug = slugifyRoleName(name);
    if (!slug) {
      showToast("Invalid role name");
      return;
    }
    if (allRoles.some((r) => r.id === slug)) {
      showToast("A role with this name already exists");
      return;
    }
    const clone = roleMeta(newRoleCloneFrom, allRoles);
    const parentId = newRoleParentId ?? clone.parentId ?? null;
    const newRole: RoleDef = {
      id: slug,
      name,
      description: `Custom role cloned from ${clone.name}.`,
      portal: newRolePortal,
      scope: newRoleScope,
      scopeLabel: scopeLabelFromScope(newRoleScope),
      hierarchyLevel: clone.hierarchyLevel + 1,
      parentId,
    };
    setCustomRoles((prev) => [...prev, newRole]);
    setPermissions((prev) => ({
      ...prev,
      [slug]: new Set(prev[newRoleCloneFrom] || []),
    }));
    setShowNewRoleModal(false);
    setNewRoleParentId(null);
    setSelectedRoleId(slug);
    const parentName = parentId ? roleMeta(parentId, allRoles).name : "top level";
    showToast(`Role "${name}" added under ${parentName}`);
  }

  function openAddChildRole(parentId: string) {
    setNewRoleParentId(parentId);
    openNewRoleModal(isRoleLocked(parentId) ? "it_manager" : parentId);
  }

  /** Target id plus every role beneath it in the current tree. */
  function collectSubtreeIds(roles: RoleDef[], rootId: string): string[] {
    const out = [rootId];
    const stack = [...childRoles(roles, rootId)];
    while (stack.length) {
      const node = stack.pop()!;
      out.push(node.id);
      stack.push(...childRoles(roles, node.id));
    }
    return out;
  }

  const effectiveParentOf = (roleId: string): string | null =>
    roleMeta(roleId, allRoles).parentId ?? null;

  /**
   * Move `childId` so it reports to `newParentId`, ALWAYS succeeding. If
   * `newParentId` currently sits below `childId` (which would form a loop), the
   * conflicting branch is first lifted into `childId`'s old slot — so any role
   * can be dropped onto any other role from any department without being blocked.
   */
  function reparentRole(childId: string, newParentId: string | null) {
    if (childId === newParentId) return;
    if (isRoleLocked(childId)) {
      showToast("Super Admin stays at the top of the chart");
      return;
    }
    const oldParent = effectiveParentOf(childId);
    setParentOverrides((prev) => {
      const next = { ...prev };
      if (newParentId && isDescendantOf(allRoles, childId, newParentId)) {
        next[newParentId] = oldParent;
      }
      next[childId] = newParentId;
      return next;
    });
    const childName = roleMeta(childId, allRoles).name;
    const parentName = newParentId ? roleMeta(newParentId, allRoles).name : "top level";
    showToast(`${childName} now reports to ${parentName}`);
  }

  /**
   * Drop the dragged role ABOVE the target so the dragged role becomes the
   * target's new manager: the dragged role takes the target's old parent slot,
   * and the target (plus its subtree) now reports to the dragged role. Always
   * succeeds — loops are auto-resolved by lifting the conflicting branch. The
   * dragged role keeps its identity but inherits the subtree's permissions.
   */
  function insertRoleAbove(draggedId: string, targetId: string) {
    if (draggedId === targetId) return;
    if (isRoleLocked(draggedId)) {
      showToast("Super Admin stays at the top of the chart");
      return;
    }
    if (isRoleLocked(targetId)) {
      showToast("Can't place a role above the top of the chart");
      return;
    }
    const targetParent = effectiveParentOf(targetId);
    const draggedOldParent = effectiveParentOf(draggedId);
    setParentOverrides((prev) => {
      const next = { ...prev };
      if (
        targetParent &&
        (targetParent === draggedId ||
          isDescendantOf(allRoles, draggedId, targetParent))
      ) {
        next[targetParent] = draggedOldParent;
      }
      next[draggedId] = targetParent;
      next[targetId] = draggedId;
      return next;
    });

    const subtreeIds = collectSubtreeIds(allRoles, targetId);
    let gained = 0;
    setPermissions((prev) => {
      const union = new Set(prev[draggedId] || []);
      const before = union.size;
      for (const id of subtreeIds) {
        for (const key of prev[id] || []) union.add(key);
      }
      gained = union.size - before;
      return { ...prev, [draggedId]: union };
    });

    const draggedName = roleMeta(draggedId, allRoles).name;
    const targetName = roleMeta(targetId, allRoles).name;
    showToast(
      gained > 0
        ? `${targetName} now reports to ${draggedName} (+${gained} permission${gained === 1 ? "" : "s"})`
        : `${targetName} now reports to ${draggedName}`,
    );
  }

  /**
   * Drop the dragged role BESIDE the target so they become parallel siblings:
   * the dragged role takes the same parent as the target (same level, same
   * manager). Always succeeds — loops auto-resolved. Role identity unchanged.
   */
  function makeRoleSibling(draggedId: string, targetId: string) {
    if (draggedId === targetId) return;
    if (isRoleLocked(draggedId)) {
      showToast("Super Admin stays at the top of the chart");
      return;
    }
    const targetParent = effectiveParentOf(targetId);
    const currentParent = effectiveParentOf(draggedId);
    if (targetParent === currentParent) {
      showToast(`${roleMeta(draggedId, allRoles).name} is already parallel here`);
      return;
    }
    setParentOverrides((prev) => {
      const next = { ...prev };
      if (
        targetParent &&
        (targetParent === draggedId ||
          isDescendantOf(allRoles, draggedId, targetParent))
      ) {
        next[targetParent] = currentParent;
      }
      next[draggedId] = targetParent;
      return next;
    });
    const draggedName = roleMeta(draggedId, allRoles).name;
    const parentName = targetParent
      ? roleMeta(targetParent, allRoles).name
      : "top level";
    showToast(`${draggedName} placed parallel under ${parentName}`);
  }

  function resetOrgChart() {
    setParentOverrides({});
    setLevelOverrides({});
    setNameOverrides({});
    setPermissions(clonePermissionMap());
    showToast("Org chart reset to default hierarchy and permissions");
  }

  function renameRole(roleId: string, newName: string) {
    const name = newName.trim();
    if (!name || name === roleMeta(roleId, allRoles).name) return;
    setNameOverrides((prev) => ({ ...prev, [roleId]: name }));
    showToast(`Role renamed to "${name}"`);
  }

  function requestDeleteRole(roleId: string) {
    if (isRoleLocked(roleId)) {
      showToast("Core system role cannot be deleted");
      return;
    }
    const name = roleMeta(roleId, allRoles).name;
    if (employees.some((e) => e.roleId === roleId)) {
      showToast(`Reassign employees first — "${name}" still has users`);
      return;
    }
    setDeleteTargetId(roleId);
  }

  function confirmDeleteRole() {
    const roleId = deleteTargetId;
    if (!roleId) return;
    if (isRoleLocked(roleId) || employees.some((e) => e.roleId === roleId)) {
      setDeleteTargetId(null);
      return;
    }
    const name = roleMeta(roleId, allRoles).name;
    const deletedParent = roleMeta(roleId, allRoles).parentId ?? null;
    const kids = childRoles(allRoles, roleId);

    if (isCustomRole(roleId, customRoles)) {
      setCustomRoles((prev) => prev.filter((r) => r.id !== roleId));
    } else {
      setDeletedBaseIds((prev) => [...prev, roleId]);
    }
    setPermissions((prev) => {
      const next = { ...prev };
      delete next[roleId];
      return next;
    });
    // Reattach any children to the deleted role's parent so the tree stays
    // connected, and drop the deleted role's own overrides.
    setParentOverrides((prev) => {
      const next = { ...prev };
      for (const kid of kids) next[kid.id] = deletedParent;
      delete next[roleId];
      return next;
    });
    setNameOverrides((prev) => {
      const next = { ...prev };
      delete next[roleId];
      return next;
    });
    if (selectedRoleId === roleId) setSelectedRoleId("exec_board");
    setDeleteTargetId(null);
    showToast(
      kids.length
        ? `Role "${name}" deleted — ${kids.length} report(s) moved up`
        : `Role "${name}" deleted`,
    );
  }

  const deleteTargetMeta = deleteTargetId
    ? {
        name: roleMeta(deleteTargetId, allRoles).name,
        isCustom: isCustomRole(deleteTargetId, customRoles),
      }
    : null;

  function updateRoleLevel(roleId: string, newLevel: number) {
    if (isRoleLocked(roleId)) {
      showToast("Super Admin level is fixed at the top");
      return;
    }
    if (!Number.isFinite(newLevel) || newLevel < 1) newLevel = 1;

    const newOverrides = { ...levelOverrides, [roleId]: newLevel };
    setLevelOverrides(newOverrides);

    const rawList = [
      ...BASE_ROLES.filter((r) => !deletedBaseIds.includes(r.id)),
      ...customRoles,
    ];
    const levelOf = (r: RoleDef) => newOverrides[r.id] ?? r.hierarchyLevel;
    const belowRoles = rawList.filter(
      (r) => r.id !== roleId && r.id !== "super_admin" && levelOf(r) > newLevel,
    );

    setPermissions((prev) => {
      const union = new Set(prev[roleId] || []);
      for (const r of belowRoles) {
        for (const key of prev[r.id] || []) union.add(key);
      }
      return { ...prev, [roleId]: union };
    });

    const name = roleMeta(roleId, allRoles).name;
    showToast(
      `${name} → Level ${newLevel}. Inherited access from ${belowRoles.length} role(s) below.`,
    );
  }

  function manageRolePermissions(roleId: string) {
    setSelectedRoleId(roleId);
    setActiveTab("permissions");
  }

  function saveEmployeeRole(empId: string, roleId: string) {
    const emp = employees.find((e) => e.id === empId);
    if (!emp) return;
    setEmployees((prev) => prev.map((e) => (e.id === empId ? { ...e, roleId } : e)));
    showToast(
      `${emp.name} → ${roleMeta(roleId, allRoles).name}. Portal: ${roleMeta(roleId, allRoles).portal} on next login.`,
    );
  }

  function bulkAssignRole(ids: string[], roleId: string) {
    setEmployees((prev) =>
      prev.map((e) => (ids.includes(e.id) ? { ...e, roleId } : e)),
    );
    showToast(`${ids.length} employee(s) → ${roleMeta(roleId, allRoles).name}`);
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: "roles", label: "Org Chart" },
    { id: "permissions", label: "Permissions" },
    { id: "assign", label: "Assign Users" },
    { id: "features", label: "Features" },
    { id: "settings", label: "Settings" },
  ];

  return (
    <LayoutDashboard>
      <div className={styles.page}>
        <header className={styles.scHeader}>
          <div>
            <p className={styles.scEyebrow}>Administration</p>
            <h1 className={styles.scTitle}>System Control</h1>
            <p className={styles.scSubtitle}>
              Manage roles, permissions, user assignments, and features from one place.
            </p>
          </div>
          <div className={styles.scHeaderBadge}>Super Admin</div>
        </header>

        <div className={styles.scHintBar}>{TAB_HINT[activeTab]}</div>

        <nav className={styles.scTabs} aria-label="System Control sections">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`${styles.scTab} ${activeTab === tab.id ? styles.scTabActive : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div className={styles.scPanel}>
          {activeTab === "roles" && (
            <OrgChartTab
              allRoles={allRoles}
              customRoles={customRoles}
              employeeCountByRole={employeeCountByRole}
              permCountByRole={permCountByRole}
              totalPermCount={totalPermCount}
              onReparent={reparentRole}
              onInsertAbove={insertRoleAbove}
              onMakeSibling={makeRoleSibling}
              onResetChart={resetOrgChart}
              onAddChild={openAddChildRole}
              onRename={renameRole}
              onDelete={requestDeleteRole}
              onManage={manageRolePermissions}
              onUpdateLevel={updateRoleLevel}
              isRoleLocked={isRoleLocked}
              isCustomRole={(id) => isCustomRole(id, customRoles)}
            />
          )}

          {activeTab === "permissions" && (
            <RolesPermissionsPanel
              allRoles={allRoles}
              initialRoleId={selectedRoleId}
              permissions={permissions}
              modules={FEATURE_MODULES}
              expandedModules={expandedModules}
              onToggleModuleExpand={(id) =>
                setExpandedModules((prev) => {
                  const isOpen = prev[id] !== false;
                  return { ...prev, [id]: !isOpen };
                })
              }
              onTogglePermission={togglePermission}
              onToggleModuleForRole={toggleModuleForRole}
              onResetAll={() => {
                setPermissions(clonePermissionMap());
                showToast("All roles reset to default templates");
              }}
              onSave={() => showToast("Permissions saved (demo)")}
              isRoleLocked={isRoleLocked}
              isCustomRole={(id) => isCustomRole(id, customRoles)}
              employeeCountByRole={employeeCountByRole}
            />
          )}

          {activeTab === "assign" && (
            <AssignUsersTab
              employees={employees}
              allRoles={allRoles}
              customRoles={customRoles}
              onSaveEmployee={saveEmployeeRole}
              onBulkAssign={bulkAssignRole}
            />
          )}

          {activeTab === "features" && (
            <FeaturesTab
              features={globalFeatures}
              onToggle={(key) => {
                setGlobalFeatures((prev) =>
                  prev.map((f) => (f.key === key ? { ...f, on: !f.on } : f)),
                );
              }}
              onSave={() => showToast("Features saved (demo)")}
            />
          )}

          {activeTab === "settings" && (
            <SettingsTab
              sessionTimeout={sessionTimeout}
              onSessionTimeoutChange={setSessionTimeout}
              defaultRole={defaultRole}
              onDefaultRoleChange={setDefaultRole}
              twoStepLeave={twoStepLeave}
              onTwoStepLeaveChange={setTwoStepLeave}
              systemControlRoles={systemControlRoles}
              onSystemControlRolesChange={setSystemControlRoles}
              allRoles={allRoles}
              onSave={() => showToast("Settings saved (demo)")}
            />
          )}
        </div>

        <p className={styles.scDemoNote}>
          Static UI preview — production will save to MySQL (<code>hrm_roles</code>,{" "}
          <code>hrm_role_permissions</code>).
        </p>

        {toast && <div className={styles.toast}>{toast}</div>}

        <NewRoleModal
          open={showNewRoleModal}
          onClose={() => setShowNewRoleModal(false)}
          allRoles={allRoles}
          name={newRoleName}
          onNameChange={setNewRoleName}
          cloneFrom={newRoleCloneFrom}
          onCloneFromChange={applyCloneDefaults}
          portal={newRolePortal}
          onPortalChange={setNewRolePortal}
          scope={newRoleScope}
          onScopeChange={setNewRoleScope}
          onCreate={handleCreateRole}
        />

        {deleteTargetMeta && (
          <div
            className={styles.modalOverlay}
            role="presentation"
            onClick={() => setDeleteTargetId(null)}
          >
            <div
              className={styles.modalCard}
              role="dialog"
              aria-labelledby="delete-role-title"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 id="delete-role-title" className={styles.modalTitle}>
                Delete role?
              </h2>
              <p className={styles.modalSub}>
                You&apos;re about to delete <strong>{deleteTargetMeta.name}</strong>
                {deleteTargetMeta.isCustom ? " (custom role)" : " (built-in role)"}.
                This removes its permission set. This action cannot be undone.
              </p>
              <div className={styles.modalActions}>
                <button
                  type="button"
                  className={styles.btnGhost}
                  onClick={() => setDeleteTargetId(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={styles.btnDanger}
                  onClick={confirmDeleteRole}
                >
                  Delete role
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </LayoutDashboard>
  );
}
