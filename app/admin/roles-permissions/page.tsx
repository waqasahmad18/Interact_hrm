"use client";

import React, { useEffect, useMemo, useState } from "react";
import OptionalAdminShell from "@/app/components/OptionalAdminShell";
import FeaturesTab from "./FeaturesTab";
import NewRoleModal from "./NewRoleModal";
import OrgChartTab from "./OrgChartTab";
import {
  applyStoredEmployeePhotos,
  fetchOrgChartPhotos,
  removeOrgChartPhoto,
  saveOrgChartPhoto,
} from "./org-chart-photo-api";
import RolesPermissionsPanel from "./RolesPermissionsPanel";
import SettingsTab from "./SettingsTab";
import styles from "./system-control-demo.module.css";
import { ModalPortal } from "@/app/components/ModalPortal";
import { effectiveAccessSlugs } from "@/lib/access-control/effective-slugs";
import {
  BASE_ROLES,
  childRoles,
  clonePermissionMap,
  FEATURE_MODULES,
  GLOBAL_FEATURES,
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

function toPermissionSets(map: Record<string, string[]>): Record<string, Set<string>> {
  const base = clonePermissionMap();
  for (const [roleId, keys] of Object.entries(map || {})) {
    base[roleId] = new Set(keys);
  }
  return base;
}

type ViewerCaps = {
  systemPermissionsEdit: boolean;
  systemUsersAssign: boolean;
  systemOrgChartEdit: boolean;
  systemFeaturesEdit: boolean;
  systemControlOpen: boolean;
};

const FULL_CAPS: ViewerCaps = {
  systemControlOpen: true,
  systemPermissionsEdit: true,
  systemUsersAssign: true,
  systemOrgChartEdit: true,
  systemFeaturesEdit: true,
};

function accessApiHeaders(extra?: Record<string, string>): HeadersInit {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(extra || {}),
  };
  if (typeof window === "undefined") return headers;
  const path = window.location.pathname || "";
  const empId =
    localStorage.getItem("employeeId") || localStorage.getItem("loginId") || "";
  if (path.startsWith("/employee-dashboard") && empId) {
    headers["x-employee-id"] = empId;
  } else {
    headers["x-hrm-portal"] = "admin";
  }
  return headers;
}

