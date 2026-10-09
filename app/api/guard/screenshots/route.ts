import { NextRequest, NextResponse } from "next/server";
import { saveGuardScreenshot } from "@/lib/guard-screenshots";
import { enforcePolicyAfterOcr } from "@/lib/guard-keyword-watch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 12 * 1024 * 1024; // 12MB

function isPng(buf: Buffer): boolean {
  return (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  );
}

function isJpeg(buf: Buffer): boolean {
  return buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
}

async function readImageFromRequest(req: NextRequest): Promise<{
  bytes: Buffer;
  ext: "png" | "jpg";
  employeeId: string;
  employeeName: string;
  pseudonym: string;
  capturedAtRaw: string;
}> {
  const ct = (req.headers.get("content-type") || "").toLowerCase();
  const dec = (raw: string | null) => {
    const v = String(raw || "").trim();
    if (!v) return "";
    try {
      return decodeURIComponent(v);
    } catch {
      return v;
    }
  };

  // Preferred path for Interact Guard (.NET): raw image + metadata headers.
  if (
    ct.includes("image/png") ||
    ct.includes("image/jpeg") ||
    ct.includes("image/jpg") ||
    ct.includes("application/octet-stream")
  ) {
    const ab = await req.arrayBuffer();
    const bytes = Buffer.from(ab);
    let ext: "png" | "jpg" = "png";
    if (ct.includes("jpeg") || ct.includes("jpg") || isJpeg(bytes)) ext = "jpg";
    else if (isPng(bytes)) ext = "png";
    else if (isJpeg(bytes)) ext = "jpg";
    return {
      bytes,
      ext,
      employeeId: dec(req.headers.get("x-employee-id")),
      employeeName: dec(req.headers.get("x-employee-name")),
      pseudonym: dec(req.headers.get("x-pseudonym")),
      capturedAtRaw: dec(req.headers.get("x-captured-at")),
    };
  }

  // Fallback: multipart (curl / browsers)
  const form = await req.formData();
  const image = form.get("image");
  if (!(image instanceof Blob) || image.size <= 0) {
    throw new Error("image required");
  }
  const bytes = Buffer.from(await image.arrayBuffer());
  const formCt = (image.type || "").toLowerCase();
  const ext: "png" | "jpg" =
    formCt.includes("jpeg") || formCt.includes("jpg") || isJpeg(bytes)
      ? "jpg"
      : "png";
  return {
    bytes,
    ext,
    employeeId: String(form.get("employee_id") || "").trim(),
    employeeName: String(form.get("employee_name") || "").trim(),
    pseudonym: String(form.get("pseudonym") || "").trim(),
    capturedAtRaw: String(form.get("captured_at") || "").trim(),
  };
}

export async function POST(req: NextRequest) {
  try {
    const { bytes, ext, employeeId, employeeName, pseudonym, capturedAtRaw } =
      await readImageFromRequest(req);

    if (!employeeId) {
      return NextResponse.json(
        { success: false, error: "employee_id required" },
        { status: 400 }
      );
    }
    if (bytes.length <= 0 || bytes.length > MAX_BYTES) {
      return NextResponse.json(
        { success: false, error: "image size invalid" },
        { status: 400 }
      );
    }
    if (!isPng(bytes) && !isJpeg(bytes)) {
      return NextResponse.json(
        { success: false, error: "PNG or JPEG required" },
        { status: 400 }
      );
    }

    let capturedAt: Date | undefined;
    if (capturedAtRaw) {
      const d = new Date(capturedAtRaw);
      if (!Number.isNaN(d.getTime())) capturedAt = d;
    }

    const saved = await saveGuardScreenshot({
      png: bytes,
      employeeId,
      employeeName,
      pseudonym,
      capturedAt,
      ext: isJpeg(bytes) ? "jpg" : ext,
    });

    // RULE: every screenshot upload must OCR + check Policy (words/sites/docs/apps).
    void enforcePolicyAfterOcr({
      absolutePath: saved.absolutePath,
      relativePath: saved.relativePath,
      employeeId,
      employeeName,
      pseudonym,
    }).then((result) => {
      if (!result.ok) {
        console.warn("[guard/screenshots] policy check failed:", result.error);
        return;
      }
      if (!result.skipped) {
        console.log(
          "[guard/screenshots] policy ticket",
          result.ticketNumber,
          result.matched
        );
      }
    });

    return NextResponse.json({
      success: true,
      path: saved.relativePath,
      fileName: saved.fileName,
    });
  } catch (err) {
    console.error("[guard/screenshots] upload failed", err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Upload failed",
      },
      { status: 500 }
    );
  }
}
