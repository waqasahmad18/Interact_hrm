import fs from "fs/promises";
import path from "node:path";
import {
  createGuardPolicyTicket,
  evaluateTextPolicy,
  getGuardKeywordWatchSettings,
  type KeywordAlertResult,
} from "@/lib/guard-keyword-watch";
import { ensureAdminSettingsTable } from "@/lib/admin-settings";
import { pool } from "@/lib/db";

const TABLE = "hrm_admin_settings";
const KEY_AUDIO_ENABLED = "guard_audio_watch_enabled";
const KEY_AUDIO_CLIP_SEC = "guard_audio_clip_seconds";
const KEY_AUDIO_GAP_SEC = "guard_audio_gap_seconds";

export type GuardAudioWatchSettings = {
  enabled: boolean;
  /** How long each mic listen window lasts (seconds). */
  clipSeconds: number;
  /** Quiet gap after each clip before next mic open (seconds). Reduces tray mic blink. */
  gapSeconds: number;
};

/** Local root for Guard audio evidence (mirrors screenshots layout). */
export function guardAudioRoot(): string {
  const env = String(process.env.GUARD_AUDIO_ROOT || "").trim();
  if (env) return env;
  return path.join(process.cwd(), "storage", "guard-audio");
}

async function getRaw(key: string): Promise<string | null> {
  await ensureAdminSettingsTable();
  const [rows] = await pool.execute(
    `SELECT setting_value FROM ${TABLE} WHERE setting_key = ? LIMIT 1`,
    [key]
  );
  return (rows as { setting_value: string }[])[0]?.setting_value ?? null;
}

async function setRaw(key: string, value: string): Promise<void> {
  await ensureAdminSettingsTable();
  await pool.execute(
    `INSERT INTO ${TABLE} (setting_key, setting_value) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
    [key, value]
  );
}

function clampInt(raw: unknown, min: number, max: number, fallback: number): number {
  const n =
    typeof raw === "number"
      ? raw
      : Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

export async function getGuardAudioWatchSettings(): Promise<GuardAudioWatchSettings> {
  const [enabledRaw, clipRaw, gapRaw] = await Promise.all([
    getRaw(KEY_AUDIO_ENABLED),
    getRaw(KEY_AUDIO_CLIP_SEC),
    getRaw(KEY_AUDIO_GAP_SEC),
  ]);
  const enabled =
    enabledRaw == null
      ? true
      : String(enabledRaw).trim() === "1" ||
        String(enabledRaw).toLowerCase() === "true";
  return {
    enabled,
    clipSeconds: clampInt(clipRaw, 10, 60, 20),
    // Default 2 min gap so tray mic is not constantly flashing
    gapSeconds: clampInt(gapRaw, 0, 3600, 120),
  };
}

export async function getGuardAudioWatchEnabled(): Promise<boolean> {
  const s = await getGuardAudioWatchSettings();
  return s.enabled;
}

export async function setGuardAudioWatchEnabled(enabled: boolean): Promise<boolean> {
  await setRaw(KEY_AUDIO_ENABLED, enabled ? "1" : "0");
  return enabled;
}

export async function saveGuardAudioWatchSettings(input: {
  enabled?: boolean;
  clipSeconds?: number;
  gapSeconds?: number;
}): Promise<GuardAudioWatchSettings> {
  const current = await getGuardAudioWatchSettings();
  const next: GuardAudioWatchSettings = {
    enabled:
      typeof input.enabled === "boolean" ? input.enabled : current.enabled,
    clipSeconds:
      input.clipSeconds != null
        ? clampInt(input.clipSeconds, 10, 60, current.clipSeconds)
        : current.clipSeconds,
    gapSeconds:
      input.gapSeconds != null
        ? clampInt(input.gapSeconds, 0, 3600, current.gapSeconds)
        : current.gapSeconds,
  };
  await Promise.all([
    setRaw(KEY_AUDIO_ENABLED, next.enabled ? "1" : "0"),
    setRaw(KEY_AUDIO_CLIP_SEC, String(next.clipSeconds)),
    setRaw(KEY_AUDIO_GAP_SEC, String(next.gapSeconds)),
  ]);
  return next;
}

export async function allocateGuardAudioPath(employeeId: string, ext = "wav"): Promise<{
  absolutePath: string;
  relativePath: string;
}> {
  const safeEmp = String(employeeId || "unknown").replace(/[^\w.-]+/g, "_");
  const day = new Date().toISOString().slice(0, 10);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const rel = path.join(day, safeEmp, `audio_${stamp}.${ext}`);
  const abs = path.join(guardAudioRoot(), rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  return { absolutePath: abs, relativePath: rel.replace(/\\/g, "/") };
}

/**
 * After offline STT: match same Guard Policy word list → ticket + keep audio file.
 */
export async function enforcePolicyAfterAudioTranscript(input: {
  employeeId: string;
  employeeName?: string;
  pseudonym?: string;
  transcript: string;
  relativePath: string;
  language?: string | null;
}): Promise<KeywordAlertResult & { transcript?: string }> {
  const audioOn = await getGuardAudioWatchEnabled();
  if (!audioOn) {
    return { ok: true, skipped: true, reason: "audio_disabled" };
  }

  const settings = await getGuardKeywordWatchSettings();
  if (!settings.enabled) {
    return { ok: true, skipped: true, reason: "disabled" };
  }

  const text = String(input.transcript || "").trim();
  if (!text) {
    return { ok: true, skipped: true, reason: "empty_transcript" };
  }

  const hit = evaluateTextPolicy(text, settings);
  if (!hit || hit.kind !== "keyword" || !hit.matched?.length) {
    return { ok: true, skipped: true, reason: "no_match", transcript: text };
  }

  const result = await createGuardPolicyTicket({
    employeeId: input.employeeId,
    employeeName: input.employeeName,
    pseudonym: input.pseudonym,
    kind: "keyword",
    matched: hit.matched,
    evidence: text,
    relativePath: input.relativePath,
    sourceDetail: `mic audio STT${input.language ? ` (${input.language})` : ""}`,
  });

  return { ...result, transcript: text };
}
