import "server-only";

import { pool } from "@/lib/db";
import { decryptSavedPassword, encryptSavedPassword } from "@/lib/saved-login-crypto";

export const SAVED_LOGIN_TABLE = "hrm_saved_logins";

export type SavedLoginRow = {
  login_id: string;
  password: string;
};

export async function listSavedLoginsForDevice(deviceKey: string): Promise<SavedLoginRow[]> {
  const [rows] = await pool.execute(
    `SELECT login_id, password_enc
     FROM ${SAVED_LOGIN_TABLE}
     WHERE device_key = ?
     ORDER BY updated_at DESC`,
    [deviceKey]
  );
  const out: SavedLoginRow[] = [];
  for (const row of rows as { login_id: string; password_enc: string }[]) {
    if (!row?.login_id || !row.password_enc) continue;
    try {
      out.push({
        login_id: row.login_id,
        password: decryptSavedPassword(row.password_enc),
      });
    } catch {
      /* skip bad row */
    }
  }
  return out;
}

export async function listSavedLoginsForAnyDevice(deviceKeys: string[]): Promise<SavedLoginRow[]> {
  const seenLogin = new Set<string>();
  const merged: SavedLoginRow[] = [];
  const seenDevice = new Set<string>();

  for (const raw of deviceKeys) {
    for (const key of expandDeviceKeyVariants(raw)) {
      if (!key || seenDevice.has(key)) continue;
      seenDevice.add(key);
      const rows = await listSavedLoginsForDevice(key);
      for (const row of rows) {
        const norm = row.login_id.trim().toLowerCase();
        if (!norm || seenLogin.has(norm)) continue;
        seenLogin.add(norm);
        merged.push(row);
      }
    }
  }
  return merged;
}

export async function getSavedLoginForDevice(deviceKey: string): Promise<SavedLoginRow | null> {
  const list = await listSavedLoginsForDevice(deviceKey);
  return list[0] ?? null;
}

export async function getSavedLoginForAnyDevice(deviceKeys: string[]): Promise<SavedLoginRow | null> {
  const seen = new Set<string>();
  for (const raw of deviceKeys) {
    for (const key of expandDeviceKeyVariants(raw)) {
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const saved = await getSavedLoginForDevice(key);
      if (saved) return saved;
    }
  }
  return null;
}

/** Match legacy rows saved before fingerprint length fix (VARCHAR(64) truncation). */
export function expandDeviceKeyVariants(deviceKey: string): string[] {
  const trimmed = deviceKey.trim();
  if (!trimmed) return [];

  const variants = new Set<string>([trimmed]);
  if (trimmed.length > 64) {
    variants.add(trimmed.slice(0, 64));
  }
  if (trimmed.startsWith("fp_")) {
    variants.add(trimmed.slice(3, 67));
    variants.add(trimmed.slice(0, 64));
  }
  return Array.from(variants);
}

export async function upsertSavedLogin(
  deviceKey: string,
  loginId: string,
  password: string
): Promise<void> {
  const passwordEnc = encryptSavedPassword(password);
  await pool.execute(
    `INSERT INTO ${SAVED_LOGIN_TABLE} (device_key, login_id, password_enc)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE
       password_enc = VALUES(password_enc),
       updated_at = CURRENT_TIMESTAMP`,
    [deviceKey, loginId.trim(), passwordEnc]
  );
}

export async function deleteSavedLoginForDevice(deviceKey: string): Promise<void> {
  await pool.execute(`DELETE FROM ${SAVED_LOGIN_TABLE} WHERE device_key = ?`, [deviceKey]);
}
