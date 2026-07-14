import { NextResponse } from "next/server";
import { agentExeAbsPath, getPresenceAgentRelease } from "@/lib/presence-agent-release";
import fs from "fs/promises";

export const runtime = "nodejs";

/** Public download of the published InteractPresence.exe */
export async function GET() {
  try {
    const release = await getPresenceAgentRelease();
    if (!release.hasBinary) {
      return NextResponse.json(
        { success: false, error: "No agent binary published yet" },
        { status: 404 }
      );
    }
    const buf = await fs.readFile(agentExeAbsPath());
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": 'attachment; filename="InteractPresence.exe"',
        "Cache-Control": "no-store",
        "X-Agent-Version": release.version,
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Download failed",
      },
      { status: 500 }
    );
  }
}
