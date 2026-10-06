import { NextRequest, NextResponse } from "next/server";
import { saveGuardScreenshot } from "@/lib/guard-screenshots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 12 * 1024 * 1024; // 12MB

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const image = form.get("image");
    const employeeId = String(form.get("employee_id") || "").trim();
    const employeeName = String(form.get("employee_name") || "").trim();
    const pseudonym = String(form.get("pseudonym") || "").trim();
    const capturedAtRaw = String(form.get("captured_at") || "").trim();

    if (!employeeId) {
      return NextResponse.json(
        { success: false, error: "employee_id required" },
        { status: 400 }
      );
    }
    if (!(image instanceof File)) {
      return NextResponse.json(
        { success: false, error: "image required" },
        { status: 400 }
      );
    }
    if (image.size <= 0 || image.size > MAX_BYTES) {
      return NextResponse.json(
        { success: false, error: "image size invalid" },
        { status: 400 }
      );
    }

    const buf = Buffer.from(await image.arrayBuffer());
    // PNG magic bytes
    if (
      buf.length < 8 ||
      buf[0] !== 0x89 ||
      buf[1] !== 0x50 ||
      buf[2] !== 0x4e ||
      buf[3] !== 0x47
    ) {
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
      png: buf,
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
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Upload failed",
      },
      { status: 500 }
    );
  }
}
