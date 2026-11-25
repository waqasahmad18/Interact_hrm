import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import {
  allocateGuardAudioPath,
  enforcePolicyAfterAudioTranscript,
  getGuardAudioWatchEnabled,
} from "@/lib/guard-audio-alerts";
import { insertGuardAudioClip } from "@/lib/guard-audio-clips";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024 * 1024; // 8MB wav clip

function dec(raw: string | null) {
  const v = String(raw || "").trim();
  if (!v) return "";
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

/**
 * Guard agent posts every mic clip (quality samples) + optional offline transcript.
 * Always stores the WAV for admin playback. Keyword match → silent policy ticket.
 */
export async function POST(req: NextRequest) {
  try {
    if (!(await getGuardAudioWatchEnabled())) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: "audio_disabled",
      });
    }

    const contentType = req.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        { success: false, error: "multipart/form-data required" },
        { status: 400 }
      );
    }

    const form = await req.formData();
    const employeeId =
      String(form.get("employee_id") || "").trim() ||
      dec(req.headers.get("x-employee-id"));
    if (!employeeId) {
      return NextResponse.json(
        { success: false, error: "employee_id required" },
        { status: 400 }
      );
    }

    const transcript = String(form.get("transcript") || "").trim();
    const language = String(form.get("language") || "").trim() || null;
    const employeeName =
      String(form.get("employee_name") || "").trim() ||
      dec(req.headers.get("x-employee-name")) ||
      undefined;
    const pseudonym =
      String(form.get("pseudonym") || "").trim() ||
      dec(req.headers.get("x-pseudonym")) ||
      undefined;

    const file = form.get("audio");
    if (!file || typeof file === "string") {
      return NextResponse.json(
        { success: false, error: "audio file required" },
        { status: 400 }
      );
    }

    const buf = Buffer.from(await file.arrayBuffer());
    if (!buf.length || buf.length > MAX_BYTES) {
      return NextResponse.json(
        { success: false, error: "audio size invalid (max 8MB)" },
        { status: 400 }
      );
    }

    const name = String((file as File).name || "clip.wav").toLowerCase();
    const ext = name.endsWith(".mp3")
      ? "mp3"
      : name.endsWith(".webm")
        ? "webm"
        : "wav";

    const { absolutePath, relativePath } = await allocateGuardAudioPath(
      employeeId,
      ext
    );
    await fs.writeFile(absolutePath, buf);

    const result = transcript
      ? await enforcePolicyAfterAudioTranscript({
          employeeId,
          employeeName,
          pseudonym,
          transcript,
          relativePath,
          language,
        })
      : ({ ok: true, skipped: true, reason: "empty_transcript" } as const);

    const skipped = result.ok === true && "skipped" in result && !!result.skipped;
    const reason =
      result.ok === true && "reason" in result ? result.reason ?? null : null;
    const ticketNumber =
      result.ok === true && "ticketNumber" in result
        ? result.ticketNumber ?? null
        : null;
    const matched =
      result.ok === true && "matched" in result ? result.matched ?? [] : [];
    const error = result.ok === false ? result.error : null;

    const clipId = await insertGuardAudioClip({
      employeeId,
      employeeName,
      pseudonym,
      audioPath: relativePath,
      transcript: transcript || null,
      language,
      matched: matched.length ? matched : null,
      ticketNumber,
      byteSize: buf.length,
    });

    return NextResponse.json({
      success: result.ok !== false,
      skipped,
      reason,
      ticket_number: ticketNumber,
      matched,
      audio_path: relativePath,
      clip_id: clipId,
      error,
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "audio alert failed",
      },
      { status: 500 }
    );
  }
}

/**
 * After ambient upload: agent attaches Whisper transcript + optional policy ticket.
 * Body: { clip_id, transcript, language?, employee_id?, employee_name?, pseudonym? }
 */
export async function PATCH(req: NextRequest) {
  try {
    if (!(await getGuardAudioWatchEnabled())) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: "audio_disabled",
      });
    }

    const body = await req.json().catch(() => ({}));
    const clipId = Number(body?.clip_id || 0);
    const transcript = String(body?.transcript || "").trim();
    const language = String(body?.language || "").trim() || null;
    if (!clipId || !transcript) {
      return NextResponse.json(
        { success: false, error: "clip_id and transcript required" },
        { status: 400 }
      );
    }

    const { getGuardAudioClip, updateGuardAudioClipTranscript } = await import(
      "@/lib/guard-audio-clips"
    );
    const clip = await getGuardAudioClip(clipId);
    if (!clip) {
      return NextResponse.json(
        { success: false, error: "clip not found" },
        { status: 404 }
      );
    }

    await updateGuardAudioClipTranscript(clipId, transcript, language);

    const employeeId =
      String(body?.employee_id || "").trim() ||
      clip.employee_id ||
      dec(req.headers.get("x-employee-id"));
    const employeeName =
      String(body?.employee_name || "").trim() ||
      clip.employee_name ||
      dec(req.headers.get("x-employee-name")) ||
      undefined;
    const pseudonym =
      String(body?.pseudonym || "").trim() ||
      clip.pseudonym ||
      dec(req.headers.get("x-pseudonym")) ||
      undefined;

    const result = await enforcePolicyAfterAudioTranscript({
      employeeId,
      employeeName: employeeName || undefined,
      pseudonym: pseudonym || undefined,
      transcript,
      relativePath: clip.audio_path,
      language,
    });

    const ticketNumber =
      result.ok === true && "ticketNumber" in result
        ? result.ticketNumber ?? null
        : null;
    const matched =
      result.ok === true && "matched" in result ? result.matched ?? [] : [];

    if (ticketNumber || matched.length) {
      const { pool } = await import("@/lib/db");
      await pool.execute(
        `UPDATE guard_audio_clips
         SET matched_json = ?, ticket_number = COALESCE(?, ticket_number)
         WHERE id = ?`,
        [
          matched.length ? JSON.stringify(matched.slice(0, 20)) : null,
          ticketNumber,
          clipId,
        ]
      );
    }

    return NextResponse.json({
      success: true,
      clip_id: clipId,
      ticket_number: ticketNumber,
      matched,
      skipped: result.ok === true && "skipped" in result ? !!result.skipped : false,
      reason:
        result.ok === true && "reason" in result ? result.reason ?? null : null,
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "transcript patch failed",
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  const enabled = await getGuardAudioWatchEnabled();
  return NextResponse.json({ success: true, audio_watch_enabled: enabled });
}
