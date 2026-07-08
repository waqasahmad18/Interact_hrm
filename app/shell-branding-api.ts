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

/**
 * Uploads the raw image FILE (multipart) so any HD image is stored on disk
 * (public/uploads/profile-pictures) and only its path goes to the DB — no
 * base64 / max_allowed_packet limits. Returns the served URL of the saved file.
 */
async function savePhoto(
  subjectType: "company_logo" | "shell_avatar",
  subjectId: string,
  file: File,
): Promise<string> {
  const fd = new FormData();
  fd.append("subjectType", subjectType);
  fd.append("subjectId", subjectId);
  fd.append("file", file);
  const res = await fetch("/api/profile-picture", { method: "POST", body: fd });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || "Failed to save image");
  }
  clearOrgChartPhotosClientCache();
  return data.url as string;
}

async function removePhoto(
  subjectType: "company_logo" | "shell_avatar",
  subjectId: string,
) {
  const qs = new URLSearchParams({ subjectType, subjectId });
  // Remove from the new file-based store and also clear any legacy base64 row.
  const res = await fetch(`/api/profile-picture?${qs}`, { method: "DELETE" });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || "Failed to remove image");
  }
  await fetch(`/api/admin/org-chart-photos?${qs}`, { method: "DELETE" }).catch(() => {});
  clearOrgChartPhotosClientCache();
}

export function saveCompanyLogo(file: File) {
  return savePhoto("company_logo", SHELL_SUBJECT_IDS.companyLogo, file);
}

export function removeCompanyLogo() {
  return removePhoto("company_logo", SHELL_SUBJECT_IDS.companyLogo);
}

export function saveAdminAvatar(file: File) {
  return savePhoto("shell_avatar", SHELL_SUBJECT_IDS.adminAvatar, file);
}

export function removeAdminAvatar() {
  return removePhoto("shell_avatar", SHELL_SUBJECT_IDS.adminAvatar);
}

export function saveEmployeeAvatar(employeeId: string, file: File) {
  return savePhoto("shell_avatar", employeeId, file);
}

export function removeEmployeeAvatar(employeeId: string) {
  return removePhoto("shell_avatar", employeeId);
}
