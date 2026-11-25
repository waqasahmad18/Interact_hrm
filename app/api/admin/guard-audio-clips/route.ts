import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import {
  getGuardAudioClip,
  listGuardAudioClips,
  updateGuardAudioClipTranscript,
} from "@/lib/guard-audio-clips";
import { guardAudioRoot, enforcePolicyAfterAudioTranscript } from "@/lib/guard-audio-alerts";
import { transcribeWavWithSidecar } from "@/lib/guard-audio-stt";
import { isGalleryUnlocked } from "@/lib/guard-screenshots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Whisper on CPU can take a few minutes for first load. */
export const maxDuration = 300;

/** List recent ambient mic clips for quality review + optional text. */
export async function GET(req: NextRequest) {
  try {
    if (!isGalleryUnlocked(req)) {
      return NextResponse.json(
        { success: false, error: "Gallery locked", locked: true },
        { status: 401 }
      );
    }
    const limit = Number(req.nextUrl.searchParams.get("limit") || 80);
    const employeeId = String(
      req.nextUrl.searchParams.get("employeeId") || ""
    ).trim();
    const clips = await listGuardAudioClips({
      limit,
      employeeId: employeeId || undefined,
    });
    return NextResponse.json({ success: true, clips });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "list failed",
      },
      { status: 500 }
    );
  }
}

/**
 * "Convert to text" — use stored Whisper transcript, or re-run STT on the saved WAV
 * when the agent failed to attach text (common: Windows cp1252 UTF-8 crash on Urdu).
 */
export async function POST(req: NextRequest) {
  try {
    if (!isGalleryUnlocked(req)) {
      return NextResponse.json(
        { success: false, error: "Gallery locked", locked: true },
        { status: 401 }
      );
    }
    const body = await req.json().catch(() => ({}));
    const id = Number(body?.id || 0);
    const force = body?.force === true || body?.force === 1 || body?.force === "1";
    if (!id) {
      return NextResponse.json(
        { success: false, error: "id required" },
        { status: 400 }
      );
    }
    const clip = await getGuardAudioClip(id);
    if (!clip) {
      return NextResponse.json(
        { success: false, error: "clip not found" },
        { status: 404 }
      );
    }
    const existing = String(clip.transcript || "").trim();
    // Cached transcript only when not forcing a fresh English convert.
    if (existing && !force) {
      return NextResponse.json({
        success: true,
        clip,
        transcript: existing,
        empty: false,
      });
    }

    // Re-transcribe saved WAV → English (Urdu/Hindi/EN speech).
    const abs = path.resolve(guardAudioRoot(), clip.audio_path);
    const root = path.resolve(guardAudioRoot());
    if (!abs.startsWith(root + path.sep) && abs !== root) {
      return NextResponse.json(
        { success: false, error: "path outside root" },
        { status: 400 }
      );
    }

    const stt = await transcribeWavWithSidecar(abs);
    const text = String(stt.text || "").trim();
    if (stt.ok && text) {
      const updated = await updateGuardAudioClipTranscript(
        id,
        text,
        stt.language
      );
      try {
        await enforcePolicyAfterAudioTranscript({
          employeeId: clip.employee_id,
          employeeName: clip.employee_name || undefined,
          pseudonym: clip.pseudonym || undefined,
          transcript: text,
          relativePath: clip.audio_path,
          language: stt.language,
        });
      } catch {
        /* policy best-effort */
      }
      return NextResponse.json({
        success: true,
        clip: updated || clip,
        transcript: text,
        empty: false,
        language: stt.language,
        source: "server_stt",
      });
    }

    return NextResponse.json({
      success: true,
      clip,
      transcript: "",
      empty: true,
      message: stt.error
        ? `Convert failed: ${stt.error}. Update Interact Guard 1.2.77+ so new clips auto-attach text (UTF-8 fix).`
        : "No speech detected in this clip (silence, muted headset boom, or wrong input device).",
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "convert failed",
      },
      { status: 500 }
    );
  }
}
