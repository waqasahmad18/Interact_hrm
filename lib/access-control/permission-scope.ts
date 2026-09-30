/**
 * System Control columns share the same permission catalog.
 * Scope is encoded on the stored key:
 *   - plain key                  → Own department
 *   - key + @all_departments     → All departments
 * Legacy `data.scope.all_departments` still expands company-wide.
 */

export type PermissionScopeColumn = "own" | "all";

export const ALL_DEPARTMENTS_KEY_SUFFIX = "@all_departments";

/** Standalone legacy toggle (kept for existing saved grants). */
export const LEGACY_ALL_DEPARTMENTS_SCOPE_KEY = "data.scope.all_departments";

export function isAllDepartmentsScopedKey(key: string): boolean {
  const k = String(key || "");
  return k === LEGACY_ALL_DEPARTMENTS_SCOPE_KEY || k.endsWith(ALL_DEPARTMENTS_KEY_SUFFIX);
}

export function basePermissionKey(key: string): string {
  const k = String(key || "").trim();
  if (!k) return "";
  if (k === LEGACY_ALL_DEPARTMENTS_SCOPE_KEY) return k;
  if (k.endsWith(ALL_DEPARTMENTS_KEY_SUFFIX)) {
    return k.slice(0, -ALL_DEPARTMENTS_KEY_SUFFIX.length);
  }
  return k;
}

export function toScopedPermissionKey(
  baseKey: string,
  scope: PermissionScopeColumn,
): string {
  const base = basePermissionKey(baseKey);
  if (!base || base === LEGACY_ALL_DEPARTMENTS_SCOPE_KEY) return base;
  return scope === "all" ? `${base}${ALL_DEPARTMENTS_KEY_SUFFIX}` : base;
}

/** True if the grant set enables this catalog permission (own and/or all). */
export function permissionSetHas(
  keys: Iterable<string> | Set<string> | null | undefined,
  catalogKey: string,
): boolean {
  if (!keys) return false;
  const base = basePermissionKey(catalogKey);
  if (!base) return false;
  const set = keys instanceof Set ? keys : new Set([...keys].map(String));
  return (
    set.has(base) ||
    set.has(`${base}${ALL_DEPARTMENTS_KEY_SUFFIX}`) ||
    (base === LEGACY_ALL_DEPARTMENTS_SCOPE_KEY && set.has(LEGACY_ALL_DEPARTMENTS_SCOPE_KEY))
  );
}

export function permissionSetHasScoped(
  keys: Iterable<string> | Set<string> | null | undefined,
  catalogKey: string,
  scope: PermissionScopeColumn,
): boolean {
  if (!keys) return false;
  const set = keys instanceof Set ? keys : new Set([...keys].map(String));
  return set.has(toScopedPermissionKey(catalogKey, scope));
}

/** Flatten stored keys to catalog base keys for menu / feature matching. */
export function catalogKeysFromStored(keys: Iterable<string>): string[] {
  const out = new Set<string>();
  for (const raw of keys) {
    const base = basePermissionKey(String(raw || ""));
    if (base && base !== LEGACY_ALL_DEPARTMENTS_SCOPE_KEY) out.add(base);
    if (String(raw) === LEGACY_ALL_DEPARTMENTS_SCOPE_KEY) {
      out.add(LEGACY_ALL_DEPARTMENTS_SCOPE_KEY);
    }
  }
  return [...out];
}

export function permissionGrantsAllDepartmentsScope(
  keys: Iterable<string>,
): boolean {
  for (const k of keys) {
    if (isAllDepartmentsScopedKey(String(k))) return true;
  }
  return false;
}
