import { NextRequest, NextResponse } from "next/server";
import {
  assignEmployeeRole,
  ensureAccessControlStore,
  loadAccessEmployees,
  loadGlobalFeatures,
  loadPermissionMap,
  saveGlobalFeatures,
  saveRolePermissions,
} from "@/lib/access-control/store";
import { FEATURE_MODULES } from "@/app/admin/roles-permissions/system-control-data";

export const runtime = "nodejs";

/** Full state for System Control Permissions + Features tabs. */
export async function GET() {
  try {
    await ensureAccessControlStore();
    const [permissions, features, employees] = await Promise.all([
      loadPermissionMap(),
      loadGlobalFeatures(),
      loadAccessEmployees(),
    ]);
    return NextResponse.json({
      success: true,
      permissions,
      features,
      employees,
      modules: FEATURE_MODULES,
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

    return NextResponse.json({ success: false, error: "Unknown type" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
