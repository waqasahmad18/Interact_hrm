import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import {
  deleteEnrollmentRowById,
  getEnrollmentRowById,
} from "@/lib/face-enrollment-table";
import { resolveEnrollmentPhotoDiskPath } from "@/lib/enrollment-photo-disk";

function contentTypeForPath(diskPath: string): string {
  const ext = path.extname(diskPath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}

export async function GET(req: NextRequest) {
  try {
    const id = Number(new URL(req.url).searchParams.get("id"));
    if (!id) {
      return NextResponse.json({ success: false, error: "id is required" }, { status: 400 });
    }

    const row = await getEnrollmentRowById(id);
    if (!row?.local_path) {
      return NextResponse.json({ success: false, error: "Photo not found" }, { status: 404 });
    }

    const diskPath = resolveEnrollmentPhotoDiskPath(row.local_path);
    if (!diskPath) {
      return NextResponse.json(
        {
          success: false,
          error: "Image file missing on server disk",
          local_path: row.local_path,
        },
        { status: 404 }
      );
    }

    const buffer = await fs.readFile(diskPath);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentTypeForPath(diskPath),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load photo";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = Number(new URL(req.url).searchParams.get("id"));
    if (!id) {
      return NextResponse.json({ success: false, error: "id is required" }, { status: 400 });
    }

    const row = await deleteEnrollmentRowById(id);
    if (!row) {
      return NextResponse.json({ success: false, error: "Photo not found" }, { status: 404 });
    }

    if (row.local_path) {
      const diskPath = resolveEnrollmentPhotoDiskPath(row.local_path);
      if (diskPath) {
        try {
          await fs.unlink(diskPath);
        } catch {
          // file may already be gone
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Delete failed";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
