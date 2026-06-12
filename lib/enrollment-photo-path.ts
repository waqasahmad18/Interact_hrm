import fs from "fs";
import path from "path";

/** Browser URL for an enrollment row (served by API — works when public/ static path fails). */
export function enrollmentPhotoApiUrl(photoId: number): string {
  return `/api/admin/face-enrollment/photo?id=${photoId}`;
}

/** Resolve DB local_path to an on-disk file (Linux + Windows). */
export function resolveEnrollmentPhotoDiskPath(localPath: string): string | null {
  const normalized = String(localPath || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");

  if (!normalized) return null;

  const candidates = [
    path.join(process.cwd(), "public", normalized),
    path.join(process.cwd(), normalized),
  ];

  if (normalized.startsWith("public/")) {
    candidates.push(path.join(process.cwd(), normalized.slice("public/".length)));
  }

  for (const diskPath of candidates) {
    try {
      if (fs.existsSync(diskPath) && fs.statSync(diskPath).isFile()) {
        return diskPath;
      }
    } catch {
      // try next
    }
  }

  return null;
}
