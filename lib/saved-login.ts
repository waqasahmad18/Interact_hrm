const REMEMBER_KEY = "interact_hrm_remember_login";
const LOGIN_ID_KEY = "interact_hrm_saved_login_id";
const PASSWORD_KEY = "interact_hrm_saved_password";

export type SavedLogin = {
  loginId: string;
  password: string;
};

export function loadSavedLogin(): SavedLogin | null {
  if (typeof window === "undefined") return null;
  if (localStorage.getItem(REMEMBER_KEY) !== "1") return null;
  const loginId = localStorage.getItem(LOGIN_ID_KEY) || "";
  const password = localStorage.getItem(PASSWORD_KEY) || "";
  if (!loginId || !password) return null;
  return { loginId, password };
}

export function saveSavedLogin(loginId: string, password: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(REMEMBER_KEY, "1");
  localStorage.setItem(LOGIN_ID_KEY, loginId);
  localStorage.setItem(PASSWORD_KEY, password);
}

export function clearSavedLogin(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(REMEMBER_KEY);
  localStorage.removeItem(LOGIN_ID_KEY);
  localStorage.removeItem(PASSWORD_KEY);
}

export function hasSavedLogin(): boolean {
  return loadSavedLogin() !== null;
}
