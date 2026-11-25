import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "node:path";
import { isGalleryUnlocked } from "@/lib/guard-screenshots";
import { guardAudioRoot } from "@/lib/guard-audio-alerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    if (!abs.startsWith(root)) {
      return NextResponse.json(
        { success: false, error: "path outside root" },
        { status: 400 }
      );
    }
    const buf = await fs.readFile(abs);
    const lower = abs.toLowerCase();
    const type = lower.endsWith(".mp3")
      ? "audio/mpeg"
      : lower.endsWith(".webm")
        ? "audio/webm"
        : "audio/wav";
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": type,
        "Cache-Control": "no-store",
        "Content-Disposition": `inline; filename="${path.basename(abs)}"`,
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
