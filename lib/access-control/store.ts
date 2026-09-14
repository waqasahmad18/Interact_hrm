import { getDbDriver, pool } from "@/lib/db";
import { getMongoDb } from "@/lib/mongo";
import {
  BASE_ROLES,
  DEFAULT_PERMISSIONS,
  FEATURE_MODULES,
  GLOBAL_FEATURES,
  scopeLabelFromScope,
  type RoleDef,
} from "@/app/admin/roles-permissions/system-control-data";

export const ROLES_COLLECTION = "hrm_roles";
export const ROLE_PERMS_COLLECTION = "hrm_role_permissions";
export const GLOBAL_FEATURES_COLLECTION = "hrm_global_features";
export const EMPLOYEE_PERMS_COLLECTION = "hrm_employee_permissions";

export type AccessEmployee = {
  id: string;
  name: string;
  initials: string;
  pseudonym?: string;
  profilePhoto?: string;
  /** Effective role used for access (explicit assign or legacy map). */
  roleId: string;
  /** Explicit System Control assign; null = not assigned via Permissions tab. */
  accessRoleSlug: string | null;
  departmentId: string;
  departmentName?: string;
  reportsTo: string | null;
  legacyRole?: string;
};

function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

/** Map live HRM `hrm_employees.role` strings → System Control role slug. */
export function mapLegacyEmployeeRole(role: unknown): string {
  const r = String(role ?? "")
    .trim()
    .toLowerCase();
  if (!r) return "helpdesk";
  if (r.includes("bod") || r.includes("ceo") || r.includes("board")) return "exec_board";
  if (r.includes("managing partner") || r === "partner") return "mp_it";
  if (r.includes("hr")) return "hr_manager";
  if (r === "hod" || r.includes("head")) return "it_manager";
  if (r.includes("management") || r.includes("manager")) return "billing_ops_manager";
  if (r.includes("leader") || r.includes("lead") || r.includes("supervisor")) {
    return "team_lead_billing";
  }
  if (r.includes("officer") || r.includes("staff") || r.includes("associate")) {
    return "helpdesk";
  }
  return "helpdesk";
}

