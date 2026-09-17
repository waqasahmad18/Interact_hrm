/**
 * Employee login identifier normalization.
 * - loginId: trim + case-insensitive match for username/email
 * - HRM numeric employee id (hrm_employees.id) also accepted
 * - password: never trimmed (caller responsibility)
 */

/** Trim whitespace from login field only (not password). */
export function normalizeEmployeeLoginId(raw: unknown): string {
  return String(raw ?? "").trim();
}

/** Parsed HRM employee id when login is digits only (e.g. "102" → 102). */
export function parseHrmEmployeeId(loginId: string): number | null {
  if (!/^\d+$/.test(loginId)) return null;
  const n = Number(loginId);
  if (!Number.isSafeInteger(n) || n <= 0) return null;
  return n;
}

export function employeeLoginIdLower(loginId: string): string {
  return loginId.toLowerCase();
}

/** True if value looks like an email / login id, not a person name. */
export function looksLikeLoginIdentifier(value: string): boolean {
  const s = String(value || "").trim();
  if (!s) return true;
  if (s.includes("@")) return true;
  if (/^\d+$/.test(s)) return true;
  return false;
}

/**
 * Prefer first+last name. Never fall back to email/username/login id for UI display.
 */
export function employeeDisplayNameFromRecord(
  employee: Record<string, unknown> | null | undefined,
  fallback = "Employee",
): string {
  if (!employee) return fallback;
  const first = String(employee.first_name ?? "").trim();
  const middle = String(employee.middle_name ?? "").trim();
  const last = String(employee.last_name ?? "").trim();
  const fromParts = [first, middle, last].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  if (fromParts) return fromParts;

  for (const key of ["full_name", "name", "display_name"] as const) {
    const v = String(employee[key] ?? "").trim();
    if (v && !looksLikeLoginIdentifier(v)) return v;
  }
  return fallback;
}

/** Sanitize a cached display name — reject emails / numeric ids. */
export function sanitizeEmployeeDisplayName(
  value: unknown,
  fallback = "Employee",
): string {
  const s = String(value ?? "").trim();
  if (!s || looksLikeLoginIdentifier(s)) return fallback;
  return s;
}
