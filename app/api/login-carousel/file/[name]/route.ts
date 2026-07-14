import { NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import { LOGIN_CAROUSEL_UPLOAD_DIR } from "@/lib/login-carousel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

type Ctx = { params: Promise<{ name: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const { name } = await ctx.params;
    const safeName = path.basename(name);
    if (!safeName || safeName !== name) {
      return NextResponse.json({ success: false, error: "Invalid file" }, { status: 400 });
    }

    const absPath = path.join(LOGIN_CAROUSEL_UPLOAD_DIR, safeName);
    const buf = await fs.readFile(absPath);
    const ext = path.extname(safeName).toLowerCase();
    const contentType = CONTENT_TYPE_BY_EXT[ext] || "application/octet-stream";

    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }
}
