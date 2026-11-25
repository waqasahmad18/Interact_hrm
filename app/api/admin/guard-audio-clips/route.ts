import { NextRequest, NextResponse } from "next/server";
import {
  getGuardAudioClip,
  listGuardAudioClips,
  updateGuardAudioClipTranscript,
} from "@/lib/guard-audio-clips";
import { isGalleryUnlocked } from "@/lib/guard-screenshots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
 * "Convert to text" — returns stored Whisper transcript from capture time.
 * (STT runs offline on the Guard PC when the clip is recorded.)
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
    const text = String(clip.transcript || "").trim();
    if (text) {
      return NextResponse.json({
        success: true,
        clip,
        transcript: text,
        empty: false,
      });
    }
    // Explicit empty: keep row but surface a clear message for admin.
    const updated = await updateGuardAudioClipTranscript(id, "", clip.language);
    return NextResponse.json({
      success: true,
      clip: updated || clip,
      transcript: "",
      empty: true,
      message:
        "No speech detected in this clip (silence, muted headset boom, or wrong input device).",
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
