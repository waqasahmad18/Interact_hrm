import fs from "fs/promises";
import path from "path";
import { query } from "@/lib/db";
import { getDateStringInTimeZone, SERVER_TIMEZONE } from "@/lib/timezone";

export const ADMIN_ACTOR_COOKIE = "hrm_admin_actor";

const ROOT = path.join(process.cwd(), "logs", "admin-activity");

export type ActivityActorProfile = {
  employee_id: string | null;
  employee_name: string | null;
  pseudonym: string | null;
  employee_code: string | null;
};

function dayStamp(d = new Date()) {
  return getDateStringInTimeZone(d, SERVER_TIMEZONE);
}

function safeName(name: string) {
  return String(name || "file")
    .replace(/[^\w.\-()+ ]+/g, "_")
    .slice(0, 120);
}

/** Resolve employee id / name / pseudonym / code for backlog rows. */
export async function resolveActivityActor(opts: {
  employeeId?: string | null;
  loginId?: string | null;
}): Promise<ActivityActorProfile> {
  const empty: ActivityActorProfile = {
    employee_id: null,
    employee_name: null,
    pseudonym: null,
    employee_code: null,
  };
  const eid = String(opts.employeeId || "").trim();
  const login = String(opts.loginId || "").trim();
  const keys = [eid, login].filter(Boolean);
  if (!keys.length) return empty;

  try {
    for (const key of keys) {
      const [rows]: any = await query(
        `SELECT id, first_name, last_name, TRIM(pseudonym) AS pseudonym, employee_code
         FROM hrm_employees
         WHERE CAST(id AS CHAR) = ? OR employee_code = ?
         LIMIT 1`,
        [key, key],
      );
      const r = Array.isArray(rows) ? rows[0] : null;
      if (!r) continue;
      const name = `${r.first_name || ""} ${r.last_name || ""}`.trim() || null;
      return {
        employee_id: String(r.id),
        employee_name: name,
        pseudonym:
          typeof r.pseudonym === "string" && r.pseudonym.trim()
            ? r.pseudonym.trim()
            : null,
        employee_code: r.employee_code != null ? String(r.employee_code) : null,
      };
    }
  } catch {
    /* ignore */
  }
  return {
    ...empty,
    employee_id: eid || null,
    employee_name: login || null,
    employee_code: login || null,
  };
}

