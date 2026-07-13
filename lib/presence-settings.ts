import { ensureAdminSettingsTable } from "@/lib/admin-settings";
import { pool } from "@/lib/db";

const TABLE = "hrm_admin_settings";

export type PresenceSettings = {
  /** Master switch — desktop agent idle monitoring on/off */
  presenceEnabled: boolean;
  /** Seconds of no mouse/keyboard before action (popup and/or camera check) */
  idleWarningSeconds: number;
  /** Countdown on "Are you there?" before auto-log */
  popupCountdownSeconds: number;
  /**
   * true = idle then camera/face enrollment check (same as clock/break)
   * false = idle mouse/keyboard only → popup (no camera)
   */
  cameraVerificationEnabled: boolean;
  /** After seated match, wait this long before another check while still idle */
  recheckWhileIdleSeconds: number;
};

export const DEFAULT_PRESENCE_SETTINGS: PresenceSettings = {
  presenceEnabled: true,
  idleWarningSeconds: 1800, // 30 min production-friendly default for admin UI
  popupCountdownSeconds: 60,
  cameraVerificationEnabled: true,
  recheckWhileIdleSeconds: 120,
};

const KEYS = {
  presenceEnabled: "presence_enabled",
  idleWarningSeconds: "presence_idle_warning_seconds",
  popupCountdownSeconds: "presence_popup_countdown_seconds",
  cameraVerificationEnabled: "presence_camera_verification_enabled",
  recheckWhileIdleSeconds: "presence_recheck_while_idle_seconds",
} as const;

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

function parseBool(raw: string | null, fallback: boolean): boolean {
  if (raw == null || raw === "") return fallback;
  const v = raw.trim().toLowerCase();
  if (v === "1" || v === "true" || v === "yes" || v === "on") return true;
  if (v === "0" || v === "false" || v === "no" || v === "off") return false;
  return fallback;
}

function parseIntClamped(
  raw: string | null,
  fallback: number,
  min: number,
  max: number
): number {
  if (raw == null || raw === "") return fallback;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export async function getPresenceSettings(): Promise<PresenceSettings> {
  const d = DEFAULT_PRESENCE_SETTINGS;
  const [
    presenceEnabled,
    idleWarningSeconds,
    popupCountdownSeconds,
    cameraVerificationEnabled,
    recheckWhileIdleSeconds,
  ] = await Promise.all([
    getRaw(KEYS.presenceEnabled),
    getRaw(KEYS.idleWarningSeconds),
    getRaw(KEYS.popupCountdownSeconds),
    getRaw(KEYS.cameraVerificationEnabled),
    getRaw(KEYS.recheckWhileIdleSeconds),
  ]);

  return {
    presenceEnabled: parseBool(presenceEnabled, d.presenceEnabled),
    idleWarningSeconds: parseIntClamped(idleWarningSeconds, d.idleWarningSeconds, 10, 86400),
    popupCountdownSeconds: parseIntClamped(
      popupCountdownSeconds,
      d.popupCountdownSeconds,
      10,
      600
    ),
    cameraVerificationEnabled: parseBool(
      cameraVerificationEnabled,
      d.cameraVerificationEnabled
    ),
    recheckWhileIdleSeconds: parseIntClamped(
      recheckWhileIdleSeconds,
      d.recheckWhileIdleSeconds,
      30,
      7200
    ),
  };
}

export async function savePresenceSettings(
  input: Partial<PresenceSettings>
): Promise<PresenceSettings> {
  const current = await getPresenceSettings();
  const next: PresenceSettings = {
    presenceEnabled:
      typeof input.presenceEnabled === "boolean"
        ? input.presenceEnabled
        : current.presenceEnabled,
    idleWarningSeconds: parseIntClamped(
      String(
        input.idleWarningSeconds ?? current.idleWarningSeconds
      ),
      current.idleWarningSeconds,
      10,
      86400
    ),
    popupCountdownSeconds: parseIntClamped(
      String(input.popupCountdownSeconds ?? current.popupCountdownSeconds),
      current.popupCountdownSeconds,
      10,
      600
    ),
    cameraVerificationEnabled:
      typeof input.cameraVerificationEnabled === "boolean"
        ? input.cameraVerificationEnabled
        : current.cameraVerificationEnabled,
    recheckWhileIdleSeconds: parseIntClamped(
      String(input.recheckWhileIdleSeconds ?? current.recheckWhileIdleSeconds),
      current.recheckWhileIdleSeconds,
      30,
      7200
    ),
  };

  await Promise.all([
    setRaw(KEYS.presenceEnabled, next.presenceEnabled ? "true" : "false"),
    setRaw(KEYS.idleWarningSeconds, String(next.idleWarningSeconds)),
    setRaw(KEYS.popupCountdownSeconds, String(next.popupCountdownSeconds)),
    setRaw(
      KEYS.cameraVerificationEnabled,
      next.cameraVerificationEnabled ? "true" : "false"
    ),
    setRaw(KEYS.recheckWhileIdleSeconds, String(next.recheckWhileIdleSeconds)),
  ]);

  return next;
}
