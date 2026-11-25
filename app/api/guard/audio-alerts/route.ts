import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import {
  allocateGuardAudioPath,
  enforcePolicyAfterAudioTranscript,
  getGuardAudioWatchEnabled,
} from "@/lib/guard-audio-alerts";
import { insertGuardAudioClip } from "@/lib/guard-audio-clips";
import { ensureClassicPcmWav } from "@/lib/guard-audio-wav";

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

async function saveClipAndMaybeTicket(input: {
  employeeId: string;
  employeeName?: string;
  pseudonym?: string;
  transcript: string;
  language: string | null;
  buf: Buffer;
  ext: string;
}) {
  const { absolutePath, relativePath } = await allocateGuardAudioPath(
    input.employeeId,
    input.ext
  );
  // Store classic PCM WAV so admin players can stream without a rewrite tax.
  const toWrite =
    input.ext === "wav" ? ensureClassicPcmWav(input.buf) : input.buf;
  await fs.writeFile(absolutePath, toWrite);

  const result = input.transcript
    ? await enforcePolicyAfterAudioTranscript({
        employeeId: input.employeeId,
        employeeName: input.employeeName,
        pseudonym: input.pseudonym,
        transcript: input.transcript,
        relativePath,
        language: input.language,
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
    employeeId: input.employeeId,
    employeeName: input.employeeName,
    pseudonym: input.pseudonym,
    audioPath: relativePath,
    transcript: input.transcript || null,
    language: input.language,
    matched: matched.length ? matched : null,
    ticketNumber,
    byteSize: toWrite.length,
  });

  return {
    success: result.ok !== false,
    skipped,
    reason,
    ticket_number: ticketNumber,
    matched,
    audio_path: relativePath,
    clip_id: clipId,
    error,
  };
}

/**
 * Guard agent posts every mic clip (quality samples) + optional offline transcript.
 * Accepts:
 *  - application/json { audio_base64, employee_id, ... }  (preferred — reliable from .NET)
 *  - multipart/form-data with "audio" file (curl / legacy)
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

    // --- JSON + base64 (Interact Guard agent) ---
    if (contentType.includes("application/json")) {
      const body = await req.json().catch(() => null);
      if (!body || typeof body !== "object") {
        return NextResponse.json(
          { success: false, error: "invalid json body" },
          { status: 400 }
        );
      }
      const employeeId =
        String((body as { employee_id?: string }).employee_id || "").trim() ||
        dec(req.headers.get("x-employee-id"));
      if (!employeeId) {
        return NextResponse.json(
          { success: false, error: "employee_id required" },
          { status: 400 }
        );
      }
      const b64 = String(
        (body as { audio_base64?: string }).audio_base64 || ""
      ).trim();
      if (!b64) {
        return NextResponse.json(
          { success: false, error: "audio_base64 required" },
          { status: 400 }
        );
      }
      let buf: Buffer;
      try {
        buf = Buffer.from(b64, "base64");
      } catch {
        return NextResponse.json(
          { success: false, error: "audio_base64 invalid" },
          { status: 400 }
        );
      }
      if (!buf.length || buf.length > MAX_BYTES) {
        return NextResponse.json(
          { success: false, error: "audio size invalid (max 8MB)" },
          { status: 400 }
        );
      }
      const name = String(
        (body as { filename?: string }).filename || "clip.wav"
      ).toLowerCase();
      const ext = name.endsWith(".mp3")
        ? "mp3"
        : name.endsWith(".webm")
          ? "webm"
          : "wav";
      const transcript = String(
        (body as { transcript?: string }).transcript || ""
      ).trim();
      const language =
        String((body as { language?: string }).language || "").trim() || null;
      const employeeName =
        String((body as { employee_name?: string }).employee_name || "").trim() ||
        dec(req.headers.get("x-employee-name")) ||
        undefined;
      const pseudonym =
        String((body as { pseudonym?: string }).pseudonym || "").trim() ||
        dec(req.headers.get("x-pseudonym")) ||
        undefined;

      const out = await saveClipAndMaybeTicket({
        employeeId,
        employeeName,
        pseudonym,
        transcript,
        language,
        buf,
        ext,
      });
      return NextResponse.json(out);
    }

    // --- multipart (curl / manual) ---
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        {
          success: false,
          error: "application/json (audio_base64) or multipart/form-data required",
        },
        { status: 400 }
      );
    }

    let form: FormData;
    try {
      form = await req.formData();
    } catch (err) {
      return NextResponse.json(
        {
          success: false,
          error:
            err instanceof Error
              ? `FormData parse failed: ${err.message}`
              : "FormData parse failed",
        },
        { status: 400 }
      );
    }

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

    const out = await saveClipAndMaybeTicket({
      employeeId,
      employeeName,
      pseudonym,
      transcript,
      language,
      buf,
      ext,
    });
    return NextResponse.json(out);
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
