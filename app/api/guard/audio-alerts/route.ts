import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import {
  allocateGuardAudioPath,
  enforcePolicyAfterAudioTranscript,
  getGuardAudioWatchEnabled,
} from "@/lib/guard-audio-alerts";

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
 * Guard agent posts: audio file + offline transcript (faster-whisper on PC).
 * Server matches Guard Policy keywords → silent ticket with audio path.
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

    const result = await enforcePolicyAfterAudioTranscript({
      employeeId,
      employeeName,
      pseudonym,
      transcript,
      relativePath,
      language,
    });

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

    return NextResponse.json({
      success: result.ok !== false,
      skipped,
      reason,
      ticket_number: ticketNumber,
      matched,
      audio_path: relativePath,
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

export async function GET() {
  const enabled = await getGuardAudioWatchEnabled();
  return NextResponse.json({ success: true, audio_watch_enabled: enabled });
}
