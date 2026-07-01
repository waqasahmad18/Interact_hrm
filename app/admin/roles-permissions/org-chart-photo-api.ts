import type { DemoEmployee } from "./system-control-data";

type PhotoMaps = {
  employeePhotos: Record<string, string>;
  rolePhotos: Record<string, string>;
};

export async function fetchOrgChartPhotos(): Promise<PhotoMaps> {
  const res = await fetch("/api/admin/org-chart-photos", { cache: "no-store" });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || "Failed to load profile photos");
  }
  return {
    employeePhotos: data.employeePhotos ?? {},
    rolePhotos: data.rolePhotos ?? {},
  };
}

export async function saveOrgChartPhoto(
  subjectType: "employee" | "role",
  subjectId: string,
  photoData: string,
) {
  const res = await fetch("/api/admin/org-chart-photos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subjectType, subjectId, photoData }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || "Failed to save profile photo");
  }
}

export async function removeOrgChartPhoto(
  subjectType: "employee" | "role",
  subjectId: string,
) {
  const qs = new URLSearchParams({ subjectType, subjectId });
  const res = await fetch(`/api/admin/org-chart-photos?${qs}`, { method: "DELETE" });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || "Failed to remove profile photo");
  }
}

export function applyStoredEmployeePhotos(
  employees: DemoEmployee[],
  photos: Record<string, string>,
): DemoEmployee[] {
  return employees.map((e) => ({
    ...e,
    profilePhoto: photos[e.id] || undefined,
  }));
}
