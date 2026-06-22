import {
  loadSavedLoginLocal,
  saveSavedLoginLocal,
  type SavedLogin,
} from "@/lib/saved-login-local";
import { getStableDeviceFingerprint } from "@/lib/device-fingerprint";

export type { SavedLogin };

async function fetchSavedLoginFromApi(deviceKey: string): Promise<SavedLogin | null> {
  try {
    const params = new URLSearchParams({ deviceKey });
    const res = await fetch(`/api/auth/saved-login?${params.toString()}`, {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    });
    const data = (await res.json()) as {
      success?: boolean;
      loginId?: string | null;
      password?: string | null;
    };
    if (!data.success || !data.loginId || !data.password) return null;
    return { loginId: data.loginId, password: data.password };
  } catch {
    return null;
  }
}

/** localStorage first, then DB via stable fingerprint (and cookie fallback on server). */
export async function loadSavedLogin(): Promise<SavedLogin | null> {
  const local = loadSavedLoginLocal();
  if (local) return local;

  const deviceKey = await getStableDeviceFingerprint();
  if (!deviceKey) return null;

  const fromDb = await fetchSavedLoginFromApi(deviceKey);
  if (fromDb) {
    saveSavedLoginLocal(fromDb.loginId, fromDb.password);
    return fromDb;
  }
  return null;
}

/** Save to localStorage + database (Remember me). */
export async function persistSavedLogin(loginId: string, password: string): Promise<boolean> {
  saveSavedLoginLocal(loginId, password);
  const deviceKey = await getStableDeviceFingerprint();
  if (!deviceKey) return false;

  try {
    const res = await fetch("/api/auth/saved-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ loginId, password, deviceKey }),
    });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}
