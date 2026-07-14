import { NextRequest, NextResponse } from "next/server";
import {
  getPresenceAgentRelease,
  savePresenceAgentBinary,
  setPresenceAgentVersion,
} from "@/lib/presence-agent-release";

export const runtime = "nodejs";

export async function GET() {
  try {
    const release = await getPresenceAgentRelease();
    return NextResponse.json({ success: true, release });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Failed to load release",
      },
      { status: 500 }
    );
  }
}

/** multipart: version + optional file (InteractPresence.exe) */
export async function PUT(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const versionRaw = String(form.get("version") || "").trim();
      if (!versionRaw) {
        return NextResponse.json(
          { success: false, error: "version required" },
          { status: 400 }
        );
      }
      const version = await setPresenceAgentVersion(versionRaw);
      const file = form.get("file");
      if (file && typeof file === "object" && "arrayBuffer" in file) {
        const buf = Buffer.from(await (file as File).arrayBuffer());
        await savePresenceAgentBinary(buf);
      }
      const release = await getPresenceAgentRelease();
      return NextResponse.json({ success: true, release: { ...release, version } });
    }

    const body = (await req.json()) as { version?: string };
    if (!body.version) {
      return NextResponse.json(
        { success: false, error: "version required" },
        { status: 400 }
      );
    }
    const version = await setPresenceAgentVersion(body.version);
    const release = await getPresenceAgentRelease();
    return NextResponse.json({ success: true, release: { ...release, version } });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Publish failed",
      },
      { status: 500 }
    );
  }
}
