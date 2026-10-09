import { execFile } from "node:child_process";
import path from "node:path";
import { pool } from "@/lib/db";
import { ensureAdminSettingsTable } from "@/lib/admin-settings";
import {
  EMPLOYEE_TICKETS_TABLE,
  buildTicketNumber,
  ensureEmployeeTicketsTable,
  rowToTicket,
} from "@/lib/employee-tickets-table";
import { broadcastWsEvent } from "@/lib/ws-broadcast";
import { getEmployeePseudonym } from "@/lib/ticket-employee-meta";
import { seedEmployeeMessage } from "@/lib/ticket-thread";

const TABLE = "hrm_admin_settings";
const KEY_ENABLED = "guard_keyword_watch_enabled";
const KEY_KEYWORDS = "guard_keyword_watch_keywords";
const KEY_WEBSITES = "guard_policy_websites";
const KEY_APPS = "guard_policy_apps";
const KEY_UPLOADS = "guard_policy_uploads";
const KEY_DEDUP = "guard_keyword_watch_dedup_minutes";

export const GUARD_KEYWORD_TICKET_TYPE = "guard_policy_alert";

export type GuardPolicyKind = "keyword" | "website" | "app" | "upload";

/** Starter OCR / language list — editable in Guard Policy tab. */
export const DEFAULT_GUARD_KEYWORDS = [
  "fuck",
  "fucking",
  "shit",
  "bitch",
  "bastard",
  "asshole",
  "idiot",
  "stupid",
  "porn",
  "pornhub",
  "xxx",
  "nude",
  "nudes",
  "sex video",
  "onlyfans",
  "hentai",
  "xvideos",
  "xnxx",
  "adult video",
  "harassment",
];

export const DEFAULT_GUARD_WEBSITES = [
  "pornhub.com",
  "xvideos.com",
  "xnxx.com",
  "xhamster.com",
  "onlyfans.com",
  "chaturbate.com",
  "redtube.com",
];

export const DEFAULT_GUARD_APPS: string[] = [];

export const DEFAULT_GUARD_UPLOADS = [
  ".torrent",
  "upload files",
  "open file",
  "choose file",
  "select files to upload",
];

export type GuardKeywordWatchSettings = {
  enabled: boolean;
  keywords: string[];
  websites: string[];
  apps: string[];
  uploads: string[];
  dedupMinutes: number;
};

async function getRaw(key: string): Promise<string | null> {
  await ensureAdminSettingsTable();
  const [rows] = await pool.execute(
    `SELECT setting_value FROM ${TABLE} WHERE setting_key = ? LIMIT 1`,
    [key]
  );
  const list = rows as { setting_value: string }[];
  return list[0]?.setting_value ?? null;
}

