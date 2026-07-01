/** Client-safe helpers — no database imports. */

export function employeeInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "E";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function resolveEmployeePhoto(
  employeeId: string,
  employeePhotos: Record<string, string>,
  shellAvatars: Record<string, string>
): string | null {
  const id = String(employeeId);
  return employeePhotos[id] ?? shellAvatars[id] ?? null;
}
