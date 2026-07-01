import "server-only";

import { getAllOrgChartPhotos } from "@/lib/org-chart-photos-table";
import { resolveEmployeePhoto } from "@/lib/employee-photo-shared";

export {
  employeeInitials,
  resolveEmployeePhoto,
} from "@/lib/employee-photo-shared";

export async function loadEmployeePhotoMaps() {
  const data = await getAllOrgChartPhotos();
  return {
    employeePhotos: data.employeePhotos,
    shellAvatars: data.shellBranding.employeeAvatars,
  };
}

export async function getEmployeePhoto(employeeId: string): Promise<string | null> {
  const maps = await loadEmployeePhotoMaps();
  return resolveEmployeePhoto(employeeId, maps.employeePhotos, maps.shellAvatars);
}
