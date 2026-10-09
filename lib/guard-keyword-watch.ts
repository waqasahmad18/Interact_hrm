import { execFile } from "node:child_process";
import path from "node:path";
import { pool } from "@/lib/db";
import { ensureAdminSettingsTable } from "@/lib/admin-settings";
import {
  EMPLOYEE_TICKETS_TABLE,
  buildTicketNumber,
  broadcastTicketUpdate,
  ensureEmployeeTicketsTable,
  rowToTicket,
} from "@/lib/employee-tickets-table";
import { getEmployeePseudonym } from "@/lib/ticket-employee-meta";
import { seedEmployeeMessage } from "@/lib/ticket-thread";

const TABLE = "hrm_admin_settings";
const KEY_ENABLED = "guard_keyword_watch_enabled";
const KEY_KEYWORDS = "guard_keyword_watch_keywords";
const KEY_DEDUP = "guard_keyword_watch_dedup_minutes";

export const GUARD_KEYWORD_TICKET_TYPE = "guard_keyword_alert";

/** Starter list — admins can edit/add/remove in Guard Screenshots settings. */
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

export type GuardKeywordWatchSettings = {
  enabled: boolean;
  keywords: string[];
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

function normalizeKeywords(raw: unknown): string[] {
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
    out.push(item.slice(0, 80));
    if (out.length >= 300) break;
  }
  return out;
}

export async function getGuardKeywordWatchSettings(): Promise<GuardKeywordWatchSettings> {
  const [enabledRaw, keywordsRaw, dedupRaw] = await Promise.all([
    getRaw(KEY_ENABLED),
    getRaw(KEY_KEYWORDS),
    getRaw(KEY_DEDUP),
  ]);

  let keywords = DEFAULT_GUARD_KEYWORDS;
  if (keywordsRaw != null && String(keywordsRaw).trim()) {
    try {
      const parsed = JSON.parse(keywordsRaw);
      keywords = normalizeKeywords(parsed);
      if (!keywords.length) keywords = DEFAULT_GUARD_KEYWORDS;
    } catch {
      keywords = normalizeKeywords(keywordsRaw);
      if (!keywords.length) keywords = DEFAULT_GUARD_KEYWORDS;
    }
  }

  const dedup = Math.min(
    24 * 60,
    Math.max(5, Number.parseInt(String(dedupRaw || "60"), 10) || 60)
  );

  return {
    enabled: enabledRaw == null ? true : !/^(0|false|no|off)$/i.test(String(enabledRaw).trim()),
    keywords,
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
        ? normalizeKeywords(input.keywords)
        : current.keywords,
    dedupMinutes: Math.min(
      24 * 60,
      Math.max(
        5,
        Number(input.dedupMinutes ?? current.dedupMinutes) || current.dedupMinutes
      )
    ),
  };
  if (!next.keywords.length) next.keywords = DEFAULT_GUARD_KEYWORDS;

  await Promise.all([
    setRaw(KEY_ENABLED, next.enabled ? "1" : "0"),
    setRaw(KEY_KEYWORDS, JSON.stringify(next.keywords)),
    setRaw(KEY_DEDUP, String(next.dedupMinutes)),
  ]);
  return next;
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function findMatchedKeywords(text: string, keywords: string[]): string[] {
  const source = String(text || "");
  if (!source.trim()) return [];
  const hits: string[] = [];
  for (const kw of keywords) {
    const needle = String(kw || "").trim();
    if (needle.length < 2) continue;
    if (/\s/.test(needle)) {
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
          new Error(
            err
              ? "OCR process failed"
              : "OCR returned an invalid response"
          )
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
  /** If OCR already ran, pass text to skip a second scan. */
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
    }
  | { ok: false; error: string };

export async function createGuardKeywordTicket(input: {
  employeeId: string;
  employeeName?: string;
  pseudonym?: string;
  matched: string[];
  relativePath: string;
  ocrExcerpt: string;
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
    /* keep body values */
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
    }) as { id: number; ticket_number?: string } | undefined;
    if (recent?.id) {
      return {
        ok: true,
        skipped: true,
        reason: "deduped",
      };
    }
  } catch {
    /* continue */
  }

  const matchedLabel = input.matched.slice(0, 8).join(", ");
  const subject = `Policy alert — ${employeeName}${
    pseudonym ? ` (${pseudonym})` : ""
  } · abusive / indecent content`;
  const description = [
    "Interact Guard screenshot OCR found restricted wording.",
    `Employee: ${employeeName}`,
    pseudonym ? `Pseudonym: ${pseudonym}` : null,
    `HRM ID: ${employeeId}`,
    `Matched keyword(s): ${matchedLabel}`,
    input.relativePath ? `Screenshot: ${input.relativePath}` : null,
    "",
    "OCR excerpt:",
    input.ocrExcerpt.slice(0, 1200) || "(empty)",
    "",
    "Source: Guard screenshot keyword watch",
  ]
    .filter((line) => line != null)
    .join("\n");

  const formJson = JSON.stringify({
    employee_id: employeeId,
    employee_name: employeeName,
    pseudonym: pseudonym || null,
    matched_keywords: input.matched,
    screenshot_path: input.relativePath || null,
    source: "guard_keyword_watch",
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
    await broadcastTicketUpdate({
      ...ticket,
      employee_pseudonym: pseudonym || null,
    } as any);
  } catch {
    /* optional toast */
  }

  return {
    ok: true,
    ticketId: id,
    ticketNumber,
    matched: input.matched,
  };
}

const scanning = new Set<string>();

/**
 * OCR a saved screenshot and open an inbox ticket when restricted keywords match.
 * Safe to fire-and-forget from the upload route.
 */
export async function scanScreenshotForKeywordAlerts(
  input: KeywordAlertInput
): Promise<KeywordAlertResult> {
  try {
    const settings = await getGuardKeywordWatchSettings();
    if (!settings.enabled) {
      return { ok: true, skipped: true, reason: "disabled" };
    }
    if (!settings.keywords.length) {
      return { ok: true, skipped: true, reason: "no_keywords" };
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
      const matched = findMatchedKeywords(text, settings.keywords);
      if (!matched.length) {
        return { ok: true, skipped: true, reason: "no_match" };
      }
      return await createGuardKeywordTicket({
        employeeId,
        employeeName: input.employeeName,
        pseudonym: input.pseudonym,
        matched,
        relativePath: input.relativePath,
        ocrExcerpt: text,
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
