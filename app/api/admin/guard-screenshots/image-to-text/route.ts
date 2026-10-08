import { execFile } from "node:child_process";
import path from "node:path";
import fs from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import {
  isGalleryUnlocked,
  resolveScreenshotFile,
} from "@/lib/guard-screenshots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 15 * 1024 * 1024;
const TEXT_CACHE_ROOT = path.join(process.cwd(), "uploads", "guard-screenshot-text");
const MODES = new Set(["summary", "raw", "clean", "paragraph"]);

type ScanResult = {
  text: string;
  mode: string;
  provider: string;
  note?: string;
};

function cachePathFor(relativePath: string): string {
  const parts = relativePath.replace(/\\/g, "/").split("/").filter(Boolean);
  if (parts.some((p) => p === "." || p === "..")) {
    throw new Error("Invalid path");
  }
  const file = path.join(TEXT_CACHE_ROOT, ...parts) + ".json";
  const root = path.resolve(TEXT_CACHE_ROOT);
  const abs = path.resolve(file);
  if (!abs.startsWith(root + path.sep)) throw new Error("Invalid path");
  return abs;
}

async function readCache(relativePath: string, imageMtimeMs: number) {
  try {
    const raw = await fs.readFile(cachePathFor(relativePath), "utf8");
    const saved = JSON.parse(raw) as { text?: string; mtimeMs?: number };
    if (saved.mtimeMs !== imageMtimeMs || !saved.text) return null;
    return saved.text;
  } catch {
    return null;
  }
}

async function writeCache(relativePath: string, imageMtimeMs: number, text: string) {
  const file = cachePathFor(relativePath);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(
    file,
    JSON.stringify({ mtimeMs: imageMtimeMs, text }),
    "utf8"
  );
}

function scanInChild(absPath: string): Promise<ScanResult> {
  const script = path.join(process.cwd(), "image-to-text", "run-scan.js");
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      ["--max-old-space-size=192", script, absPath],
      {
        cwd: process.cwd(),
        env: process.env,
        timeout: 28000,
        maxBuffer: 1024 * 1024,
      },
      (err, stdout) => {
        const raw = String(stdout || "").trim();
        try {
          const parsed = JSON.parse(raw) as {
            ok?: boolean;
            text?: string;
            provider?: string;
            error?: string;
          };
          if (!parsed.ok) {
            reject(new Error(parsed.error || "Scan failed"));
            return;
          }
          resolve({
            text: parsed.text || "",
            mode: "summary",
            provider: parsed.provider || "gemini",
          });
          return;
        } catch {
          /* child crashed before printing JSON */
        }
        const killed = Boolean(err && (err as NodeJS.ErrnoException & { killed?: boolean }).killed);
        reject(
          new Error(
            killed
              ? "Scan stopped because the server was low on memory. Try again."
              : "Image to text failed. Try again."
          )
        );
      }
    );
  });
}

export async function POST(req: NextRequest) {
  try {
    if (!isGalleryUnlocked(req)) {
      return NextResponse.json(
        { success: false, error: "Gallery locked", locked: true },
        { status: 401 }
      );
    }

    const body = (await req.json().catch(() => null)) as {
      path?: string;
      mode?: string;
      lang?: string;
    } | null;
    const rel = String(body?.path || "").trim();
    if (!rel) {
      return NextResponse.json(
        { success: false, error: "path required" },
        { status: 400 }
      );
    }

    const mode = MODES.has(String(body?.mode || ""))
      ? String(body?.mode)
      : "summary";

    const abs = await resolveScreenshotFile(rel);
    const stat = await fs.stat(abs);
    if (stat.size > MAX_BYTES) {
      return NextResponse.json(
        { success: false, error: "Screenshot is too large to scan" },
        { status: 413 }
      );
    }

    if (mode === "summary") {
      const cached = await readCache(rel, stat.mtimeMs);
      if (cached) {
        return NextResponse.json({
          success: true,
          text: cached,
          mode: "summary",
          provider: "cache",
          note: null,
          fileName: path.basename(abs),
        });
      }
    }

    const scanned = await scanInChild(abs);

    if (mode === "summary" && scanned.text) {
      await writeCache(rel, stat.mtimeMs, scanned.text);
    }

    return NextResponse.json({
      success: true,
      text: scanned.text || "",
      mode: scanned.mode,
      provider: scanned.provider,
      note: scanned.note
        ? "Readable summary was unavailable, so local OCR text was used."
        : null,
      fileName: path.basename(abs),
    });
  } catch (err) {
    const raw = err instanceof Error ? err.message : "Scan failed";
    const msg = raw.replace(/key=[^&\s]+/gi, "key=redacted").slice(0, 300);
    const status = msg === "Not found" || msg === "Invalid path" ? 404 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
