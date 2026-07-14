import { NextResponse } from "next/server";
import { getPresenceAgentRelease } from "@/lib/presence-agent-release";

export const runtime = "nodejs";

/** Public: desktop agents poll this for updates. */
export async function GET() {
  try {
    const release = await getPresenceAgentRelease();
    return NextResponse.json({
      success: true,
      version: release.version,
      downloadPath: "/api/presence-agent/download",
      hasBinary: release.hasBinary,
      updatedAt: release.updatedAt,
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Version check failed",
      },
      { status: 500 }
    );
  }
}
