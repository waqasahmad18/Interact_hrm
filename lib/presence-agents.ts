import { pool } from "@/lib/db";
import { getPresenceSettings, savePresenceSettings } from "@/lib/presence-settings";

const TABLE = "presence_agents";

export type AgentHealth = "healthy" | "stale" | "offline";

export type PresenceAgentRow = {
  id: number;
  machineId: string;
  hostname: string | null;
  windowsUser: string | null;
  hrmBaseUrl: string | null;
  localEmployeeId: string | null;
  assignedEmployeeId: string | null;
  agentVersion: string | null;
  agentProduct: string | null;
  adminEnabled: boolean;
  idleSeconds: number;
  lastIp: string | null;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  health: AgentHealth;
  assignedEmployeeName: string | null;
  assignedEmployeeCode: string | null;
  assignedPseudonym: string | null;
};

type DbRow = {
  id: number;
  machine_id: string;
  hostname: string | null;
  windows_user: string | null;
  hrm_base_url: string | null;
  local_employee_id: string | null;
  assigned_employee_id: string | null;
  agent_version: string | null;
  agent_product?: string | null;
  admin_enabled?: number | boolean | null;
  idle_seconds?: number | null;
  last_ip: string | null;
  first_seen_at: Date | string | null;
  last_seen_at: Date | string | null;
  assigned_first_name?: string | null;
  assigned_last_name?: string | null;
  assigned_employee_code?: string | null;
  assigned_pseudonym?: string | null;
};

async function addColumn(sql: string) {
  try {
    await pool.execute(sql);
  } catch {
    /* already exists */
  }
}

