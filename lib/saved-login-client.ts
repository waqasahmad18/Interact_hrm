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
      error?: string;
    };
    if (!data.success || !data.loginId || !data.password) return null;
    return { loginId: data.loginId, password: data.password };
  } catch {
    return null;
  }
}

/** DB first (survives cache clear), then localStorage fallback. */
export async function loadSavedLogin(): Promise<SavedLogin | null> {
  const deviceKey = await getStableDeviceFingerprint();
  if (deviceKey) {
    const fromDb = await fetchSavedLoginFromApi(deviceKey);
    if (fromDb) {
      saveSavedLoginLocal(fromDb.loginId, fromDb.password);
      return fromDb;
    }
  }

  return loadSavedLoginLocal();
}

/** Save to database + localStorage (Remember me). */
export async function persistSavedLogin(loginId: string, password: string): Promise<boolean> {
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
    if (data.success === true) {
      saveSavedLoginLocal(loginId, password);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
