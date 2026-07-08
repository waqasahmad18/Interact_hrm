import { NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";

// Runtime-uploaded profile pictures live under public/uploads/profile-pictures,
// but Next.js production does NOT serve files added to public/ after build.
// This route streams them straight off disk so they load after any refresh.

const PICTURE_DIR = path.join(process.cwd(), "public", "uploads", "profile-pictures");

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
    // Only allow a bare filename — block any path traversal.
    const safeName = path.basename(name);
    if (!safeName || safeName !== name) {
      return NextResponse.json({ success: false, error: "Invalid file" }, { status: 400 });
    }

    const absPath = path.join(PICTURE_DIR, safeName);
    const buf = await fs.readFile(absPath);
    const ext = path.extname(safeName).toLowerCase();
    const contentType = CONTENT_TYPE_BY_EXT[ext] || "application/octet-stream";

    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }
}
