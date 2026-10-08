import { createRequire } from "node:module";
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
const MODES = new Set(["summary", "raw", "clean", "paragraph"]);
const LANGS = new Set(["eng", "urd", "eng+urd"]);

type ScanResult = {
  text: string;
  mode: string;
  provider: string;
  note?: string;
};

function loadScanner(): {
  scanImageBuffer: (
    data: Buffer,
    filename: string,
    opts?: { mode?: string; lang?: string; fallbackToOcr?: boolean }
  ) => Promise<ScanResult>;
} {
  const require = createRequire(path.join(process.cwd(), "package.json"));
  return require(path.join(process.cwd(), "image-to-text", "lib", "scanImage.js"));
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
    const lang = LANGS.has(String(body?.lang || ""))
      ? String(body?.lang)
      : "eng";

    const abs = await resolveScreenshotFile(rel);
    const stat = await fs.stat(abs);
    if (stat.size > MAX_BYTES) {
      return NextResponse.json(
        { success: false, error: "Screenshot is too large to scan" },
        { status: 413 }
      );
    }

    const buf = await fs.readFile(abs);
    const { scanImageBuffer } = loadScanner();
    const scanned = await scanImageBuffer(buf, path.basename(abs), {
      mode,
      lang,
      fallbackToOcr: false,
    });

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
