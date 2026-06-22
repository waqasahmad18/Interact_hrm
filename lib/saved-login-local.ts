const LOGIN_ID_KEY = "interact_hrm_saved_login_id";
const PASSWORD_KEY = "interact_hrm_saved_password";

export type SavedLogin = {
  loginId: string;
  password: string;
};

export function loadSavedLoginLocal(): SavedLogin | null {
  if (typeof window === "undefined") return null;
  const loginId = localStorage.getItem(LOGIN_ID_KEY) || "";
  const password = localStorage.getItem(PASSWORD_KEY) || "";
  if (!loginId || !password) return null;
  return { loginId, password };
}

export function saveSavedLoginLocal(loginId: string, password: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(LOGIN_ID_KEY, loginId);
  localStorage.setItem(PASSWORD_KEY, password);
}

export function clearSavedLoginLocal(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(LOGIN_ID_KEY);
  localStorage.removeItem(PASSWORD_KEY);
}
