import { NextRequest, NextResponse } from "next/server";
import {
  assignEmployeeRole,
  assignEmployeesToRole,
  ensureAccessControlStore,
  loadAccessEmployees,
  loadGlobalFeatures,
  loadOrgRoles,
  loadPermissionMap,
  saveGlobalFeatures,
  saveOrgRoles,
  saveRolePermissions,
  syncAccessControlCatalog,
  unassignEmployeeRole,
  unassignEmployees,
} from "@/lib/access-control/store";
import {
  FEATURE_MODULES,
  GLOBAL_FEATURES,
  type RoleDef,
} from "@/app/admin/roles-permissions/system-control-data";

export const runtime = "nodejs";

/** Full state for System Control Org Chart + Permissions + Features tabs. */
export async function GET() {
  try {
    await ensureAccessControlStore();
    await syncAccessControlCatalog();
    const [permissions, features, employees, roles] = await Promise.all([
      loadPermissionMap(),
      loadGlobalFeatures(),
      loadAccessEmployees(),
      loadOrgRoles(),
    ]);
    return NextResponse.json({
      success: true,
      permissions,
      features,
      employees,
      roles,
      modules: FEATURE_MODULES,
      catalogFeatures: GLOBAL_FEATURES,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

/**
 * Body:
 *  { type: "permissions", roleId, keys: string[] }
 *  { type: "features", features: [{ key, on }] }
 *  { type: "assign", employeeId, roleId }
 *  { type: "assign-many", employeeIds: string[], roleId }
 *  { type: "unassign", employeeId }
 *  { type: "unassign-many", employeeIds: string[] }
 *  { type: "org-roles", roles: RoleDef[] }
 */
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const type = String(body?.type || "").trim();

    if (type === "permissions") {
      const roleId = String(body.roleId || "").trim();
      const keys = Array.isArray(body.keys) ? body.keys.map(String) : [];
      if (!roleId) {
        return NextResponse.json({ success: false, error: "roleId required" }, { status: 400 });
      }
      await saveRolePermissions(roleId, keys);
      return NextResponse.json({ success: true });
    }

    if (type === "features") {
      const features = Array.isArray(body.features) ? body.features : [];
      await saveGlobalFeatures(
        features.map((f: any) => ({
          key: String(f.key || ""),
          on: Boolean(f.on),
          name: f.name ? String(f.name) : undefined,
          desc: f.desc ? String(f.desc) : undefined,
        })),
      );
      return NextResponse.json({ success: true });
    }

    if (type === "assign") {
      const employeeId = String(body.employeeId || "").trim();
      const roleId = String(body.roleId || "").trim();
      if (!employeeId || !roleId) {
        return NextResponse.json(
          { success: false, error: "employeeId and roleId required" },
          { status: 400 },
        );
      }
      await assignEmployeeRole(employeeId, roleId);
      return NextResponse.json({ success: true });
    }

    if (type === "assign-many") {
      const roleId = String(body.roleId || "").trim();
      const employeeIds = Array.isArray(body.employeeIds)
        ? body.employeeIds.map(String)
        : [];
      if (!roleId || !employeeIds.length) {
        return NextResponse.json(
          { success: false, error: "roleId and employeeIds required" },
          { status: 400 },
        );
      }
      const count = await assignEmployeesToRole(employeeIds, roleId);
      return NextResponse.json({ success: true, count });
    }

    if (type === "unassign") {
      const employeeId = String(body.employeeId || "").trim();
      if (!employeeId) {
        return NextResponse.json(
          { success: false, error: "employeeId required" },
          { status: 400 },
        );
      }
      await unassignEmployeeRole(employeeId);
      return NextResponse.json({ success: true });
    }

    if (type === "unassign-many") {
      const employeeIds = Array.isArray(body.employeeIds)
        ? body.employeeIds.map(String)
        : [];
      if (!employeeIds.length) {
        return NextResponse.json(
          { success: false, error: "employeeIds required" },
          { status: 400 },
        );
      }
      const count = await unassignEmployees(employeeIds);
      return NextResponse.json({ success: true, count });
    }

    if (type === "org-roles") {
      const roles = Array.isArray(body.roles) ? (body.roles as RoleDef[]) : [];
      if (!roles.length) {
        return NextResponse.json(
          { success: false, error: "roles array required" },
          { status: 400 },
        );
      }
      await saveOrgRoles(roles);
      const saved = await loadOrgRoles();
      return NextResponse.json({ success: true, roles: saved });
    }

    return NextResponse.json({ success: false, error: "Unknown type" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
