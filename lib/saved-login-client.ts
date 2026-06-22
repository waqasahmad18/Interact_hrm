export type SavedLogin = {
  loginId: string;
  password: string;
};

export async function fetchSavedLoginFromApi(): Promise<SavedLogin | null> {
  try {
    const res = await fetch("/api/auth/saved-login", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    });
    const data = (await res.json()) as {
      success?: boolean;
      loginId?: string;
      password?: string;
    };
    if (!data.success || !data.loginId || !data.password) return null;
    return { loginId: data.loginId, password: data.password };
  } catch {
    return null;
  }
}

export async function saveSavedLoginToApi(loginId: string, password: string): Promise<boolean> {
  try {
    const res = await fetch("/api/auth/saved-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ loginId, password }),
    });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}