export default function SystemControlPage() {
  const [activeTab, setActiveTab] = useState<TabId>("roles");
  const [employees, setEmployees] = useState<DemoEmployee[]>([]);
  const [accessLoading, setAccessLoading] = useState(true);
  const [accessSaving, setAccessSaving] = useState(false);
  /** Full org-chart role tree — loaded/saved to DB (hrm_roles). */
  const [orgRoles, setOrgRoles] = useState<RoleDef[]>(() => BASE_ROLES.map((r) => ({ ...r })));
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [newRoleParentId, setNewRoleParentId] = useState<string | null>(null);
  const [permissions, setPermissions] = useState(clonePermissionMap);
  const [employeePermissions, setEmployeePermissions] = useState<Record<string, string[]>>(
    {},
  );
  const [viewerCaps, setViewerCaps] = useState<ViewerCaps>(FULL_CAPS);
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({
    dashboard: true,
    attendance: true,
    leave: true,
    payroll: true,
    people: false,
    shifts: false,
    ops: false,
    team: true,
    portal: false,
    system: true,
  });

  const [selectedRoleId, setSelectedRoleId] = useState("it_manager");
  const [globalFeatures, setGlobalFeatures] = useState(GLOBAL_FEATURES);
  const [sessionTimeout, setSessionTimeout] = useState("480");
  const [defaultRole, setDefaultRole] = useState("helpdesk");
  const [twoStepLeave, setTwoStepLeave] = useState(true);
  const [systemControlRoles, setSystemControlRoles] = useState(["exec_board"]);
  const [toast, setToast] = useState("");
  const [rolePhotos, setRolePhotos] = useState<Record<string, string>>({});
  const persistTimerRef = React.useRef<number | null>(null);

  const customRoles = useMemo(
    () => orgRoles.filter((r) => isCustomRole(r.id)),
    [orgRoles],
  );

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(""), 2800);
  }

  function schedulePersistRoles(next: RoleDef[]) {
    if (!viewerCaps.systemOrgChartEdit) {
      showToast("Missing permission: system.org_chart.edit");
      return;
    }
    if (persistTimerRef.current != null) {
      window.clearTimeout(persistTimerRef.current);
    }
    persistTimerRef.current = window.setTimeout(() => {
      void (async () => {
        try {
          setAccessSaving(true);
          const res = await fetch("/api/access-control/system-control", {
            method: "PUT",
            headers: accessApiHeaders(),
            body: JSON.stringify({ type: "org-roles", roles: next }),
          });
          const data = await res.json();
          if (!data.success) throw new Error(data.error || "Failed to save org chart");
          if (Array.isArray(data.roles) && data.roles.length) {
            setOrgRoles(data.roles as RoleDef[]);
          }
        } catch (err) {
          showToast(err instanceof Error ? err.message : "Failed to save org chart");
        } finally {
          setAccessSaving(false);
        }
      })();
    }, 450);
  }

  function commitOrgRoles(updater: (prev: RoleDef[]) => RoleDef[]) {
    setOrgRoles((prev) => {
      const next = updater(prev);
      schedulePersistRoles(next);
      return next;
    });
  }

  useEffect(() => {
    let cancelled = false;

    async function loadAccessControl() {
      setAccessLoading(true);
      try {
        const [accessRes, photoPayload] = await Promise.all([
          fetch("/api/access-control/system-control", {
            cache: "no-store",
            headers: accessApiHeaders(),
          }).then((r) => r.json()),
          fetchOrgChartPhotos().catch(() => ({
            employeePhotos: {} as Record<string, string>,
            rolePhotos: {} as Record<string, string>,
          })),
        ]);
        if (cancelled) return;

        if (accessRes?.success) {
          if (Array.isArray(accessRes.roles) && accessRes.roles.length) {
            setOrgRoles(accessRes.roles as RoleDef[]);
          }
          if (accessRes.permissions) {
            setPermissions(toPermissionSets(accessRes.permissions));
          }
          if (accessRes.employeePermissions && typeof accessRes.employeePermissions === "object") {
            setEmployeePermissions(accessRes.employeePermissions as Record<string, string[]>);
          }
          if (accessRes.viewer?.capabilities) {
            setViewerCaps({ ...FULL_CAPS, ...accessRes.viewer.capabilities });
          }
          if (Array.isArray(accessRes.features)) {
            setGlobalFeatures(accessRes.features);
          }
          if (Array.isArray(accessRes.employees)) {
            const live = accessRes.employees as DemoEmployee[];
            setEmployees(applyStoredEmployeePhotos(live, photoPayload.employeePhotos || {}));
          }
        } else {
          setToast(accessRes?.error || "Failed to load access control");
          window.setTimeout(() => setToast(""), 2800);
        }
        setRolePhotos(photoPayload.rolePhotos || {});
      } catch (err) {
        if (!cancelled) {
          setToast(err instanceof Error ? err.message : "Failed to load access control");
          window.setTimeout(() => setToast(""), 2800);
        }
      } finally {
        if (!cancelled) setAccessLoading(false);
      }
    }

    loadAccessControl();
    return () => {
      cancelled = true;
      if (persistTimerRef.current != null) {
        window.clearTimeout(persistTimerRef.current);
      }
    };
  }, []);

  const [showNewRoleModal, setShowNewRoleModal] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleCloneFrom, setNewRoleCloneFrom] = useState("it_manager");
  const [newRolePortal, setNewRolePortal] = useState("admin-dashboard");
  const [newRoleScope, setNewRoleScope] = useState("DEPARTMENT");

  const allRoles = useMemo(
    () => [...orgRoles].sort((a, b) => a.hierarchyLevel - b.hierarchyLevel),
    [orgRoles],
  );
  const totalPermCount = FEATURE_MODULES.reduce((n, m) => n + m.permissions.length, 0);

  function employeeCountByRole(roleId: string) {
    return employees.filter((e) => effectiveAccessSlugs(e).includes(roleId)).length;
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

  function toggleEmployeePermission(employeeId: string, key: string) {
    setEmployeePermissions((prev) => {
      const roleId =
        employees.find((e) => e.id === employeeId)?.accessRoleSlug ||
        employees.find((e) => e.id === employeeId)?.roleId ||
        "";
      const base =
        prev[employeeId] != null
          ? [...prev[employeeId]]
          : [...(permissions[roleId] || new Set())];
      const set = new Set(base);
      if (set.has(key)) set.delete(key);
      else set.add(key);
      return { ...prev, [employeeId]: [...set] };
    });
  }

  function toggleModuleForEmployee(
    employeeId: string,
    module: { permissions: { key: string }[] },
    checked: boolean,
  ) {
    setEmployeePermissions((prev) => {
      const roleId =
        employees.find((e) => e.id === employeeId)?.accessRoleSlug ||
        employees.find((e) => e.id === employeeId)?.roleId ||
        "";
      const base =
        prev[employeeId] != null
          ? [...prev[employeeId]]
          : [...(permissions[roleId] || new Set())];
      const set = new Set(base);
      for (const p of module.permissions) {
        if (checked) set.add(p.key);
        else set.delete(p.key);
      }
      return { ...prev, [employeeId]: [...set] };
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
      tier: clone.tier,
      accent: clone.accent,
    };
    commitOrgRoles((prev) => [...prev, newRole]);
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
    commitOrgRoles((prev) => {
      const next = prev.map((r) => ({ ...r }));
      const byId = new Map(next.map((r) => [r.id, r]));
      if (newParentId && isDescendantOf(next, childId, newParentId)) {
        const loopNode = byId.get(newParentId);
        if (loopNode) loopNode.parentId = oldParent;
      }
      const child = byId.get(childId);
      if (child) child.parentId = newParentId;
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
    commitOrgRoles((prev) => {
      const next = prev.map((r) => ({ ...r }));
      const byId = new Map(next.map((r) => [r.id, r]));
      if (
        targetParent &&
        (targetParent === draggedId || isDescendantOf(next, draggedId, targetParent))
      ) {
        const loopNode = byId.get(targetParent);
        if (loopNode) loopNode.parentId = draggedOldParent;
      }
      const dragged = byId.get(draggedId);
      const target = byId.get(targetId);
      if (dragged) dragged.parentId = targetParent;
      if (target) target.parentId = draggedId;
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
    commitOrgRoles((prev) => {
      const next = prev.map((r) => ({ ...r }));
      const byId = new Map(next.map((r) => [r.id, r]));
      if (
        targetParent &&
        (targetParent === draggedId || isDescendantOf(next, draggedId, targetParent))
      ) {
        const loopNode = byId.get(targetParent);
        if (loopNode) loopNode.parentId = currentParent;
      }
      const dragged = byId.get(draggedId);
      if (dragged) dragged.parentId = targetParent;
      return next;
    });
    const draggedName = roleMeta(draggedId, allRoles).name;
    const parentName = targetParent
      ? roleMeta(targetParent, allRoles).name
      : "top level";
    showToast(`${draggedName} placed parallel under ${parentName}`);
  }

  function resetOrgChart() {
    const defaults = BASE_ROLES.map((r) => ({ ...r }));
    setOrgRoles(defaults);
    schedulePersistRoles(defaults);
    setPermissions(clonePermissionMap());
    showToast("Org chart reset to default hierarchy and permissions");
  }

  function renameRole(roleId: string, newName: string) {
    const name = newName.trim();
    if (!name || name === roleMeta(roleId, allRoles).name) return;
    commitOrgRoles((prev) =>
      prev.map((r) => (r.id === roleId ? { ...r, name } : r)),
    );
    showToast(`Role renamed to "${name}"`);
  }

  function requestDeleteRole(roleId: string) {
    if (isRoleLocked(roleId)) {
      showToast("Core system role cannot be deleted");
      return;
    }
    const name = roleMeta(roleId, allRoles).name;
    if (
      employees.some((e) => {
        const slugs =
          Array.isArray(e.accessRoleSlugs) && e.accessRoleSlugs.length
            ? e.accessRoleSlugs
            : e.accessRoleSlug
              ? [String(e.accessRoleSlug)]
              : [];
        return slugs.includes(roleId);
      })
    ) {
      showToast(`Unassign employees first — "${name}" still has users`);
      return;
    }
    setDeleteTargetId(roleId);
  }

  function confirmDeleteRole() {
    const roleId = deleteTargetId;
    if (!roleId) return;
    if (
      isRoleLocked(roleId) ||
      employees.some((e) => {
        const slugs =
          Array.isArray(e.accessRoleSlugs) && e.accessRoleSlugs.length
            ? e.accessRoleSlugs
            : e.accessRoleSlug
              ? [String(e.accessRoleSlug)]
              : [];
        return slugs.includes(roleId);
      })
    ) {
      setDeleteTargetId(null);
      return;
    }
    const name = roleMeta(roleId, allRoles).name;
    const deletedParent = roleMeta(roleId, allRoles).parentId ?? null;
    const kids = childRoles(allRoles, roleId);

    commitOrgRoles((prev) =>
      prev
        .filter((r) => r.id !== roleId)
        .map((r) =>
          kids.some((k) => k.id === r.id) ? { ...r, parentId: deletedParent } : r,
        ),
    );
    setPermissions((prev) => {
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
        isCustom: isCustomRole(deleteTargetId),
      }
    : null;

  function updateRoleLevel(roleId: string, newLevel: number) {
    if (isRoleLocked(roleId)) {
      showToast("Super Admin level is fixed at the top");
      return;
    }
    if (!Number.isFinite(newLevel) || newLevel < 1) newLevel = 1;

    commitOrgRoles((prev) =>
      prev.map((r) => (r.id === roleId ? { ...r, hierarchyLevel: newLevel } : r)),
    );

    const belowRoles = orgRoles.filter(
      (r) => r.id !== roleId && r.id !== "super_admin" && r.hierarchyLevel > newLevel,
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

  async function refreshEmployeesFromApi() {
    try {
      const accessRes = await fetch("/api/access-control/system-control", {
        cache: "no-store",
        headers: accessApiHeaders(),
      }).then((r) => r.json());
      if (accessRes?.success && Array.isArray(accessRes.employees)) {
        const photoPayload = await fetchOrgChartPhotos().catch(() => ({
          employeePhotos: {} as Record<string, string>,
        }));
        setEmployees(
          applyStoredEmployeePhotos(
            accessRes.employees as DemoEmployee[],
            photoPayload.employeePhotos || {},
          ),
        );
        if (accessRes.employeePermissions && typeof accessRes.employeePermissions === "object") {
          setEmployeePermissions(accessRes.employeePermissions as Record<string, string[]>);
        }
      }
    } catch {
      /* keep local state */
    }
  }

  async function saveEmployeeRole(empId: string, roleId: string) {
    const emp = employees.find((e) => e.id === empId);
    if (!emp) return;
    setAccessSaving(true);
    try {
      const res = await fetch("/api/access-control/system-control", {
        method: "PUT",
        headers: accessApiHeaders(),
        body: JSON.stringify({ type: "assign", employeeId: empId, roleId }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Assign failed");
      await refreshEmployeesFromApi();

      let permNote = "";
      try {
        const meRes = await fetch(
          `/api/access-control/me?employeeId=${encodeURIComponent(empId)}`,
          { cache: "no-store" },
        );
        const me = await meRes.json();
        if (me?.success) {
          const n = Array.isArray(me.permissions) ? me.permissions.length : 0;
          const links = Array.isArray(me.menu) ? me.menu.length : 0;
          permNote = ` (${n} permissions → ${links} dashboard links)`;
        }
      } catch {
        /* ignore verify errors */
      }

      showToast(
        `${emp.name} → ${roleMeta(roleId, allRoles).name}${permNote}. Ask them to refresh.`,
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to assign role");
    } finally {
      setAccessSaving(false);
    }
  }

  async function assignEmployeesToRole(employeeIds: string[], roleId: string) {
    const ids = [...new Set(employeeIds.map(String).filter(Boolean))];
    if (!ids.length || !roleId) return;
    setAccessSaving(true);
    try {
      const res = await fetch("/api/access-control/system-control", {
        method: "PUT",
        headers: accessApiHeaders(),
        body: JSON.stringify({ type: "assign-many", employeeIds: ids, roleId }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Assign failed");
      await refreshEmployeesFromApi();
      const names = ids
        .map((id) => employees.find((e) => e.id === id)?.name || id)
        .slice(0, 3)
        .join(", ");
      const extra = ids.length > 3 ? ` +${ids.length - 3}` : "";
      showToast(
        `${ids.length} user(s) → ${roleMeta(roleId, allRoles).name}: ${names}${extra}. Ask them to refresh.`,
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to assign role");
    } finally {
      setAccessSaving(false);
    }
  }

  async function unassignEmployeesFromRole(employeeIds: string[], roleId: string) {
    const ids = [...new Set(employeeIds.map(String).filter(Boolean))];
    if (!ids.length || !roleId) return;
    setAccessSaving(true);
    try {
      const res = await fetch("/api/access-control/system-control", {
        method: "PUT",
        headers: accessApiHeaders(),
        body: JSON.stringify({ type: "unassign-many", employeeIds: ids, roleId }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Unassign failed");
      await refreshEmployeesFromApi();
      showToast(
        `${ids.length} user(s) removed from ${roleMeta(roleId, allRoles).name}. Other roles kept.`,
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to unassign");
    } finally {
      setAccessSaving(false);
    }
  }

  async function savePermissionsToDb(roleId: string) {
    const targetRole = String(roleId || selectedRoleId || "").trim();
    if (!targetRole) {
      showToast("Select a role first");
      return;
    }
    setAccessSaving(true);
    try {
      const keys = [...(permissions[targetRole] || [])];
      const res = await fetch("/api/access-control/system-control", {
        method: "PUT",
        headers: accessApiHeaders(),
        body: JSON.stringify({ type: "permissions", roleId: targetRole, keys }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Save failed");
      showToast(`Role permissions saved for ${roleMeta(targetRole, allRoles).name}.`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to save permissions");
    } finally {
      setAccessSaving(false);
    }
  }

  async function saveEmployeePermissionsToDb(employeeId: string) {
    const eid = String(employeeId || "").trim();
    if (!eid) return;
    setAccessSaving(true);
    try {
      const roleId =
        employees.find((e) => e.id === eid)?.accessRoleSlug ||
        employees.find((e) => e.id === eid)?.roleId ||
        "";
      const keys =
        employeePermissions[eid] != null
          ? employeePermissions[eid]
          : [...(permissions[roleId] || new Set())];
      const res = await fetch("/api/access-control/system-control", {
        method: "PUT",
        headers: accessApiHeaders(),
        body: JSON.stringify({ type: "employee-permissions", employeeId: eid, keys }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Save failed");
      setEmployeePermissions((prev) => ({ ...prev, [eid]: keys }));
      const name = employees.find((e) => e.id === eid)?.name || eid;
      showToast(`Custom permissions saved for ${name}. Ask them to refresh.`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to save user permissions");
    } finally {
      setAccessSaving(false);
    }
  }

  async function clearEmployeeOverrides(employeeId: string) {
    const eid = String(employeeId || "").trim();
    if (!eid) return;
    setAccessSaving(true);
    try {
      const res = await fetch("/api/access-control/system-control", {
        method: "PUT",
        headers: accessApiHeaders(),
        body: JSON.stringify({
          type: "employee-permissions",
          employeeId: eid,
          clear: true,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Clear failed");
      setEmployeePermissions((prev) => {
        const next = { ...prev };
        delete next[eid];
        return next;
      });
      const name = employees.find((e) => e.id === eid)?.name || eid;
      showToast(`${name} now uses role default permissions.`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to reset user permissions");
    } finally {
      setAccessSaving(false);
    }
  }

  async function saveFeaturesToDb() {
    setAccessSaving(true);
    try {
      const res = await fetch("/api/access-control/system-control", {
        method: "PUT",
        headers: accessApiHeaders(),
        body: JSON.stringify({
          type: "features",
          features: globalFeatures.map((f) => ({
            key: f.key,
            on: f.on,
            name: f.name,
            desc: f.desc,
          })),
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Save failed");
      showToast("Global features saved");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to save features");
    } finally {
      setAccessSaving(false);
    }
  }

  async function updateEmployeePhoto(empId: string, photo: string) {
    setEmployees((prev) =>
      prev.map((e) => (e.id === empId ? { ...e, profilePhoto: photo } : e)),
    );
    const emp = employees.find((e) => e.id === empId);
    try {
      await saveOrgChartPhoto("employee", empId, photo);
      showToast(emp ? `Profile photo updated for ${emp.name}` : "Profile photo updated");
    } catch (err) {
      setEmployees((prev) =>
        prev.map((e) =>
          e.id === empId ? { ...e, profilePhoto: undefined } : e,
        ),
      );
      showToast(err instanceof Error ? err.message : "Failed to save photo");
    }
  }

  async function updateRolePhoto(roleId: string, photo: string) {
    setRolePhotos((prev) => ({ ...prev, [roleId]: photo }));
    try {
      await saveOrgChartPhoto("role", roleId, photo);
      showToast(`Profile photo updated for ${roleMeta(roleId, allRoles).name}`);
    } catch (err) {
      setRolePhotos((prev) => {
        const next = { ...prev };
        delete next[roleId];
        return next;
      });
      showToast(err instanceof Error ? err.message : "Failed to save photo");
    }
  }

  async function removeEmployeePhoto(empId: string) {
    const prevPhoto = employees.find((e) => e.id === empId)?.profilePhoto;
    setEmployees((prev) =>
      prev.map((e) =>
        e.id === empId ? { ...e, profilePhoto: undefined } : e,
      ),
    );
    const emp = employees.find((e) => e.id === empId);
    try {
      await removeOrgChartPhoto("employee", empId);
      showToast(emp ? `Photo removed for ${emp.name}` : "Photo removed");
    } catch (err) {
      if (prevPhoto) {
        setEmployees((prev) =>
          prev.map((e) =>
            e.id === empId ? { ...e, profilePhoto: prevPhoto } : e,
          ),
        );
      }
      showToast(err instanceof Error ? err.message : "Failed to remove photo");
    }
  }

  async function removeRolePhoto(roleId: string) {
    const prevPhoto = rolePhotos[roleId];
    setRolePhotos((prev) => {
      const next = { ...prev };
      delete next[roleId];
      return next;
    });
    try {
      await removeOrgChartPhoto("role", roleId);
      showToast(`Photo removed for ${roleMeta(roleId, allRoles).name}`);
    } catch (err) {
      if (prevPhoto) {
        setRolePhotos((prev) => ({ ...prev, [roleId]: prevPhoto }));
      }
      showToast(err instanceof Error ? err.message : "Failed to remove photo");
    }
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: "roles", label: "Org Chart" },
    { id: "permissions", label: "Permissions" },
    { id: "features", label: "Features" },
    { id: "settings", label: "Settings" },
  ];

  return (
    <OptionalAdminShell>
      <div className={styles.page}>
        <header className={styles.scHeader}>
          <div>
            <p className={styles.scEyebrow}>Administration</p>
            <h1 className={styles.scTitle}>System Control</h1>
            <p className={styles.scSubtitle}>
              Manage roles, permissions, user assignments, and features from one place.
              {accessLoading
                ? " Loading live employees…"
                : ` ${employees.length} employees loaded from database.`}
              {accessSaving ? " Saving…" : ""}
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
              employees={employees}
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
              onUpdateProfilePhoto={updateEmployeePhoto}
              onRemoveProfilePhoto={removeEmployeePhoto}
              onUpdateRolePhoto={updateRolePhoto}
              onRemoveRolePhoto={removeRolePhoto}
              rolePhotos={rolePhotos}
              isRoleLocked={isRoleLocked}
              isCustomRole={(id) => isCustomRole(id)}
              readOnly={!viewerCaps.systemOrgChartEdit}
            />
          )}

          {activeTab === "permissions" && (
            <RolesPermissionsPanel
              allRoles={allRoles}
              employees={employees}
              initialRoleId={selectedRoleId}
              permissions={permissions}
              employeePermissions={employeePermissions}
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
              onToggleEmployeePermission={toggleEmployeePermission}
              onToggleModuleForEmployee={toggleModuleForEmployee}
              onResetAll={() => {
                setPermissions(clonePermissionMap());
                showToast("All roles reset to default templates");
              }}
              onSaveRole={(roleId) => void savePermissionsToDb(roleId)}
              onSaveEmployee={(empId) => void saveEmployeePermissionsToDb(empId)}
              onClearEmployeeOverrides={(empId) => void clearEmployeeOverrides(empId)}
              onAssignEmployees={(ids, roleId) => void assignEmployeesToRole(ids, roleId)}
              onUnassignEmployees={(ids, roleId) => void unassignEmployeesFromRole(ids, roleId)}
              isRoleLocked={isRoleLocked}
              isCustomRole={(id) => isCustomRole(id)}
              employeeCountByRole={employeeCountByRole}
              caps={viewerCaps}
            />
          )}

          {activeTab === "features" && (
            <FeaturesTab
              features={globalFeatures}
              onToggle={(key) => {
                if (!viewerCaps.systemFeaturesEdit) return;
                setGlobalFeatures((prev) =>
                  prev.map((f) => (f.key === key ? { ...f, on: !f.on } : f)),
                );
              }}
              onSave={() => void saveFeaturesToDb()}
              readOnly={!viewerCaps.systemFeaturesEdit}
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
          Org chart, permissions, and features save to the database (
          <code>hrm_roles</code>, <code>hrm_role_permissions</code>,{" "}
          <code>hrm_global_features</code>).
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
          <ModalPortal>
          <div
            className={styles.modalOverlay}
            data-hrm-modal-overlay
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
          </ModalPortal>
        )}
      </div>
    </OptionalAdminShell>
  );
}