async function insertBacklogRow(row: Record<string, unknown>) {
  try {
    await query(
      `INSERT INTO hrm_activity_backlog
        (event_ts, day_key, event_type, employee_id, employee_name, pseudonym, employee_code,
         login_id, page_path, detail, method, url, file_name, file_bytes, ip, user_agent, payload_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.event_ts,
        row.day_key,
        row.event_type,
        row.employee_id,
        row.employee_name,
        row.pseudonym,
        row.employee_code,
        row.login_id,
        row.page_path,
        row.detail,
        row.method,
        row.url,
        row.file_name,
        row.file_bytes,
        row.ip,
        row.user_agent,
        row.payload_json,
      ],
    );
  } catch {
    /* table may not exist yet — JSONL still written */
  }
}

/** Append one JSON line + DB backlog row. */
export async function appendAdminActivity(event: Record<string, unknown>) {
  try {
    const now = new Date();
    const day = dayStamp(now);
    const loginId = String(event.loginId || event.login_id || "").trim() || null;
    const employeeIdHint = String(
      event.employeeId || event.employee_id || "",
    ).trim();
    const actor = await resolveActivityActor({
      employeeId: employeeIdHint,
      loginId,
    });

    const type = String(event.type || "event");
    const page = String(event.page || event.page_path || "").slice(0, 512) || null;
    const detail = String(
      event.label || event.detail || event.description || "",
    ).slice(0, 2000) || null;
    const method = event.method != null ? String(event.method).slice(0, 16) : null;
    const url = event.url != null ? String(event.url).slice(0, 512) : null;
    const fileName =
      event.original_name != null
        ? String(event.original_name).slice(0, 255)
        : event.file_name != null
          ? String(event.file_name).slice(0, 255)
          : Array.isArray(event.files) &&
              (event.files as { name?: string }[])[0]?.name
            ? String((event.files as { name?: string }[])[0].name).slice(0, 255)
            : null;
    const fileBytes =
      typeof event.bytes === "number"
        ? event.bytes
        : typeof event.file_bytes === "number"
          ? event.file_bytes
          : null;

    const row = {
      ts: now.toISOString(),
      day,
      tz: SERVER_TIMEZONE,
      ...event,
      loginId,
      employee_id: actor.employee_id,
      employee_name: actor.employee_name,
      pseudonym: actor.pseudonym,
      employee_code: actor.employee_code,
    };

    await fs.mkdir(ROOT, { recursive: true });
    await fs.appendFile(
      path.join(ROOT, `${day}.jsonl`),
      `${JSON.stringify(row)}\n`,
      "utf8",
    );

    let payloadJson: string | null = null;
    try {
      payloadJson = JSON.stringify(event);
    } catch {
      payloadJson = null;
    }

    await insertBacklogRow({
      event_ts: now.toISOString().slice(0, 23).replace("T", " "),
      day_key: day,
      event_type: type.slice(0, 64),
      employee_id: actor.employee_id,
      employee_name: actor.employee_name,
      pseudonym: actor.pseudonym,
      employee_code: actor.employee_code,
      login_id: loginId,
      page_path: page,
      detail,
      method,
      url,
      file_name: fileName,
      file_bytes: fileBytes,
      ip: event.ip != null ? String(event.ip).slice(0, 64) : null,
      user_agent: event.ua != null ? String(event.ua).slice(0, 512) : null,
      payload_json: payloadJson,
    });
  } catch {
    // never break the app for logging
  }
}

/** Copy an uploaded/exported buffer under logs/admin-activity/files/YYYY-MM-DD/ */
export async function backupAdminActivityFile(
  originalName: string,
  data: Buffer,
  meta?: Record<string, unknown>,
): Promise<string | null> {
  try {
    const day = dayStamp();
    const dir = path.join(ROOT, "files", day);
    await fs.mkdir(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const stored = `${stamp}_${safeName(originalName)}`;
    const abs = path.join(dir, stored);
    await fs.writeFile(abs, data);
    const relative = `logs/admin-activity/files/${day}/${stored}`;
    await appendAdminActivity({
      type: "file_backup",
      original_name: originalName,
      saved_as: relative,
      bytes: data.length,
      ...meta,
    });
    return relative;
  } catch {
    return null;
  }
}

export type BacklogListOpts = {
  search?: string;
  eventType?: string;
  employeeId?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
};

export async function listActivityBacklog(opts: BacklogListOpts = {}) {
  const page = Math.max(1, Number(opts.page) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(opts.pageSize) || 50));
  const offset = (page - 1) * pageSize;
  const where: string[] = ["1=1"];
  const params: unknown[] = [];

  if (opts.dateFrom) {
    where.push("day_key >= ?");
    params.push(opts.dateFrom.slice(0, 10));
  }
  if (opts.dateTo) {
    where.push("day_key <= ?");
    params.push(opts.dateTo.slice(0, 10));
  }
  if (opts.eventType) {
    where.push("event_type = ?");
    params.push(opts.eventType);
  }
  if (opts.employeeId) {
    where.push("(employee_id = ? OR employee_code = ?)");
    params.push(opts.employeeId, opts.employeeId);
  }
  if (opts.search?.trim()) {
    const q = `%${opts.search.trim()}%`;
    where.push(
      `(employee_name LIKE ? OR pseudonym LIKE ? OR employee_code LIKE ? OR employee_id LIKE ? OR detail LIKE ? OR page_path LIKE ? OR url LIKE ? OR file_name LIKE ?)`,
    );
    params.push(q, q, q, q, q, q, q, q);
  }

  const whereSql = where.join(" AND ");
  const [countRows]: any = await query(
    `SELECT COUNT(*) AS c FROM hrm_activity_backlog WHERE ${whereSql}`,
    params,
  );
  const total = Number(countRows?.[0]?.c || 0);

  const [rows]: any = await query(
    `SELECT id, event_ts, day_key, event_type, employee_id, employee_name, pseudonym,
            employee_code, login_id, page_path, detail, method, url, file_name, file_bytes, ip
     FROM hrm_activity_backlog
     WHERE ${whereSql}
     ORDER BY event_ts DESC, id DESC
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset],
  );

  return {
    rows: Array.isArray(rows) ? rows : [],
    total,
    page,
    pageSize,
  };
}
