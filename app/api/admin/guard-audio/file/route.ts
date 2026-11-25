import { NextRequest, NextResponse } from "next/server";
import { createReadStream } from "node:fs";
import fs from "fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { isGalleryUnlocked } from "@/lib/guard-screenshots";
import { guardAudioRoot } from "@/lib/guard-audio-alerts";
import {
  ensureClassicPcmWav,
  isClassicPcmWav,
} from "@/lib/guard-audio-wav";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function contentTypeFor(abs: string): string {
  const lower = abs.toLowerCase();
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  if (lower.endsWith(".webm")) return "audio/webm";
  return "audio/wav";
}

function parseRange(
  header: string | null,
  size: number
): { start: number; end: number } | null {
  if (!header || !header.startsWith("bytes=") || size <= 0) return null;
  const spec = header.slice(6).trim();
  if (!spec || spec.includes(",")) return null;
  const [a, b] = spec.split("-", 2);
  let start: number;
  let end: number;
  if (a === "") {
    // suffix: bytes=-N
    const n = Number.parseInt(b, 10);
    if (!Number.isFinite(n) || n <= 0) return null;
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = Number.parseInt(a, 10);
    end = b === "" || b == null ? size - 1 : Number.parseInt(b, 10);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  }
  if (start < 0 || end < start || start >= size) return null;
  end = Math.min(end, size - 1);
  return { start, end };
}

/** Serve stored Guard audio evidence (gallery unlock required). */
export async function GET(req: NextRequest) {
  try {
    if (!isGalleryUnlocked(req)) {
      return NextResponse.json(
        { success: false, error: "Gallery locked", locked: true },
        { status: 401 }
      );
    }
    const rel = String(req.nextUrl.searchParams.get("path") || "").trim();
    if (!rel || rel.includes("..")) {
      return NextResponse.json(
        { success: false, error: "invalid path" },
        { status: 400 }
      );
    }
    const root = path.resolve(guardAudioRoot());
    const abs = path.resolve(root, rel);
    if (!abs.startsWith(root + path.sep) && abs !== root) {
      return NextResponse.json(
        { success: false, error: "path outside root" },
        { status: 400 }
      );
    }

    const type = contentTypeFor(abs);

    // One-time: normalize NAudio WAV on disk so later requests stream without a full rewrite.
    if (type === "audio/wav") {
      const head = Buffer.alloc(48);
      const fh = await fs.open(abs, "r");
      try {
        await fh.read(head, 0, 48, 0);
      } finally {
        await fh.close();
      }
      if (!isClassicPcmWav(head)) {
        const raw = await fs.readFile(abs);
        const fixed = ensureClassicPcmWav(raw);
        if (fixed !== raw) {
          await fs.writeFile(abs, fixed);
        }
      }
    }

    const st = await fs.stat(abs);
    const size = st.size;
    const range = parseRange(req.headers.get("range"), size);
    const common = {
      "Content-Type": type,
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=120",
      "Content-Disposition": `inline; filename="${path.basename(abs)}"`,
    } as Record<string, string>;

    if (range) {
      const { start, end } = range;
      const chunk = end - start + 1;
      const nodeStream = createReadStream(abs, { start, end });
      const webStream = Readable.toWeb(nodeStream) as ReadableStream;
      return new NextResponse(webStream, {
        status: 206,
        headers: {
          ...common,
          "Content-Length": String(chunk),
          "Content-Range": `bytes ${start}-${end}/${size}`,
        },
      });
    }

    const nodeStream = createReadStream(abs);
    const webStream = Readable.toWeb(nodeStream) as ReadableStream;
    return new NextResponse(webStream, {
      status: 200,
      headers: {
        ...common,
        "Content-Length": String(size),
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "file read failed",
      },
      { status: 404 }
    );
  }
}
