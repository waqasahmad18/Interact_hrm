import fs from "fs/promises";
import path from "path";
import { NextRequest } from "next/server";

/** Outside public/ so files are not served by static /api/uploads. */
export const GUARD_SCREENSHOTS_ROOT = path.join(
  process.cwd(),
  "uploads",
  "guard-screenshots"
);

export const GALLERY_COOKIE = "guard_ss_gallery";
export const GALLERY_COOKIE_MAX_AGE = 60 * 60 * 2; // 2 hours

export function galleryPassword(): string {
  return (
    process.env.GUARD_SCREENSHOT_GALLERY_PASSWORD?.trim() || "penPencil1122!"
  );
}

export function isGalleryUnlocked(req: NextRequest): boolean {
  return req.cookies.get(GALLERY_COOKIE)?.value === "1";
}

export function safeSegment(raw: string, fallback = "unknown"): string {
  const s = String(raw || "")
    .trim()
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  return s || fallback;
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/** Local wall-clock parts (server TZ / host clock). */
export function formatCaptureParts(d: Date) {
  const yyyy = d.getFullYear();
  const mm = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  const HH = pad2(d.getHours());
  const mi = pad2(d.getMinutes());
  const ss = pad2(d.getSeconds());
  return {
    dateFolder: `${yyyy}-${mm}-${dd}`,
    stamp: `${yyyy}-${mm}-${dd}_${HH}-${mi}-${ss}`,
  };
}

export type SaveScreenshotInput = {
  png: Buffer;
  employeeId: string;
  employeeName?: string;
  pseudonym?: string;
  capturedAt?: Date;
};

export type SavedScreenshot = {
  relativePath: string;
  absolutePath: string;
  fileName: string;
};

export async function saveGuardScreenshot(
  input: SaveScreenshotInput
): Promise<SavedScreenshot> {
  const employeeId = safeSegment(input.employeeId, "unknown");
  const name = safeSegment(input.employeeName || "", "Employee");
  const pseudo = safeSegment(input.pseudonym || "", "NA");
  const when = input.capturedAt && !Number.isNaN(input.capturedAt.getTime())
    ? input.capturedAt
    : new Date();
  const { dateFolder, stamp } = formatCaptureParts(when);
  const fileName = `${name}_${pseudo}_${stamp}.png`;
  const dir = path.join(GUARD_SCREENSHOTS_ROOT, employeeId, dateFolder);
  await fs.mkdir(dir, { recursive: true });
  const absolutePath = path.join(dir, fileName);
  await fs.writeFile(absolutePath, input.png);
  const relativePath = path
    .join(employeeId, dateFolder, fileName)
    .split(path.sep)
    .join("/");
  return { relativePath, absolutePath, fileName };
}

export type ScreenshotEmployeeSummary = {
  employeeId: string;
  count: number;
  latestAt: string | null;
  sampleName: string | null;
  samplePseudonym: string | null;
};

export type ScreenshotFileRow = {
  relativePath: string;
  fileName: string;
  employeeId: string;
  dateFolder: string;
  size: number;
  mtimeMs: number;
  capturedAt: string;
};

function parseNameParts(fileName: string): {
  name: string | null;
  pseudonym: string | null;
} {
  // SafeName_SafePseudo_yyyy-MM-dd_HH-mm-ss.png
  const base = fileName.replace(/\.png$/i, "");
  const m = base.match(/^(.+)_(.+)_(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2})$/);
  if (!m) return { name: null, pseudonym: null };
  return { name: m[1], pseudonym: m[2] };
}

function capturedAtFromName(fileName: string, mtimeMs: number): string {
  const base = fileName.replace(/\.png$/i, "");
  const m = base.match(/(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})-(\d{2})$/);
  if (m) {
    return `${m[1]}T${m[2]}:${m[3]}:${m[4]}`;
  }
  return new Date(mtimeMs).toISOString();
}

export async function listScreenshotEmployees(): Promise<
  ScreenshotEmployeeSummary[]
