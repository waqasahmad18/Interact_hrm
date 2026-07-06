import { resolveEmployeePhoto } from "./employee-photo-shared";
import { fetchOrgChartPhotosBundle } from "./org-chart-photos-client-cache";

function localStorageIds(): string[] {
  if (typeof window === "undefined") return [];
  return [
    localStorage.getItem("employeeId"),
    localStorage.getItem("loginId"),
  ]
    .map((v) => String(v ?? "").trim())
    .filter(Boolean);
}

function candidateEmployeeIds(primary?: string): string[] {
  return [...new Set([primary, ...localStorageIds()].map((v) => String(v ?? "").trim()).filter(Boolean))];
}

async function photoFromProfileApi(employeeId: string): Promise<string | null> {
  try {
    const res = await fetch(
      `/api/employee-profile?employeeId=${encodeURIComponent(employeeId)}`,
      { cache: "no-store" }
    );
    const data = await res.json();
    if (res.ok && data.success && data.photo) return data.photo as string;
  } catch {
    /* ignore */
  }
  return null;
}

export async function resolveTicketToastPhoto(
  employeeId?: string,
  existingPhoto?: string | null
): Promise<string | null> {
  if (existingPhoto) return existingPhoto;
  const ids = candidateEmployeeIds(employeeId);
  if (ids.length === 0) return null;

  try {
    const bundle = await fetchOrgChartPhotosBundle();
    for (const id of ids) {
      const photo = resolveEmployeePhoto(id, bundle.employeePhotos, bundle.employeeAvatars);
      if (photo) return photo;
    }
  } catch {
    /* try profile API */
  }

  for (const id of ids) {
    const photo = await photoFromProfileApi(id);
    if (photo) return photo;
  }
  return null;
}

export function demoTicketEmployeeContext(): {
  employee_id?: string;
  employee_name: string;
} {
  if (typeof window === "undefined") return { employee_name: "Employee" };
  return {
    employee_id:
      localStorage.getItem("employeeId") || localStorage.getItem("loginId") || undefined,
    employee_name: localStorage.getItem("employeeName") || "Employee",
  };
}
