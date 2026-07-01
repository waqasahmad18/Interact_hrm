/** Client-side cache for /api/admin/org-chart-photos (shared by branding + table avatars). */

export type OrgChartPhotosBundle = {
  companyLogo: string | null;
  adminAvatar: string | null;
  employeeAvatars: Record<string, string>;
  employeePhotos: Record<string, string>;
};

const CACHE_TTL_MS = 3 * 60 * 1000;
let cache: { at: number; data: OrgChartPhotosBundle } | null = null;
let inflight: Promise<OrgChartPhotosBundle> | null = null;

export function clearOrgChartPhotosClientCache() {
  cache = null;
  inflight = null;
}

export async function fetchOrgChartPhotosBundle(): Promise<OrgChartPhotosBundle> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.data;
  if (inflight) return inflight;

  inflight = (async () => {
    const res = await fetch("/api/admin/org-chart-photos");
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || "Failed to load photos");
    }
    const bundle: OrgChartPhotosBundle = {
      companyLogo: data.shellBranding?.companyLogo ?? null,
      adminAvatar: data.shellBranding?.adminAvatar ?? null,
      employeeAvatars: data.shellBranding?.employeeAvatars ?? {},
      employeePhotos: data.employeePhotos ?? {},
    };
    cache = { at: Date.now(), data: bundle };
    return bundle;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}
