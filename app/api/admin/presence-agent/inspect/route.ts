import { NextRequest, NextResponse } from "next/server";
import { extractExeFileVersion } from "@/lib/pe-file-version";

export const runtime = "nodejs";

/** Admin: read FileVersion from an uploaded InteractPresence.exe (no save). */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!file || typeof file !== "object" || !("arrayBuffer" in file)) {
      return NextResponse.json(
        { success: false, error: "file required" },
        { status: 400 }
      );
    }
    const buf = Buffer.from(await (file as File).arrayBuffer());
    if (buf.length < 1024) {
      return NextResponse.json(
        { success: false, error: "File too small" },
        { status: 400 }
      );
    }
    if (buf[0] !== 0x4d || buf[1] !== 0x5a) {
      return NextResponse.json(
        { success: false, error: "Not a Windows .exe" },
        { status: 400 }
      );
    }
    const version = extractExeFileVersion(buf);
    if (!version) {
      return NextResponse.json(
        {
          success: false,
          error: "Could not read version from exe — set it manually",
        },
        { status: 422 }
      );
    }
    return NextResponse.json({ success: true, version });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Inspect failed",
      },
      { status: 500 }
    );
  }
}