> {
  try {
    await fs.mkdir(GUARD_SCREENSHOTS_ROOT, { recursive: true });
    const empDirs = await fs.readdir(GUARD_SCREENSHOTS_ROOT, {
      withFileTypes: true,
    });
    const out: ScreenshotEmployeeSummary[] = [];
    for (const ent of empDirs) {
      if (!ent.isDirectory()) continue;
      const employeeId = ent.name;
      let count = 0;
      let latestAt: string | null = null;
      let latestMs = 0;
      let sampleName: string | null = null;
      let samplePseudonym: string | null = null;
      const dateDirs = await fs.readdir(
        path.join(GUARD_SCREENSHOTS_ROOT, employeeId),
        { withFileTypes: true }
      );
      for (const d of dateDirs) {
        if (!d.isDirectory()) continue;
        const files = await fs.readdir(
          path.join(GUARD_SCREENSHOTS_ROOT, employeeId, d.name),
          { withFileTypes: true }
        );
        for (const f of files) {
          if (!f.isFile() || !f.name.toLowerCase().endsWith(".png")) continue;
          count += 1;
          const st = await fs.stat(
            path.join(GUARD_SCREENSHOTS_ROOT, employeeId, d.name, f.name)
          );
          if (st.mtimeMs >= latestMs) {
            latestMs = st.mtimeMs;
            latestAt = capturedAtFromName(f.name, st.mtimeMs);
            const parts = parseNameParts(f.name);
            sampleName = parts.name;
            samplePseudonym = parts.pseudonym;
          }
        }
      }
      if (count > 0) {
        out.push({
          employeeId,
          count,
          latestAt,
          sampleName,
          samplePseudonym,
        });
      }
    }
    out.sort((a, b) => (b.latestAt || "").localeCompare(a.latestAt || ""));
    return out;
  } catch {
    return [];
  }
}

export async function listScreenshotsForEmployee(
  employeeIdRaw: string
): Promise<ScreenshotFileRow[]> {
  const employeeId = safeSegment(employeeIdRaw, "");
  if (!employeeId) return [];
  const empRoot = path.join(GUARD_SCREENSHOTS_ROOT, employeeId);
  try {
    const dateDirs = await fs.readdir(empRoot, { withFileTypes: true });
    const rows: ScreenshotFileRow[] = [];
    for (const d of dateDirs) {
      if (!d.isDirectory()) continue;
      const files = await fs.readdir(path.join(empRoot, d.name), {
        withFileTypes: true,
      });
      for (const f of files) {
        if (!f.isFile() || !f.name.toLowerCase().endsWith(".png")) continue;
        const abs = path.join(empRoot, d.name, f.name);
        const st = await fs.stat(abs);
        const relativePath = [employeeId, d.name, f.name].join("/");
        rows.push({
          relativePath,
          fileName: f.name,
          employeeId,
          dateFolder: d.name,
          size: st.size,
          mtimeMs: st.mtimeMs,
          capturedAt: capturedAtFromName(f.name, st.mtimeMs),
        });
      }
    }
    rows.sort((a, b) => b.mtimeMs - a.mtimeMs);
    return rows;
  } catch {
    return [];
  }
}

/** Resolve a relative path under the screenshots root; throws on traversal. */
export async function resolveScreenshotFile(
  relativePath: string
): Promise<string> {
  const parts = String(relativePath || "")
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean);
  if (
    !parts.length ||
    parts.some(
      (p) =>
        !p ||
        p === "." ||
        p === ".." ||
        p.includes("\0") ||
        p.includes("\\")
    )
  ) {
    throw new Error("Invalid path");
  }
  await fs.mkdir(GUARD_SCREENSHOTS_ROOT, { recursive: true });
  const abs = path.join(GUARD_SCREENSHOTS_ROOT, ...parts);
  const realRoot = await fs.realpath(GUARD_SCREENSHOTS_ROOT);
  let realFile: string;
  try {
    realFile = await fs.realpath(abs);
  } catch {
    throw new Error("Not found");
  }
  if (!realFile.startsWith(realRoot + path.sep) && realFile !== realRoot) {
    throw new Error("Invalid path");
  }
  if (!realFile.toLowerCase().endsWith(".png")) {
    throw new Error("Invalid path");
  }
  return realFile;
}