async function ensureMysqlTables() {
  const conn = await pool.getConnection();
  try {
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS ${ROLES_COLLECTION} (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        slug VARCHAR(64) NOT NULL,
        display_name VARCHAR(128) NOT NULL,
        description TEXT NULL,
        portal_type VARCHAR(64) NOT NULL DEFAULT 'employee-dashboard',
        data_scope VARCHAR(32) NOT NULL DEFAULT 'SELF',
        hierarchy_level INT NOT NULL DEFAULT 50,
        parent_slug VARCHAR(64) NULL,
        tier VARCHAR(32) NULL,
        accent VARCHAR(32) NULL,
        is_system TINYINT(1) NOT NULL DEFAULT 0,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_hrm_roles_slug (slug)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS ${ROLE_PERMS_COLLECTION} (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        role_slug VARCHAR(64) NOT NULL,
        feature_key VARCHAR(128) NOT NULL,
        allowed TINYINT(1) NOT NULL DEFAULT 0,
        PRIMARY KEY (id),
        UNIQUE KEY uq_role_perm (role_slug, feature_key),
        KEY idx_role_slug (role_slug)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS ${GLOBAL_FEATURES_COLLECTION} (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        feature_key VARCHAR(64) NOT NULL,
        display_name VARCHAR(128) NOT NULL,
        description TEXT NULL,
        is_enabled TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_global_feature (feature_key)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS ${EMPLOYEE_PERMS_COLLECTION} (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        employee_id VARCHAR(64) NOT NULL,
        feature_key VARCHAR(128) NOT NULL,
        allowed TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_emp_perm (employee_id, feature_key),
        KEY idx_emp_perm_employee (employee_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    try {
      await conn.execute(
        `ALTER TABLE hrm_employees ADD COLUMN access_role_slug VARCHAR(64) NULL`,
      );
    } catch {
      /* column exists */
    }
  } finally {
    conn.release();
  }
}

async function ensureMongoIndexes() {
  const db = await getMongoDb();
  await db.collection(ROLES_COLLECTION).createIndex({ slug: 1 }, { unique: true });
  await db
    .collection(ROLE_PERMS_COLLECTION)
    .createIndex({ role_slug: 1, feature_key: 1 }, { unique: true });
  await db
    .collection(GLOBAL_FEATURES_COLLECTION)
    .createIndex({ feature_key: 1 }, { unique: true });
  await db
    .collection(EMPLOYEE_PERMS_COLLECTION)
    .createIndex({ employee_id: 1, feature_key: 1 }, { unique: true });
}

async function nextId(collection: string): Promise<number> {
  if (getDbDriver() === "mongo") {
    const db = await getMongoDb();
    const last = await db
      .collection(collection)
      .find({ id: { $type: ["int", "long", "double"] } })
      .sort({ id: -1 })
      .limit(1)
      .toArray();
    return typeof last[0]?.id === "number" ? last[0].id + 1 : 1;
  }
  return 1;
}

async function seedIfEmpty() {
  if (getDbDriver() === "mongo") {
    const db = await getMongoDb();
    const roleCount = await db.collection(ROLES_COLLECTION).countDocuments();
    if (roleCount === 0) {
      let id = await nextId(ROLES_COLLECTION);
      const docs = BASE_ROLES.map((r) => ({
        id: id++,
        slug: r.id,
        display_name: r.name,
        description: r.description,
        portal_type: r.portal,
        data_scope: r.scope,
        hierarchy_level: r.hierarchyLevel,
        parent_slug: r.parentId ?? null,
        tier: r.tier ?? null,
        accent: r.accent ?? null,
        is_system: r.system ? 1 : 0,
        is_active: 1,
        created_at: new Date(),
        updated_at: new Date(),
      }));
      if (docs.length) await db.collection(ROLES_COLLECTION).insertMany(docs);
    }

    const permCount = await db.collection(ROLE_PERMS_COLLECTION).countDocuments();
    if (permCount === 0) {
      let pid = await nextId(ROLE_PERMS_COLLECTION);
      const perms: Record<string, unknown>[] = [];
      for (const [slug, set] of Object.entries(DEFAULT_PERMISSIONS)) {
        for (const key of set) {
          perms.push({
            id: pid++,
            role_slug: slug,
            feature_key: key,
            allowed: 1,
            created_at: new Date(),
          });
        }
      }
      if (perms.length) await db.collection(ROLE_PERMS_COLLECTION).insertMany(perms);
    }

    const featCount = await db.collection(GLOBAL_FEATURES_COLLECTION).countDocuments();
    if (featCount === 0) {
      let fid = await nextId(GLOBAL_FEATURES_COLLECTION);
      await db.collection(GLOBAL_FEATURES_COLLECTION).insertMany(
        GLOBAL_FEATURES.map((f) => ({
          id: fid++,
          feature_key: f.key,
          display_name: f.name,
          description: f.desc,
          is_enabled: f.on ? 1 : 0,
          created_at: new Date(),
          updated_at: new Date(),
        })),
      );
    }
    return;
  }

  const [roleRows] = await pool.execute(`SELECT COUNT(*) AS c FROM ${ROLES_COLLECTION}`);
  const roleCount = Number((roleRows as any[])[0]?.c ?? 0);
  if (roleCount === 0) {
    for (const r of BASE_ROLES) {
      await pool.execute(
        `INSERT INTO ${ROLES_COLLECTION}
          (slug, display_name, description, portal_type, data_scope, hierarchy_level, parent_slug, tier, accent, is_system, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [
          r.id,
          r.name,
          r.description,
          r.portal,
          r.scope,
          r.hierarchyLevel,
          r.parentId ?? null,
          r.tier ?? null,
          r.accent ?? null,
          r.system ? 1 : 0,
        ],
      );
    }
  }

  const [permRows] = await pool.execute(`SELECT COUNT(*) AS c FROM ${ROLE_PERMS_COLLECTION}`);
  if (Number((permRows as any[])[0]?.c ?? 0) === 0) {
    for (const [slug, set] of Object.entries(DEFAULT_PERMISSIONS)) {
      for (const key of set) {
        await pool.execute(
          `INSERT INTO ${ROLE_PERMS_COLLECTION} (role_slug, feature_key, allowed) VALUES (?, ?, 1)`,
          [slug, key],
        );
      }
    }
  }

  const [featRows] = await pool.execute(
    `SELECT COUNT(*) AS c FROM ${GLOBAL_FEATURES_COLLECTION}`,
  );
  if (Number((featRows as any[])[0]?.c ?? 0) === 0) {
    for (const f of GLOBAL_FEATURES) {
      await pool.execute(
        `INSERT INTO ${GLOBAL_FEATURES_COLLECTION}
          (feature_key, display_name, description, is_enabled) VALUES (?, ?, ?, ?)`,
        [f.key, f.name, f.desc, f.on ? 1 : 0],
      );
    }
  }
}

export async function ensureAccessControlStore() {
  if (getDbDriver() === "mongo") {
    await ensureMongoIndexes();
  } else {
    await ensureMysqlTables();
  }
  await seedIfEmpty();
}

export async function loadPermissionMap(): Promise<Record<string, string[]>> {
  await ensureAccessControlStore();
  const out: Record<string, string[]> = {};
  for (const r of BASE_ROLES) out[r.id] = [];

  if (getDbDriver() === "mongo") {
    const db = await getMongoDb();
    const rows = await db
      .collection(ROLE_PERMS_COLLECTION)
      .find({ allowed: { $in: [1, true, "1"] } })
      .toArray();
    for (const row of rows) {
      const slug = String(row.role_slug ?? "");
      const key = String(row.feature_key ?? "");
      if (!slug || !key) continue;
      if (!out[slug]) out[slug] = [];
      out[slug].push(key);
    }
    return out;
  }

  const [rows] = await pool.execute(
    `SELECT role_slug, feature_key FROM ${ROLE_PERMS_COLLECTION} WHERE allowed = 1`,
  );
  for (const row of rows as any[]) {
    const slug = String(row.role_slug ?? "");
    const key = String(row.feature_key ?? "");
    if (!slug || !key) continue;
    if (!out[slug]) out[slug] = [];
    out[slug].push(key);
  }
  return out;
}

export async function saveRolePermissions(roleSlug: string, keys: string[]) {
  await ensureAccessControlStore();
  const slug = String(roleSlug || "").trim();
  if (!slug) throw new Error("roleSlug required");
  const uniqueKeys = [...new Set(keys.map((k) => String(k).trim()).filter(Boolean))];

  if (getDbDriver() === "mongo") {
    const db = await getMongoDb();
    await db.collection(ROLE_PERMS_COLLECTION).deleteMany({ role_slug: slug });
    if (!uniqueKeys.length) return;
    let id = await nextId(ROLE_PERMS_COLLECTION);
    await db.collection(ROLE_PERMS_COLLECTION).insertMany(
      uniqueKeys.map((feature_key) => ({
        id: id++,
        role_slug: slug,
        feature_key,
        allowed: 1,
        created_at: new Date(),
      })),
    );
    return;
  }

  await pool.execute(`DELETE FROM ${ROLE_PERMS_COLLECTION} WHERE role_slug = ?`, [slug]);
  for (const key of uniqueKeys) {
    await pool.execute(
      `INSERT INTO ${ROLE_PERMS_COLLECTION} (role_slug, feature_key, allowed) VALUES (?, ?, 1)`,
      [slug, key],
    );
  }
}

export async function loadGlobalFeatures() {
  await ensureAccessControlStore();
  const defaults = GLOBAL_FEATURES.map((f) => ({ ...f }));

  if (getDbDriver() === "mongo") {
    const db = await getMongoDb();
    const rows = await db.collection(GLOBAL_FEATURES_COLLECTION).find({}).toArray();
    const byKey = new Map(rows.map((r) => [String(r.feature_key), r]));
    return defaults.map((f) => {
      const row = byKey.get(f.key);
      if (!row) return f;
      return {
        ...f,
        name: String(row.display_name || f.name),
        desc: String(row.description || f.desc),
        on: row.is_enabled === true || row.is_enabled === 1 || row.is_enabled === "1",
      };
    });
  }

  const [rows] = await pool.execute(
    `SELECT feature_key, display_name, description, is_enabled FROM ${GLOBAL_FEATURES_COLLECTION}`,
  );
  const byKey = new Map((rows as any[]).map((r) => [String(r.feature_key), r]));
  return defaults.map((f) => {
    const row = byKey.get(f.key);
    if (!row) return f;
    return {
      ...f,
      name: String(row.display_name || f.name),
      desc: String(row.description || f.desc),
      on: Number(row.is_enabled) === 1,
    };
  });
}

export async function saveGlobalFeatures(
  features: { key: string; on: boolean; name?: string; desc?: string }[],
) {
  await ensureAccessControlStore();
  for (const f of features) {
    const key = String(f.key || "").trim();
    if (!key) continue;
    const meta = GLOBAL_FEATURES.find((g) => g.key === key);
    const name = f.name || meta?.name || key;
    const desc = f.desc || meta?.desc || "";
    const enabled = f.on ? 1 : 0;

    if (getDbDriver() === "mongo") {
      const db = await getMongoDb();
      const existing = await db.collection(GLOBAL_FEATURES_COLLECTION).findOne({ feature_key: key });
      if (existing) {
        await db.collection(GLOBAL_FEATURES_COLLECTION).updateOne(
          { feature_key: key },
          {
            $set: {
              display_name: name,
              description: desc,
              is_enabled: enabled,
              updated_at: new Date(),
            },
          },
        );
      } else {
        await db.collection(GLOBAL_FEATURES_COLLECTION).insertOne({
          id: await nextId(GLOBAL_FEATURES_COLLECTION),
          feature_key: key,
          display_name: name,
          description: desc,
          is_enabled: enabled,
          created_at: new Date(),
          updated_at: new Date(),
        });
      }
      continue;
    }

    await pool.execute(
      `INSERT INTO ${GLOBAL_FEATURES_COLLECTION} (feature_key, display_name, description, is_enabled)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE display_name = VALUES(display_name), description = VALUES(description),
         is_enabled = VALUES(is_enabled)`,
      [key, name, desc, enabled],
    );
  }
}

export async function assignEmployeeRole(employeeId: string, roleSlug: string) {
  await ensureAccessControlStore();
  const eid = String(employeeId || "").trim();
  const slug = String(roleSlug || "").trim();
  if (!eid || !slug) throw new Error("employeeId and roleSlug required");

  if (getDbDriver() === "mongo") {
    const db = await getMongoDb();
    const numeric = /^\d+$/.test(eid) ? Number(eid) : null;
    const filter =
      numeric != null
        ? { $or: [{ id: numeric }, { id: eid }, { id: String(numeric) }] }
        : { id: eid };
    const res = await db.collection("hrm_employees").updateOne(filter, {
      $set: { access_role_slug: slug, updated_at: new Date() },
    });
    if (!res.matchedCount) {
      throw new Error(`Employee ${eid} not found for role assign`);
    }
    return;
  }

  try {
    await pool.execute(`UPDATE hrm_employees SET access_role_slug = ? WHERE id = ?`, [
      slug,
      eid,
    ]);
  } catch (err) {
    await ensureMysqlTables();
    await pool.execute(`UPDATE hrm_employees SET access_role_slug = ? WHERE id = ?`, [
      slug,
      eid,
    ]);
  }
}

/** Clear System Control role assign (`access_role_slug` → null). */
export async function unassignEmployeeRole(employeeId: string) {
  await ensureAccessControlStore();
  const eid = String(employeeId || "").trim();
  if (!eid) throw new Error("employeeId required");

  if (getDbDriver() === "mongo") {
    const db = await getMongoDb();
    const numeric = /^\d+$/.test(eid) ? Number(eid) : null;
    const filter =
      numeric != null
        ? { $or: [{ id: numeric }, { id: eid }, { id: String(numeric) }] }
        : { id: eid };
    const res = await db.collection("hrm_employees").updateOne(filter, {
      $set: { access_role_slug: null, updated_at: new Date() },
    });
    if (!res.matchedCount) {
      throw new Error(`Employee ${eid} not found for role unassign`);
    }
    return;
  }

  try {
    await pool.execute(`UPDATE hrm_employees SET access_role_slug = NULL WHERE id = ?`, [eid]);
  } catch (err) {
    await ensureMysqlTables();
    await pool.execute(`UPDATE hrm_employees SET access_role_slug = NULL WHERE id = ?`, [eid]);
  }
}

export async function assignEmployeesToRole(employeeIds: string[], roleSlug: string) {
  const slug = String(roleSlug || "").trim();
  if (!slug) throw new Error("roleSlug required");
  const ids = [...new Set(employeeIds.map((id) => String(id || "").trim()).filter(Boolean))];
  if (!ids.length) throw new Error("employeeIds required");
  for (const id of ids) {
    await assignEmployeeRole(id, slug);
  }
  return ids.length;
}

export async function unassignEmployees(employeeIds: string[]) {
  const ids = [...new Set(employeeIds.map((id) => String(id || "").trim()).filter(Boolean))];
  if (!ids.length) throw new Error("employeeIds required");
  for (const id of ids) {
    await unassignEmployeeRole(id);
  }
  return ids.length;
}

export async function loadAccessEmployees(): Promise<AccessEmployee[]> {
  await ensureAccessControlStore();

  const [rows] = await pool.query(
    `SELECT e.id, e.first_name, e.last_name, e.pseudonym, e.role, e.access_role_slug,
            d.name AS department_name, j.department_id
     FROM hrm_employees e
     LEFT JOIN employee_jobs j ON e.id = j.employee_id
     LEFT JOIN departments d ON j.department_id = d.id
     ORDER BY e.id ASC`,
  );

  const list = (rows as any[]) || [];
  return list.map((row) => {
    const id = String(row.id ?? "");
    const name = [row.first_name, row.last_name].filter(Boolean).join(" ").trim() || `Employee ${id}`;
    const legacyRole = row.role != null ? String(row.role) : "";
    const stored = row.access_role_slug != null ? String(row.access_role_slug).trim() : "";
    const accessRoleSlug = stored || null;
    const roleId = accessRoleSlug || mapLegacyEmployeeRole(legacyRole);
    return {
      id,
      name,
      initials: initialsFromName(name),
      pseudonym: row.pseudonym ? String(row.pseudonym) : undefined,
      roleId,
      accessRoleSlug,
      departmentId: row.department_id != null ? String(row.department_id) : "",
      departmentName: row.department_name ? String(row.department_name) : undefined,
      reportsTo: null,
      legacyRole: legacyRole || undefined,
    };
  });
}

export function permissionCatalogKeys() {
  return FEATURE_MODULES.flatMap((m) => m.permissions.map((p) => p.key));
}

function docToRoleDef(row: Record<string, unknown>): RoleDef {
  const scope = String(row.data_scope || row.scope || "SELF");
  return {
    id: String(row.slug || row.id || ""),
    name: String(row.display_name || row.name || ""),
    description: String(row.description || ""),
    portal: String(row.portal_type || row.portal || "employee-dashboard"),
    scope,
    scopeLabel: scopeLabelFromScope(scope),
    hierarchyLevel: Number(row.hierarchy_level ?? 50),
    system: row.is_system === true || row.is_system === 1 || row.is_system === "1",
    parentId:
      row.parent_slug == null || row.parent_slug === ""
        ? null
        : String(row.parent_slug),
    tier: (row.tier as RoleDef["tier"]) || undefined,
    accent: row.accent != null ? String(row.accent) : undefined,
  };
}

/** Active org-chart roles from DB (Mongo/MySQL). */
export async function loadOrgRoles(): Promise<RoleDef[]> {
  await ensureAccessControlStore();

  if (getDbDriver() === "mongo") {
    const db = await getMongoDb();
    const rows = await db
      .collection(ROLES_COLLECTION)
      .find({
        $or: [
          { is_active: { $in: [1, true, "1"] } },
          { is_active: { $exists: false } },
        ],
      })
      .toArray();
    const roles = rows
      .map((r) => docToRoleDef(r as Record<string, unknown>))
      .filter((r) => r.id && r.name);
    if (roles.length) {
      return roles.sort((a, b) => a.hierarchyLevel - b.hierarchyLevel);
    }
    return BASE_ROLES.map((r) => ({ ...r }));
  }

  const [rows] = await pool.execute(
    `SELECT slug, display_name, description, portal_type, data_scope, hierarchy_level,
            parent_slug, tier, accent, is_system
     FROM ${ROLES_COLLECTION}
     WHERE is_active = 1
     ORDER BY hierarchy_level ASC, slug ASC`,
  );
  const roles = (rows as any[])
    .map((r) => docToRoleDef(r))
    .filter((r: RoleDef) => r.id && r.name);
  if (roles.length) return roles;
  return BASE_ROLES.map((r) => ({ ...r }));
}

/** Persist full org-chart role tree. Missing roles are soft-deactivated. */
export async function saveOrgRoles(roles: RoleDef[]) {
  await ensureAccessControlStore();
  const list = roles
    .map((r) => ({
      ...r,
      id: String(r.id || "").trim(),
      name: String(r.name || "").trim(),
    }))
    .filter((r) => r.id && r.name);
  if (!list.length) throw new Error("At least one role required");

  const keep = new Set(list.map((r) => r.id));

  if (getDbDriver() === "mongo") {
    const db = await getMongoDb();
    const col = db.collection(ROLES_COLLECTION);
    for (const r of list) {
      const existing = await col.findOne({ slug: r.id });
      const doc = {
        slug: r.id,
        display_name: r.name,
        description: r.description || "",
        portal_type: r.portal || "employee-dashboard",
        data_scope: r.scope || "SELF",
        hierarchy_level: Number(r.hierarchyLevel) || 50,
        parent_slug: r.parentId ?? null,
        tier: r.tier ?? null,
        accent: r.accent ?? null,
        is_system: r.system ? 1 : 0,
        is_active: 1,
        updated_at: new Date(),
      };
      if (existing) {
        await col.updateOne({ slug: r.id }, { $set: doc });
      } else {
        await col.insertOne({
          id: await nextId(ROLES_COLLECTION),
          ...doc,
          created_at: new Date(),
        });
      }
    }
    await col.updateMany(
      { slug: { $nin: [...keep] } },
      { $set: { is_active: 0, updated_at: new Date() } },
    );
    return;
  }

  for (const r of list) {
    await pool.execute(
      `INSERT INTO ${ROLES_COLLECTION}
        (slug, display_name, description, portal_type, data_scope, hierarchy_level,
         parent_slug, tier, accent, is_system, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE
         display_name = VALUES(display_name),
         description = VALUES(description),
         portal_type = VALUES(portal_type),
         data_scope = VALUES(data_scope),
         hierarchy_level = VALUES(hierarchy_level),
         parent_slug = VALUES(parent_slug),
         tier = VALUES(tier),
         accent = VALUES(accent),
         is_system = VALUES(is_system),
         is_active = 1`,
      [
        r.id,
        r.name,
        r.description || "",
        r.portal || "employee-dashboard",
        r.scope || "SELF",
        Number(r.hierarchyLevel) || 50,
        r.parentId ?? null,
        r.tier ?? null,
        r.accent ?? null,
        r.system ? 1 : 0,
      ],
    );
  }
  const placeholders = [...keep].map(() => "?").join(",");
  await pool.execute(
    `UPDATE ${ROLES_COLLECTION} SET is_active = 0 WHERE slug NOT IN (${placeholders})`,
    [...keep],
  );
}

/** Upsert catalog keys into global features without wiping existing toggles. */
export async function syncAccessControlCatalog() {
  await ensureAccessControlStore();

  if (getDbDriver() === "mongo") {
    const db = await getMongoDb();
    for (const f of GLOBAL_FEATURES) {
      const existing = await db
        .collection(GLOBAL_FEATURES_COLLECTION)
        .findOne({ feature_key: f.key });
      if (existing) {
        await db.collection(GLOBAL_FEATURES_COLLECTION).updateOne(
          { feature_key: f.key },
          {
            $set: {
              display_name: f.name,
              description: f.desc,
              updated_at: new Date(),
            },
          },
        );
      } else {
        await db.collection(GLOBAL_FEATURES_COLLECTION).insertOne({
          id: await nextId(GLOBAL_FEATURES_COLLECTION),
          feature_key: f.key,
          display_name: f.name,
          description: f.desc,
          is_enabled: f.on ? 1 : 0,
          created_at: new Date(),
          updated_at: new Date(),
        });
      }
    }
    return;
  }

  for (const f of GLOBAL_FEATURES) {
    await pool.execute(
      `INSERT INTO ${GLOBAL_FEATURES_COLLECTION}
        (feature_key, display_name, description, is_enabled)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         display_name = VALUES(display_name),
         description = VALUES(description)`,
      [f.key, f.name, f.desc, f.on ? 1 : 0],
    );
  }
}

export async function resolveEmployeeAccessRoleSlug(employeeId: string): Promise<{
  employeeId: string;
  name: string;
  legacyRole: string;
  roleSlug: string;
}> {
  await ensureAccessControlStore();
  const eid = String(employeeId || "").trim();
  if (!eid) throw new Error("employeeId required");

  const [rows] = await pool.query(
    `SELECT id, first_name, last_name, role, access_role_slug
     FROM hrm_employees
     WHERE id = ?
     LIMIT 1`,
    [/^\d+$/.test(eid) ? Number(eid) : eid],
  );
  let row = (rows as any[])[0];

  if (!row && getDbDriver() === "mongo") {
    const db = await getMongoDb();
    const ids = /^\d+$/.test(eid) ? [Number(eid), eid] : [eid];
    row = await db.collection("hrm_employees").findOne({ id: { $in: ids } });
  }

  if (!row) throw new Error("Employee not found");

  const legacyRole = row.role != null ? String(row.role) : "";
  const stored = row.access_role_slug != null ? String(row.access_role_slug).trim() : "";
  const roleSlug = stored || mapLegacyEmployeeRole(legacyRole);
  const name =
    [row.first_name, row.last_name].filter(Boolean).join(" ").trim() || `Employee ${eid}`;

  return {
    employeeId: String(row.id ?? eid),
    name,
    legacyRole,
    roleSlug,
  };
}

export async function loadPermissionsForRole(roleSlug: string): Promise<string[]> {
  const map = await loadPermissionMap();
  const slug = String(roleSlug || "").trim();
  if (!slug) return [];
  if (slug === "exec_board") {
    // Board / locked role: full catalog
    return permissionCatalogKeys();
  }
  return [...(map[slug] || [])];
}

/** All employees that have custom permission overrides (full key lists). */
export async function loadAllEmployeePermissionOverrides(): Promise<
  Record<string, string[]>
> {
  await ensureAccessControlStore();
  const out: Record<string, string[]> = {};

  if (getDbDriver() === "mongo") {
    const db = await getMongoDb();
    const rows = await db
      .collection(EMPLOYEE_PERMS_COLLECTION)
      .find({ allowed: { $in: [1, true, "1"] } })
      .toArray();
    for (const row of rows) {
      const eid = String(row.employee_id ?? "").trim();
      const key = String(row.feature_key ?? "").trim();
      if (!eid || !key || key === "__custom__") continue;
      if (!out[eid]) out[eid] = [];
      out[eid].push(key);
    }
    // Include employees who only have the __custom__ marker (empty custom set)
    const markers = await db
      .collection(EMPLOYEE_PERMS_COLLECTION)
      .find({ feature_key: "__custom__" })
      .toArray();
    for (const row of markers) {
      const eid = String(row.employee_id ?? "").trim();
      if (eid && out[eid] == null) out[eid] = [];
    }
    return out;
  }

  const [rows] = await pool.execute(
    `SELECT employee_id, feature_key FROM ${EMPLOYEE_PERMS_COLLECTION} WHERE allowed = 1`,
  );
  for (const row of rows as any[]) {
    const eid = String(row.employee_id ?? "").trim();
    const key = String(row.feature_key ?? "").trim();
    if (!eid || !key) continue;
    if (!out[eid]) out[eid] = [];
    out[eid].push(key);
  }
  return out;
}

export async function loadEmployeePermissionOverrides(
  employeeId: string,
): Promise<string[] | null> {
  const eid = String(employeeId || "").trim();
  if (!eid) return null;
  await ensureAccessControlStore();

  const idVariants: Array<string | number> = [eid];
  if (/^\d+$/.test(eid)) idVariants.push(Number(eid));

  if (getDbDriver() === "mongo") {
    const db = await getMongoDb();
    const rows = await db
      .collection(EMPLOYEE_PERMS_COLLECTION)
      .find({ employee_id: { $in: idVariants } })
      .toArray();
    if (!rows.length) return null;
    return rows
      .filter((r) => r.allowed === true || r.allowed === 1 || r.allowed === "1")
      .map((r) => String(r.feature_key || ""))
      .filter((k) => k && k !== "__custom__");
  }

  const placeholders = idVariants.map(() => "?").join(",");
  const [anyRows] = await pool.execute(
    `SELECT COUNT(*) AS c FROM ${EMPLOYEE_PERMS_COLLECTION} WHERE employee_id IN (${placeholders})`,
    idVariants.map(String),
  );
  if (Number((anyRows as any[])[0]?.c ?? 0) === 0) return null;

  const [rows] = await pool.execute(
    `SELECT feature_key FROM ${EMPLOYEE_PERMS_COLLECTION}
     WHERE employee_id IN (${placeholders}) AND allowed = 1 AND feature_key <> '__custom__'`,
    idVariants.map(String),
  );
  return (rows as any[]).map((r) => String(r.feature_key)).filter(Boolean);
}

/**
 * Replace employee custom permission set.
 * Pass `null` / empty with clear=true to delete overrides (fall back to role).
 */
export async function saveEmployeePermissions(
  employeeId: string,
  keys: string[] | null,
  opts?: { clear?: boolean },
) {
  await ensureAccessControlStore();
  const eid = String(employeeId || "").trim();
  if (!eid) throw new Error("employeeId required");

  const clear = opts?.clear === true || keys == null;
  const uniqueKeys = clear
    ? []
    : [...new Set((keys || []).map((k) => String(k).trim()).filter(Boolean))];

  if (getDbDriver() === "mongo") {
    const db = await getMongoDb();
    const idFilter = {
      $or: [
        { employee_id: eid },
        ...( /^\d+$/.test(eid) ? [{ employee_id: Number(eid) }, { employee_id: String(Number(eid)) }] : []),
      ],
    };
    await db.collection(EMPLOYEE_PERMS_COLLECTION).deleteMany(idFilter);
    if (clear || !uniqueKeys.length) {
      // Empty custom set: store a sentinel so we know overrides exist with zero grants?
      // Prefer: clear means delete all → fall back to role. Empty array after edit with no checks:
      // treat as custom empty (user intentionally has no perms).
      if (clear) return;
      // Save a marker row? Simpler: insert nothing and use a `_custom` flag doc
      await db.collection(EMPLOYEE_PERMS_COLLECTION).insertOne({
        id: await nextId(EMPLOYEE_PERMS_COLLECTION),
        employee_id: eid,
        feature_key: "__custom__",
        allowed: 0,
        created_at: new Date(),
        updated_at: new Date(),
      });
      return;
    }
    let id = await nextId(EMPLOYEE_PERMS_COLLECTION);
    await db.collection(EMPLOYEE_PERMS_COLLECTION).insertMany(
      uniqueKeys.map((feature_key) => ({
        id: id++,
        employee_id: eid,
        feature_key,
        allowed: 1,
        created_at: new Date(),
        updated_at: new Date(),
      })),
    );
    return;
  }

  await pool.execute(`DELETE FROM ${EMPLOYEE_PERMS_COLLECTION} WHERE employee_id = ?`, [eid]);
  if (clear) return;
  if (!uniqueKeys.length) {
    await pool.execute(
      `INSERT INTO ${EMPLOYEE_PERMS_COLLECTION} (employee_id, feature_key, allowed) VALUES (?, '__custom__', 0)`,
      [eid],
    );
    return;
  }
  for (const key of uniqueKeys) {
    await pool.execute(
      `INSERT INTO ${EMPLOYEE_PERMS_COLLECTION} (employee_id, feature_key, allowed) VALUES (?, ?, 1)`,
      [eid, key],
    );
  }
}

export async function getEmployeeAccessPayload(employeeId: string) {
  const emp = await resolveEmployeeAccessRoleSlug(employeeId);
  const [rolePermissions, features, roles, empOverride] = await Promise.all([
    loadPermissionsForRole(emp.roleSlug),
    loadGlobalFeatures(),
    loadOrgRoles(),
    loadEmployeePermissionOverrides(emp.employeeId),
  ]);

  // Custom employee set replaces role defaults; otherwise use role template.
  const permissions =
    empOverride != null
      ? empOverride.filter((k) => k !== "__custom__")
      : rolePermissions;

  const enabledFeatures: Record<string, boolean> = {};
  for (const f of features) enabledFeatures[f.key] = Boolean(f.on);

  const { buildMenuFromPermissions } = await import("./menu-registry");
  const menu = buildMenuFromPermissions(permissions, enabledFeatures);
  const roleMetaRow =
    roles.find((r) => r.id === emp.roleSlug) ||
    BASE_ROLES.find((r) => r.id === emp.roleSlug);

  return {
    employeeId: emp.employeeId,
    name: emp.name,
    legacyRole: emp.legacyRole,
    role: {
      slug: emp.roleSlug,
      display_name: roleMetaRow?.name || emp.roleSlug,
      portal_type: roleMetaRow?.portal || "employee-dashboard",
      data_scope: roleMetaRow?.scope || "SELF",
    },
    permissions,
    permission_source: empOverride != null ? "employee" : "role",
    role_permissions: rolePermissions,
    features_enabled: features.filter((f) => f.on).map((f) => f.key),
    features,
    menu,
    capabilities: {
      systemControlOpen: permissions.includes("system.control.access"),
      systemPermissionsEdit: permissions.includes("system.permissions.edit"),
      systemUsersAssign: permissions.includes("system.users.assign"),
      systemOrgChartEdit: permissions.includes("system.org_chart.edit"),
      systemFeaturesEdit:
        permissions.includes("system.features.edit") ||
        permissions.includes("system.permissions.edit"),
    },
  };
}