export async function ensurePresenceAgentsTable(): Promise<void> {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS ${TABLE} (
      id int(11) NOT NULL AUTO_INCREMENT,
      machine_id varchar(128) NOT NULL,
      hostname varchar(255) DEFAULT NULL,
      windows_user varchar(255) DEFAULT NULL,
      hrm_base_url varchar(512) DEFAULT NULL,
      local_employee_id varchar(64) DEFAULT NULL,
      assigned_employee_id varchar(64) DEFAULT NULL,
      agent_version varchar(32) DEFAULT NULL,
      agent_product varchar(64) DEFAULT NULL,
      admin_enabled tinyint(1) NOT NULL DEFAULT 0,
      idle_seconds int(11) NOT NULL DEFAULT 120,
      last_ip varchar(45) DEFAULT NULL,
      first_seen_at datetime DEFAULT NULL,
      last_seen_at datetime DEFAULT NULL,
      pending_command varchar(32) DEFAULT NULL,
      command_issued_at datetime DEFAULT NULL,
      created_at timestamp NOT NULL DEFAULT current_timestamp(),
      updated_at timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
      PRIMARY KEY (id),
      UNIQUE KEY uq_presence_agents_machine (machine_id),
      KEY idx_presence_agents_last_seen (last_seen_at),
      KEY idx_presence_agents_assigned (assigned_employee_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await addColumn(
    `ALTER TABLE ${TABLE} ADD COLUMN pending_command varchar(32) DEFAULT NULL`,
  );
  await addColumn(
    `ALTER TABLE ${TABLE} ADD COLUMN command_issued_at datetime DEFAULT NULL`,
  );
  await addColumn(
    `ALTER TABLE ${TABLE} ADD COLUMN agent_product varchar(64) DEFAULT NULL`,
  );
  await addColumn(
    `ALTER TABLE ${TABLE} ADD COLUMN admin_enabled tinyint(1) NOT NULL DEFAULT 0`,
  );
  await addColumn(
    `ALTER TABLE ${TABLE} ADD COLUMN idle_seconds int(11) NOT NULL DEFAULT 120`,
  );
}

export function agentHealthFromLastSeen(lastSeen: Date | string | null): AgentHealth {
  if (!lastSeen) return "offline";
  const t = lastSeen instanceof Date ? lastSeen.getTime() : new Date(lastSeen).getTime();
  if (!Number.isFinite(t)) return "offline";
  const ageMs = Date.now() - t;
  if (ageMs <= 3 * 60 * 1000) return "healthy";
  if (ageMs <= 30 * 60 * 1000) return "stale";
  return "offline";
}

function toIso(v: Date | string | null): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d.toISOString() : String(v);
}

function asBool(v: unknown): boolean {
  return v === true || v === 1 || v === "1";
}

function mapRow(r: DbRow): PresenceAgentRow {
  const assignedEmployeeName =
    [r.assigned_first_name, r.assigned_last_name].filter(Boolean).join(" ").trim() || null;
  return {
    id: r.id,
    machineId: r.machine_id,
    hostname: r.hostname,
    windowsUser: r.windows_user,
    hrmBaseUrl: r.hrm_base_url,
    localEmployeeId: r.local_employee_id,
    assignedEmployeeId: r.assigned_employee_id,
    agentVersion: r.agent_version,
    agentProduct: r.agent_product ?? null,
    adminEnabled: asBool(r.admin_enabled),
    idleSeconds: Number(r.idle_seconds) > 0 ? Number(r.idle_seconds) : 120,
    lastIp: r.last_ip,
    firstSeenAt: toIso(r.first_seen_at),
    lastSeenAt: toIso(r.last_seen_at),
    health: agentHealthFromLastSeen(r.last_seen_at),
    assignedEmployeeName,
    assignedEmployeeCode: r.assigned_employee_code ?? null,
    assignedPseudonym: r.assigned_pseudonym?.trim() || null,
  };
}

export type HeartbeatInput = {
  machineId: string;
  hostname?: string | null;
  windowsUser?: string | null;
  hrmBaseUrl?: string | null;
  localEmployeeId?: string | null;
  agentVersion?: string | null;
  agentProduct?: string | null;
  clientIp?: string | null;
};

export type AgentCommand = "restart" | "exit" | "start" | "pause" | "resume" | "on";

export type HeartbeatResult = {
  assignedEmployeeId: string | null;
  assignedEmployeeName: string | null;
  pseudonym: string | null;
  command: AgentCommand | null;
  adminEnabled: boolean;
  idleSeconds: number;
  exitPassword: string;
};

export async function upsertAgentHeartbeat(
  input: HeartbeatInput,
): Promise<HeartbeatResult> {
  await ensurePresenceAgentsTable();
  const machineId = String(input.machineId ?? "").trim();
  if (!machineId || machineId.length > 128) {
    throw new Error("machine_id required");
  }

  const hostname = trimOrNull(input.hostname, 255);
  const windowsUser = trimOrNull(input.windowsUser, 255);
  const hrmBaseUrl = trimOrNull(input.hrmBaseUrl, 512);
  const localEmployeeId = trimOrNull(input.localEmployeeId, 64);
  const agentVersion = trimOrNull(input.agentVersion, 32);
  const agentProduct = trimOrNull(input.agentProduct, 64);
  const lastIp = trimOrNull(input.clientIp, 45);
  const now = new Date();

  await pool.execute(
    `INSERT INTO ${TABLE}
      (machine_id, hostname, windows_user, hrm_base_url, local_employee_id, agent_version, agent_product, last_ip, first_seen_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       hostname = VALUES(hostname),
       windows_user = VALUES(windows_user),
       hrm_base_url = VALUES(hrm_base_url),
       local_employee_id = VALUES(local_employee_id),
       agent_version = VALUES(agent_version),
       agent_product = COALESCE(VALUES(agent_product), agent_product),
       last_ip = VALUES(last_ip),
       last_seen_at = VALUES(last_seen_at)`,
    [
      machineId,
      hostname,
      windowsUser,
      hrmBaseUrl,
      localEmployeeId,
      agentVersion,
      agentProduct,
      lastIp,
      now,
      now,
    ],
  );

  // Same PC + same Windows user must be one row (old reinstalls used random machine_ids)
  await mergeDuplicateAgentsForPc(hostname, windowsUser, machineId);

  // Auto-bind: if PC sent employee id from dashboard and admin hasn't assigned yet
  if (localEmployeeId && /^\d+$/.test(localEmployeeId)) {
    await pool.execute(
      `UPDATE ${TABLE}
       SET assigned_employee_id = ?
       WHERE machine_id = ?
         AND (assigned_employee_id IS NULL OR assigned_employee_id = '' OR assigned_employee_id = local_employee_id)`,
      [localEmployeeId, machineId],
    );
  }

  const [rows] = await pool.execute(
    `SELECT pa.assigned_employee_id,
            pa.pending_command,
            pa.admin_enabled,
            pa.idle_seconds,
            e.first_name AS assigned_first_name,
            e.last_name AS assigned_last_name,
            e.pseudonym AS assigned_pseudonym
     FROM ${TABLE} pa
     LEFT JOIN hrm_employees e ON e.id = pa.assigned_employee_id
     WHERE pa.machine_id = ?
     LIMIT 1`,
    [machineId],
  );
  const list = rows as {
    assigned_employee_id: string | null;
    pending_command: string | null;
    admin_enabled: number | boolean | null;
    idle_seconds: number | null;
    assigned_first_name: string | null;
    assigned_last_name: string | null;
    assigned_pseudonym: string | null;
  }[];
  const row = list[0];
  const assignedEmployeeId = row?.assigned_employee_id?.trim() || null;
  const assignedEmployeeName =
    [row?.assigned_first_name, row?.assigned_last_name].filter(Boolean).join(" ").trim() ||
    null;
  const pseudonym = row?.assigned_pseudonym?.trim() || null;

  let adminEnabled = asBool(row?.admin_enabled);
  let idleSeconds = Number(row?.idle_seconds) > 0 ? Number(row.idle_seconds) : 120;

  let command: AgentCommand | null = null;
  const rawCmd = (row?.pending_command ?? "").trim().toLowerCase();
  const allowed: AgentCommand[] = ["restart", "exit", "start", "pause", "resume", "on"];
  if (allowed.includes(rawCmd as AgentCommand)) {
    command = rawCmd as AgentCommand;
    if (command === "pause") {
      adminEnabled = false;
      await pool.execute(`UPDATE ${TABLE} SET admin_enabled = 0 WHERE machine_id = ?`, [
        machineId,
      ]);
    }
    if (command === "resume" || command === "on" || command === "start") {
      adminEnabled = true;
      await pool.execute(`UPDATE ${TABLE} SET admin_enabled = 1 WHERE machine_id = ?`, [
        machineId,
      ]);
    }
    await pool.execute(
      `UPDATE ${TABLE} SET pending_command = NULL, command_issued_at = NULL WHERE machine_id = ?`,
      [machineId],
    );
  }

  const settings = await getPresenceSettings();
  if (settings.agentsRetired) {
    command = "exit";
    adminEnabled = false;
  }
  if (idleSeconds <= 0 && settings.idleWarningSeconds > 0) {
    idleSeconds = settings.idleWarningSeconds;
  }

  return {
    assignedEmployeeId,
    assignedEmployeeName,
    pseudonym,
    command,
    adminEnabled,
    idleSeconds,
    exitPassword: settings.agentExitPassword || "InteractAdmin",
  };
}

export async function listPresenceAgents(): Promise<PresenceAgentRow[]> {
  await ensurePresenceAgentsTable();
  // Clean historical duplicates before listing (same PC must not appear 20×)
  try {
    await purgeDuplicatePresenceAgents();
  } catch {
    /* non-fatal */
  }
  const [rows] = await pool.execute(
    `SELECT pa.*,
            e.first_name AS assigned_first_name,
            e.last_name AS assigned_last_name,
            e.employee_code AS assigned_employee_code,
            e.pseudonym AS assigned_pseudonym
     FROM ${TABLE} pa
     LEFT JOIN hrm_employees e ON e.id = pa.assigned_employee_id
     ORDER BY pa.last_seen_at IS NULL, pa.last_seen_at DESC, pa.id DESC`,
  );
  return (rows as DbRow[]).map(mapRow);
}

export async function setAgentAssignedEmployee(
  machineId: string,
  assignedEmployeeId: string | null,
): Promise<PresenceAgentRow | null> {
  await ensurePresenceAgentsTable();
  const mid = String(machineId ?? "").trim();
  if (!mid) throw new Error("machine_id required");

  let assigned: string | null = assignedEmployeeId?.trim() || null;
  if (assigned) {
    const [empRows] = await pool.execute(
      "SELECT id FROM hrm_employees WHERE id = ? LIMIT 1",
      [assigned],
    );
    const emp = empRows as { id: number }[];
    if (!emp[0]) throw new Error("Employee not found");
  }

  await pool.execute(`UPDATE ${TABLE} SET assigned_employee_id = ? WHERE machine_id = ?`, [
    assigned,
    mid,
  ]);
  return getAgentByMachineId(mid);
}

export async function setAgentAdminEnabled(
  machineId: string,
  enabled: boolean,
): Promise<PresenceAgentRow | null> {
  await ensurePresenceAgentsTable();
  const mid = String(machineId ?? "").trim();
  if (!mid) throw new Error("machine_id required");
  await pool.execute(`UPDATE ${TABLE} SET admin_enabled = ? WHERE machine_id = ?`, [
    enabled ? 1 : 0,
    mid,
  ]);
  // Also queue resume/pause so running agent flips immediately
  await queueAgentCommand({
    machineId: mid,
    command: enabled ? "on" : "pause",
  });
  return getAgentByMachineId(mid);
}

export async function setAgentIdleSeconds(
  machineId: string,
  idleSeconds: number,
): Promise<PresenceAgentRow | null> {
  await ensurePresenceAgentsTable();
  const mid = String(machineId ?? "").trim();
  if (!mid) throw new Error("machine_id required");
  const sec = Math.max(30, Math.min(86400, Math.floor(Number(idleSeconds) || 120)));
  await pool.execute(`UPDATE ${TABLE} SET idle_seconds = ? WHERE machine_id = ?`, [
    sec,
    mid,
  ]);
  return getAgentByMachineId(mid);
}

async function getAgentByMachineId(mid: string): Promise<PresenceAgentRow | null> {
  const [rows] = await pool.execute(
    `SELECT pa.*,
            e.first_name AS assigned_first_name,
            e.last_name AS assigned_last_name,
            e.employee_code AS assigned_employee_code,
            e.pseudonym AS assigned_pseudonym
     FROM ${TABLE} pa
     LEFT JOIN hrm_employees e ON e.id = pa.assigned_employee_id
     WHERE pa.machine_id = ?
     LIMIT 1`,
    [mid],
  );
  const list = rows as DbRow[];
  return list[0] ? mapRow(list[0]) : null;
}

function trimOrNull(v: string | null | undefined, max: number): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

/**
 * Collapse duplicate agent rows for the same hostname + Windows user.
 * Keeps the row matching `keepMachineId` (or newest), copies useful fields, deletes the rest.
 */
export async function mergeDuplicateAgentsForPc(
  hostname: string | null,
  windowsUser: string | null,
  keepMachineId: string,
): Promise<number> {
  const host = String(hostname ?? "").trim();
  if (!host) return 0;
  const user = String(windowsUser ?? "").trim();

  const [rows] = await pool.execute(
    `SELECT id, machine_id, assigned_employee_id, admin_enabled, idle_seconds, local_employee_id
     FROM ${TABLE}
     WHERE LOWER(TRIM(hostname)) = LOWER(?)
       AND LOWER(TRIM(COALESCE(windows_user, ''))) = LOWER(?)
     ORDER BY last_seen_at DESC, id DESC`,
    [host, user],
  );
  const list = rows as {
    id: number;
    machine_id: string;
    assigned_employee_id: string | null;
    admin_enabled: number | boolean | null;
    idle_seconds: number | null;
    local_employee_id: string | null;
  }[];
  if (list.length <= 1) return 0;

  const keep =
    list.find((r) => r.machine_id === keepMachineId) || list[0];
  const others = list.filter((r) => r.id !== keep.id);
  if (!others.length) return 0;

  // Preserve best assignment / admin_enabled from any duplicate
  let assigned = keep.assigned_employee_id;
  let adminOn = asBool(keep.admin_enabled);
  let idle = Number(keep.idle_seconds) > 0 ? Number(keep.idle_seconds) : 120;
  let localId = keep.local_employee_id;
  for (const o of others) {
    if (!assigned && o.assigned_employee_id) assigned = o.assigned_employee_id;
    if (!adminOn && asBool(o.admin_enabled)) adminOn = true;
    if ((!localId || !String(localId).trim()) && o.local_employee_id)
      localId = o.local_employee_id;
    const oi = Number(o.idle_seconds);
    if (oi > 0) idle = oi;
  }

  // Delete duplicates first (avoids UNIQUE conflict when renaming machine_id)
  const ids = others.map((o) => o.id);
  await pool.execute(
    `DELETE FROM ${TABLE} WHERE id IN (${ids.map(() => "?").join(",")})`,
    ids,
  );

  await pool.execute(
    `UPDATE ${TABLE}
     SET machine_id = ?,
         assigned_employee_id = COALESCE(?, assigned_employee_id),
         local_employee_id = COALESCE(?, local_employee_id),
         admin_enabled = ?,
         idle_seconds = ?,
         last_seen_at = NOW()
     WHERE id = ?`,
    [keepMachineId, assigned, localId, adminOn ? 1 : 0, idle, keep.id],
  );

  return ids.length;
}

/** One-shot cleanup: merge all hostname+user groups that have duplicates. */
export async function purgeDuplicatePresenceAgents(): Promise<number> {
  await ensurePresenceAgentsTable();
  const [groups] = await pool.execute(
    `SELECT LOWER(TRIM(hostname)) AS h,
            LOWER(TRIM(COALESCE(windows_user, ''))) AS u,
            COUNT(*) AS c,
            MAX(machine_id) AS any_mid
     FROM ${TABLE}
     WHERE hostname IS NOT NULL AND TRIM(hostname) <> ''
     GROUP BY LOWER(TRIM(hostname)), LOWER(TRIM(COALESCE(windows_user, '')))
     HAVING COUNT(*) > 1`,
  );
  let removed = 0;
  for (const g of groups as { h: string; u: string; any_mid: string }[]) {
    // Prefer machine_id of the most recently seen row in the group
    const [top] = await pool.execute(
      `SELECT machine_id, hostname, windows_user
       FROM ${TABLE}
       WHERE LOWER(TRIM(hostname)) = ?
         AND LOWER(TRIM(COALESCE(windows_user, ''))) = ?
       ORDER BY last_seen_at DESC, id DESC
       LIMIT 1`,
      [g.h, g.u],
    );
    const row = (top as { machine_id: string; hostname: string; windows_user: string }[])[0];
    if (!row) continue;
    removed += await mergeDuplicateAgentsForPc(
      row.hostname,
      row.windows_user,
      row.machine_id,
    );
  }
  return removed;
}

export async function queueAgentCommand(input: {
  machineId?: string | null;
  all?: boolean;
  command: AgentCommand;
}): Promise<number> {
  await ensurePresenceAgentsTable();
  const cmd = input.command;
  const allowed: AgentCommand[] = ["restart", "exit", "start", "pause", "resume", "on"];
  if (!allowed.includes(cmd)) {
    throw new Error("invalid command");
  }
  const now = new Date();
  if (input.all) {
    const [res] = await pool.execute(
      `UPDATE ${TABLE} SET pending_command = ?, command_issued_at = ?`,
      [cmd, now],
    );
    return (res as { affectedRows?: number }).affectedRows ?? 0;
  }
  const mid = String(input.machineId ?? "").trim();
  if (!mid) throw new Error("machine_id required unless all=true");
  const [res] = await pool.execute(
    `UPDATE ${TABLE} SET pending_command = ?, command_issued_at = ? WHERE machine_id = ?`,
    [cmd, now, mid],
  );
  const n = (res as { affectedRows?: number }).affectedRows ?? 0;
  if (n === 0) throw new Error("Agent not found");
  return n;
}

export async function retireAllPresenceAgents(): Promise<{ queued: number }> {
  await savePresenceSettings({
    agentsRetired: true,
    presenceEnabled: false,
  });
  const queued = await queueAgentCommand({ all: true, command: "exit" });
  return { queued };
}

export async function activateAllPresenceAgents(): Promise<{ queued: number }> {
  await savePresenceSettings({
    agentsRetired: false,
    presenceEnabled: true,
  });
  const queued = await queueAgentCommand({ all: true, command: "restart" });
  return { queued };
}
