import { SHELL_SUBJECT_IDS } from "@/lib/shell-branding-constants";
import {
  clearOrgChartPhotosClientCache,
  fetchOrgChartPhotosBundle,
} from "@/lib/org-chart-photos-client-cache";

export type ShellBranding = {
  companyLogo: string | null;
  adminAvatar: string | null;
  employeeAvatars: Record<string, string>;
};

export async function fetchShellBranding(): Promise<ShellBranding> {
  const bundle = await fetchOrgChartPhotosBundle();
  return {
    companyLogo: bundle.companyLogo,
    adminAvatar: bundle.adminAvatar,
    employeeAvatars: bundle.employeeAvatars,
  };
}

async function savePhoto(
  subjectType: "company_logo" | "shell_avatar",
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
    throw new Error(data.error || "Failed to save image");
  }
  clearOrgChartPhotosClientCache();
}

async function removePhoto(
  subjectType: "company_logo" | "shell_avatar",
  subjectId: string,
) {
  const qs = new URLSearchParams({ subjectType, subjectId });
  const res = await fetch(`/api/admin/org-chart-photos?${qs}`, { method: "DELETE" });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || "Failed to remove image");
  }
  clearOrgChartPhotosClientCache();
}

export function saveCompanyLogo(photoData: string) {
  return savePhoto("company_logo", SHELL_SUBJECT_IDS.companyLogo, photoData);
}

export function removeCompanyLogo() {
  return removePhoto("company_logo", SHELL_SUBJECT_IDS.companyLogo);
}

export function saveAdminAvatar(photoData: string) {
  return savePhoto("shell_avatar", SHELL_SUBJECT_IDS.adminAvatar, photoData);
}

export function removeAdminAvatar() {
  return removePhoto("shell_avatar", SHELL_SUBJECT_IDS.adminAvatar);
}

export function saveEmployeeAvatar(employeeId: string, photoData: string) {
  return savePhoto("shell_avatar", employeeId, photoData);
}

export function removeEmployeeAvatar(employeeId: string) {
  return removePhoto("shell_avatar", employeeId);
}
