import { NextRequest, NextResponse } from "next/server";
import {
  getGuardKeywordWatchSettings,
  saveGuardKeywordWatchSettings,
} from "@/lib/guard-keyword-watch";
import {
  getGuardAudioWatchSettings,
  saveGuardAudioWatchSettings,
} from "@/lib/guard-audio-alerts";

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

function linesToList(raw: unknown): string[] | undefined {
  if (raw == null) return undefined;
  if (Array.isArray(raw)) return raw.map((k) => String(k));
  if (typeof raw === "string") {
    return raw.split(/\r?\n/).map((k) => k.trim());
  }
  return undefined;
}

export async function GET() {
  try {
    const settings = await getGuardKeywordWatchSettings();
    const audio = await getGuardAudioWatchSettings();
    return noStoreJson({
      success: true,
      settings: {
        ...settings,
        audioWatchEnabled: audio.enabled,
        audioClipSeconds: audio.clipSeconds,
        audioGapSeconds: audio.gapSeconds,
      },
    });
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
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    const settings = await saveGuardKeywordWatchSettings({
      enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
      keywords: linesToList(body.keywords),
      websites: linesToList(body.websites),
      apps: linesToList(body.apps),
      uploads: linesToList(body.uploads),
      dedupMinutes:
        typeof body.dedupMinutes === "number"
          ? body.dedupMinutes
          : typeof body.dedupMinutes === "string"
            ? parseInt(body.dedupMinutes, 10)
            : undefined,
    });

    const audio = await saveGuardAudioWatchSettings({
      enabled:
        typeof body.audioWatchEnabled === "boolean"
          ? body.audioWatchEnabled
          : undefined,
      clipSeconds:
        body.audioClipSeconds != null
          ? Number(body.audioClipSeconds)
          : undefined,
      gapSeconds:
        body.audioGapSeconds != null ? Number(body.audioGapSeconds) : undefined,
    });

    return noStoreJson({
      success: true,
      settings: {
        ...settings,
        audioWatchEnabled: audio.enabled,
        audioClipSeconds: audio.clipSeconds,
        audioGapSeconds: audio.gapSeconds,
      },
    });
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