async function setRaw(key: string, value: string): Promise<void> {
  await ensureAdminSettingsTable();
  await pool.execute(
    `INSERT INTO ${TABLE} (setting_key, setting_value) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
    [key, value]
  );
}

function normalizeList(raw: unknown, maxLen = 120): string[] {
  const list = Array.isArray(raw)
    ? raw.map((v) => String(v || "").trim())
    : String(raw || "")
        .split(/\r?\n|,/)
        .map((v) => v.trim());
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    if (!item || item.length < 2) continue;
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item.slice(0, maxLen));
    if (out.length >= 400) break;
  }
  return out;
}

function parseListOrDefault(
  raw: string | null,
  fallback: string[],
  allowEmptyDefault = false
): string[] {
  if (raw == null) return [...fallback];
  if (!String(raw).trim()) return allowEmptyDefault ? [] : [...fallback];
  try {
    const parsed = JSON.parse(raw);
    const list = normalizeList(parsed);
    if (!list.length && !allowEmptyDefault) return [...fallback];
    return list;
  } catch {
    const list = normalizeList(raw);
    if (!list.length && !allowEmptyDefault) return [...fallback];
    return list;
  }
}

export async function getGuardKeywordWatchSettings(): Promise<GuardKeywordWatchSettings> {
  const [enabledRaw, keywordsRaw, websitesRaw, appsRaw, uploadsRaw, dedupRaw] =
    await Promise.all([
      getRaw(KEY_ENABLED),
      getRaw(KEY_KEYWORDS),
      getRaw(KEY_WEBSITES),
      getRaw(KEY_APPS),
      getRaw(KEY_UPLOADS),
      getRaw(KEY_DEDUP),
    ]);

  const dedup = Math.min(
    24 * 60,
    Math.max(5, Number.parseInt(String(dedupRaw || "60"), 10) || 60)
  );

  return {
    enabled:
      enabledRaw == null
        ? true
        : !/^(0|false|no|off)$/i.test(String(enabledRaw).trim()),
    keywords: parseListOrDefault(keywordsRaw, DEFAULT_GUARD_KEYWORDS),
    websites: parseListOrDefault(websitesRaw, DEFAULT_GUARD_WEBSITES),
    apps: parseListOrDefault(appsRaw, DEFAULT_GUARD_APPS, true),
    uploads: parseListOrDefault(uploadsRaw, DEFAULT_GUARD_UPLOADS),
    dedupMinutes: dedup,
  };
}

export async function saveGuardKeywordWatchSettings(
  input: Partial<GuardKeywordWatchSettings>
): Promise<GuardKeywordWatchSettings> {
  const current = await getGuardKeywordWatchSettings();
  const next: GuardKeywordWatchSettings = {
    enabled:
      typeof input.enabled === "boolean" ? input.enabled : current.enabled,
    keywords:
      input.keywords != null
        ? normalizeList(input.keywords)
        : current.keywords,
    websites:
      input.websites != null
        ? normalizeList(input.websites)
        : current.websites,
    apps: input.apps != null ? normalizeList(input.apps) : current.apps,
    uploads:
      input.uploads != null ? normalizeList(input.uploads) : current.uploads,
    dedupMinutes: Math.min(
      24 * 60,
      Math.max(
        5,
        Number(input.dedupMinutes ?? current.dedupMinutes) ||
          current.dedupMinutes
      )
    ),
  };
  if (!next.keywords.length) next.keywords = DEFAULT_GUARD_KEYWORDS;

  await Promise.all([
    setRaw(KEY_ENABLED, next.enabled ? "1" : "0"),
    setRaw(KEY_KEYWORDS, JSON.stringify(next.keywords)),
    setRaw(KEY_WEBSITES, JSON.stringify(next.websites)),
    setRaw(KEY_APPS, JSON.stringify(next.apps)),
    setRaw(KEY_UPLOADS, JSON.stringify(next.uploads)),
    setRaw(KEY_DEDUP, String(next.dedupMinutes)),
  ]);
  return next;
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Word-aware match for OCR keywords. */
export function findMatchedKeywords(text: string, keywords: string[]): string[] {
  const source = String(text || "");
  if (!source.trim()) return [];
  const hits: string[] = [];
  for (const kw of keywords) {
    const needle = String(kw || "").trim();
    if (needle.length < 2) continue;
    if (/\s/.test(needle) || needle.includes(".")) {
      if (source.toLowerCase().includes(needle.toLowerCase())) hits.push(needle);
      continue;
    }
    const re = new RegExp(
      `(?:^|[^a-z0-9_])${escapeRegExp(needle)}(?:[^a-z0-9_]|$)`,
      "i"
    );
    if (re.test(source)) hits.push(needle);
  }
  return [...new Set(hits)];
}

function normalizeLoose(s: string) {
  return String(s || "")
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .trim();
}

/** Substring match for sites/apps/upload phrases. */
export function findMatchedLoose(haystack: string, needles: string[]): string[] {
  const source = normalizeLoose(haystack);
  if (!source) return [];
  const hits: string[] = [];
  for (const item of needles) {
    const needle = normalizeLoose(item);
    if (needle.length < 2) continue;
    if (source.includes(needle)) hits.push(item.trim());
  }
  return [...new Set(hits)];
}

export type PolicyMatch = {
  kind: GuardPolicyKind;
  matched: string[];
  evidence: string;
};

export function evaluateTextPolicy(
  text: string,
  settings: GuardKeywordWatchSettings
): PolicyMatch | null {
  const source = String(text || "");
  if (!source.trim()) return null;

  const sites = findMatchedLoose(source, settings.websites);
  if (sites.length) {
    return { kind: "website", matched: sites, evidence: source.slice(0, 1600) };
  }

  const uploads = findMatchedLoose(source, settings.uploads);
  if (uploads.length) {
    return { kind: "upload", matched: uploads, evidence: source.slice(0, 1600) };
  }

  const apps = findMatchedLoose(source, settings.apps);
  if (apps.length) {
    return { kind: "app", matched: apps, evidence: source.slice(0, 1600) };
  }

  const words = findMatchedKeywords(source, settings.keywords);
  if (words.length) {
    return { kind: "keyword", matched: words, evidence: source.slice(0, 1600) };
  }

  return null;
}

export function evaluateAppActivityPolicy(
  appName: string,
  appPath: string | null | undefined,
  caption: string | null | undefined,
  settings: GuardKeywordWatchSettings
): PolicyMatch | null {
  const appHay = [appName, appPath || ""].filter(Boolean).join("\n");
  const captionHay = String(caption || "");
  const combined = [appHay, captionHay].filter(Boolean).join("\n");

  const apps = findMatchedLoose(appHay, settings.apps);
  if (apps.length) {
    return { kind: "app", matched: apps, evidence: combined.slice(0, 1600) };
  }

  const sites = findMatchedLoose(combined, settings.websites);
  if (sites.length) {
    return { kind: "website", matched: sites, evidence: combined.slice(0, 1600) };
  }

  const uploads = findMatchedLoose(combined, settings.uploads);
  if (uploads.length) {
    return { kind: "upload", matched: uploads, evidence: combined.slice(0, 1600) };
  }

  return null;
}

function ocrTextFromFile(absPath: string): Promise<string> {
  const script = path.join(process.cwd(), "image-to-text", "run-scan.js");
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      ["--max-old-space-size=448", script, absPath],
      {
        cwd: process.cwd(),
        env: process.env,
        timeout: 55000,
        maxBuffer: 1024 * 1024,
      },
      (err, stdout) => {
        const raw = String(stdout || "").trim();
        try {
          const parsed = JSON.parse(raw) as {
            ok?: boolean;
            text?: string;
            error?: string;
          };
          if (!parsed.ok) {
            reject(new Error(parsed.error || "OCR failed"));
            return;
          }
          resolve(String(parsed.text || ""));
          return;
        } catch {
          /* fall through */
        }
        reject(
          new Error(err ? "OCR process failed" : "OCR returned an invalid response")
        );
      }
    );
  });
}

export type KeywordAlertInput = {
  absolutePath: string;
  relativePath: string;
  employeeId: string;
  employeeName?: string;
  pseudonym?: string;
  ocrText?: string;
};

export type KeywordAlertResult =
  | { ok: true; skipped: true; reason: string }
  | {
      ok: true;
      skipped?: false;
      ticketId: number;
      ticketNumber: string;
      matched: string[];
      kind: GuardPolicyKind;
    }
  | { ok: false; error: string };

function kindLabel(kind: GuardPolicyKind) {
  if (kind === "website") return "restricted website";
  if (kind === "app") return "restricted app";
  if (kind === "upload") return "restricted upload / file action";
  return "abusive / indecent wording";
}

/** Silent: inbox only — no manager toast popup. */
function broadcastSilentTicket(ticket: Record<string, unknown>) {
  broadcastWsEvent({
    type: "ticket_update",
    ticket,
    silent: true,
  });
}

export async function createGuardPolicyTicket(input: {
  employeeId: string;
  employeeName?: string;
  pseudonym?: string;
  kind: GuardPolicyKind;
  matched: string[];
  evidence: string;
  relativePath?: string;
  sourceDetail?: string;
}): Promise<KeywordAlertResult> {
  await ensureEmployeeTicketsTable();
  const settings = await getGuardKeywordWatchSettings();
  if (!settings.enabled) {
    return { ok: true, skipped: true, reason: "disabled" };
  }
  if (!input.matched.length) {
    return { ok: true, skipped: true, reason: "no_match" };
  }

  const employeeId = String(input.employeeId || "").trim();
  if (!employeeId) {
    return { ok: false, error: "employee_id required" };
  }

  let employeeName = String(input.employeeName || "").trim();
  let pseudonym = String(input.pseudonym || "").trim();
  try {
    const [rows] = await pool.query(
      `SELECT first_name, last_name, pseudonym FROM hrm_employees WHERE id = ? LIMIT 1`,
      [employeeId]
    );
    const emp = (
      rows as { first_name?: string; last_name?: string; pseudonym?: string }[]
    )[0];
    if (emp) {
      const n = `${emp.first_name || ""} ${emp.last_name || ""}`.trim();
      if (n) employeeName = n;
      if (emp.pseudonym?.trim()) pseudonym = emp.pseudonym.trim();
    }
  } catch {
    /* keep */
  }
  if (!pseudonym) {
    pseudonym = (await getEmployeePseudonym(employeeId)) || "";
  }
  if (!employeeName) employeeName = `Employee ${employeeId}`;

  const dedupMs = settings.dedupMinutes * 60 * 1000;
  try {
    const [dupRows] = await pool.query(
      `SELECT id, ticket_number, requested_at, status FROM ${EMPLOYEE_TICKETS_TABLE}
       WHERE employee_id = ?
         AND ticket_type = ?
         AND status IN ('pending', 'in_progress')
       ORDER BY id DESC
       LIMIT 10`,
      [employeeId, GUARD_KEYWORD_TICKET_TYPE]
    );
    const cutoff = Date.now() - dedupMs;
    const recent = (Array.isArray(dupRows) ? dupRows : []).find((row) => {
      const r = row as { requested_at?: string | Date };
      const raw = r.requested_at;
      let ts = 0;
      if (raw instanceof Date) ts = raw.getTime();
      else if (raw != null) {
        const s = String(raw).trim();
        ts = Date.parse(s.includes("T") ? s : s.replace(" ", "T"));
      }
      return Number.isFinite(ts) && ts >= cutoff;
    }) as { id: number } | undefined;
    if (recent?.id) {
      return { ok: true, skipped: true, reason: "deduped" };
    }
  } catch {
    /* continue */
  }

  const matchedLabel = input.matched.slice(0, 8).join(", ");
  const subject = `Policy alert — ${employeeName}${
    pseudonym ? ` (${pseudonym})` : ""
  } · ${kindLabel(input.kind)}`;
  const description = [
    `Interact Guard policy watch detected ${kindLabel(input.kind)}.`,
    `Employee: ${employeeName}`,
    pseudonym ? `Pseudonym: ${pseudonym}` : null,
    `HRM ID: ${employeeId}`,
    `Matched: ${matchedLabel}`,
    input.relativePath ? `Screenshot: ${input.relativePath}` : null,
    input.sourceDetail ? `Source: ${input.sourceDetail}` : null,
    "",
    "Evidence:",
    input.evidence.slice(0, 1200) || "(empty)",
    "",
    "Silent alert — ticket inbox only (no popup).",
  ]
    .filter((line) => line != null)
    .join("\n");

  const formJson = JSON.stringify({
    employee_id: employeeId,
    employee_name: employeeName,
    pseudonym: pseudonym || null,
    policy_kind: input.kind,
    matched: input.matched,
    screenshot_path: input.relativePath || null,
    source: "guard_policy_watch",
    silent: true,
  });

  const [result]: any = await pool.query(
    `INSERT INTO ${EMPLOYEE_TICKETS_TABLE}
     (ticket_number, employee_id, employee_name, category, ticket_type, is_custom,
      subject, description, form_data, priority, status, requested_at, updated_at)
     VALUES ('PENDING', ?, ?, 'HR', ?, 0,
      ?, ?, ?, 'high', 'pending', NOW(), NOW())`,
    [
      employeeId,
      employeeName,
      GUARD_KEYWORD_TICKET_TYPE,
      subject,
      description,
      formJson,
    ]
  );

  const id = Number(result?.insertId);
  const ticketNumber = buildTicketNumber(id);
  await pool.query(
    `UPDATE ${EMPLOYEE_TICKETS_TABLE} SET ticket_number = ? WHERE id = ?`,
    [ticketNumber, id]
  );

  const messages = seedEmployeeMessage("Interact Guard", description);
  try {
    await pool.query(
      `UPDATE ${EMPLOYEE_TICKETS_TABLE} SET messages = ? WHERE id = ?`,
      [JSON.stringify(messages), id]
    );
  } catch {
    /* optional */
  }

  const [rows]: any = await pool.query(
    `SELECT * FROM ${EMPLOYEE_TICKETS_TABLE} WHERE id = ? LIMIT 1`,
    [id]
  );
  const ticket = rowToTicket(rows[0]);
  try {
    broadcastSilentTicket({
      ...ticket,
      employee_pseudonym: pseudonym || null,
    } as any);
  } catch {
    /* inbox can still load on refresh */
  }

  return {
    ok: true,
    ticketId: id,
    ticketNumber,
    matched: input.matched,
    kind: input.kind,
  };
}

/** @deprecated use createGuardPolicyTicket */
export async function createGuardKeywordTicket(input: {
  employeeId: string;
  employeeName?: string;
  pseudonym?: string;
  matched: string[];
  relativePath: string;
  ocrExcerpt: string;
}): Promise<KeywordAlertResult> {
  return createGuardPolicyTicket({
    employeeId: input.employeeId,
    employeeName: input.employeeName,
    pseudonym: input.pseudonym,
    kind: "keyword",
    matched: input.matched,
    evidence: input.ocrExcerpt,
    relativePath: input.relativePath,
    sourceDetail: "screenshot OCR",
  });
}

const scanning = new Set<string>();

export async function scanScreenshotForKeywordAlerts(
  input: KeywordAlertInput
): Promise<KeywordAlertResult> {
  try {
    const settings = await getGuardKeywordWatchSettings();
    if (!settings.enabled) {
      return { ok: true, skipped: true, reason: "disabled" };
    }

    const abs = String(input.absolutePath || "").trim();
    const employeeId = String(input.employeeId || "").trim();
    if (!abs || !employeeId) {
      return { ok: false, error: "path and employee_id required" };
    }

    const scanKey = `${employeeId}:${abs}`;
    if (scanning.has(scanKey)) {
      return { ok: true, skipped: true, reason: "busy" };
    }
    scanning.add(scanKey);
    try {
      const text =
        typeof input.ocrText === "string" && input.ocrText.trim()
          ? input.ocrText
          : await ocrTextFromFile(abs);
      const hit = evaluateTextPolicy(text, settings);
      if (!hit) {
        return { ok: true, skipped: true, reason: "no_match" };
      }
      return await createGuardPolicyTicket({
        employeeId,
        employeeName: input.employeeName,
        pseudonym: input.pseudonym,
        kind: hit.kind,
        matched: hit.matched,
        evidence: hit.evidence,
        relativePath: input.relativePath,
        sourceDetail: "screenshot OCR",
      });
    } finally {
      scanning.delete(scanKey);
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Keyword scan failed",
    };
  }
}

export async function scanAppActivityForPolicyAlerts(input: {
  employeeId: string;
  employeeName?: string | null;
  pseudonym?: string | null;
  appName: string;
  appPath?: string | null;
  caption?: string | null;
}): Promise<KeywordAlertResult> {
  try {
    const settings = await getGuardKeywordWatchSettings();
    if (!settings.enabled) {
      return { ok: true, skipped: true, reason: "disabled" };
    }
    const employeeId = String(input.employeeId || "").trim();
    if (!employeeId || !input.appName) {
      return { ok: false, error: "employee_id and app_name required" };
    }
    const hit = evaluateAppActivityPolicy(
      input.appName,
      input.appPath,
      input.caption,
      settings
    );
    if (!hit) {
      return { ok: true, skipped: true, reason: "no_match" };
    }
    return await createGuardPolicyTicket({
      employeeId,
      employeeName: input.employeeName || undefined,
      pseudonym: input.pseudonym || undefined,
      kind: hit.kind,
      matched: hit.matched,
      evidence: hit.evidence,
      sourceDetail: `app activity · ${input.appName}`,
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "App policy scan failed",
    };
  }
}
