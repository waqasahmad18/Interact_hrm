import { NextRequest, NextResponse } from "next/server";
import { saveGuardScreenshot } from "@/lib/guard-screenshots";

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

async function readPngFromRequest(req: NextRequest): Promise<{
  png: Buffer;
  employeeId: string;
  employeeName: string;
  pseudonym: string;
  capturedAtRaw: string;
}> {
  const ct = (req.headers.get("content-type") || "").toLowerCase();

  // Preferred path for Interact Guard (.NET): raw PNG + metadata headers.
  // Avoids Next.js FormData parse failures with MultipartFormDataContent.
  if (ct.includes("image/png") || ct.includes("application/octet-stream")) {
    const ab = await req.arrayBuffer();
    const png = Buffer.from(ab);
    const dec = (raw: string | null) => {
      const v = String(raw || "").trim();
      if (!v) return "";
      try {
        return decodeURIComponent(v);
      } catch {
        return v;
      }
    };
    return {
      png,
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
  const png = Buffer.from(await image.arrayBuffer());
  return {
    png,
    employeeId: String(form.get("employee_id") || "").trim(),
    employeeName: String(form.get("employee_name") || "").trim(),
    pseudonym: String(form.get("pseudonym") || "").trim(),
    capturedAtRaw: String(form.get("captured_at") || "").trim(),
  };
}

export async function POST(req: NextRequest) {
  try {
    const { png, employeeId, employeeName, pseudonym, capturedAtRaw } =
      await readPngFromRequest(req);

    if (!employeeId) {
      return NextResponse.json(
        { success: false, error: "employee_id required" },
        { status: 400 }
      );
    }
    if (png.length <= 0 || png.length > MAX_BYTES) {
      return NextResponse.json(
        { success: false, error: "image size invalid" },
        { status: 400 }
      );
    }
    if (!isPng(png)) {
      return NextResponse.json(
        { success: false, error: "PNG required" },
        { status: 400 }
      );
    }

    let capturedAt: Date | undefined;
    if (capturedAtRaw) {
      const d = new Date(capturedAtRaw);
      if (!Number.isNaN(d.getTime())) capturedAt = d;
    }

    const saved = await saveGuardScreenshot({
      png,
      employeeId,
      employeeName,
      pseudonym,
      capturedAt,
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
