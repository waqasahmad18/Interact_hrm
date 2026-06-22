import "server-only";

import { pool } from "@/lib/db";
import { decryptSavedPassword, encryptSavedPassword } from "@/lib/saved-login-crypto";

export const SAVED_LOGIN_TABLE = "hrm_saved_logins";

export type SavedLoginRow = {
  login_id: string;
  password: string;
};

export async function getSavedLoginForDevice(deviceKey: string): Promise<SavedLoginRow | null> {
  const [rows] = await pool.execute(
    `SELECT login_id, password_enc
     FROM ${SAVED_LOGIN_TABLE}
     WHERE device_key = ?
     ORDER BY updated_at DESC
     LIMIT 1`,
    [deviceKey]
  );
  const row = (rows as { login_id: string; password_enc: string }[])[0];
  if (!row?.login_id || !row.password_enc) return null;
  try {
    return {
      login_id: row.login_id,
      password: decryptSavedPassword(row.password_enc),
    };
  } catch {
    return null;
  }
}

export async function getSavedLoginForAnyDevice(deviceKeys: string[]): Promise<SavedLoginRow | null> {
  const seen = new Set<string>();
  for (const key of deviceKeys) {
    const trimmed = key?.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    const saved = await getSavedLoginForDevice(trimmed);
    if (saved) return saved;
  }
  return null;
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
