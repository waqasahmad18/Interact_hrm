import { NextRequest, NextResponse } from "next/server";
import {
  getGuardKeywordWatchSettings,
  saveGuardKeywordWatchSettings,
} from "@/lib/guard-keyword-watch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStoreJson(body: unknown, init?: { status?: number }) {
  return NextResponse.json(body, {
    status: init?.status,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      Pragma: "no-cache",
    },
  });
}

export async function GET() {
  try {
    const settings = await getGuardKeywordWatchSettings();
    return noStoreJson({ success: true, settings });
  } catch (err) {
    return noStoreJson(
      {
        success: false,
        error: err instanceof Error ? err.message : "Failed to load settings",
      },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      enabled?: boolean;
      keywords?: string[] | string;
      dedupMinutes?: number;
    };

    let keywords: string[] | undefined;
    if (Array.isArray(body.keywords)) {
      keywords = body.keywords.map((k) => String(k));
    } else if (typeof body.keywords === "string") {
      keywords = body.keywords.split(/\r?\n/).map((k) => k.trim());
    }

    const settings = await saveGuardKeywordWatchSettings({
      enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
      keywords,
      dedupMinutes:
        typeof body.dedupMinutes === "number"
          ? body.dedupMinutes
          : typeof body.dedupMinutes === "string"
            ? parseInt(body.dedupMinutes, 10)
            : undefined,
    });
    return noStoreJson({ success: true, settings });
  } catch (err) {
    return noStoreJson(
      {
        success: false,
        error: err instanceof Error ? err.message : "Failed to save settings",
      },
      { status: 500 }
    );
  }
}
