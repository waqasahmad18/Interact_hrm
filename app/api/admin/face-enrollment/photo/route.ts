import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { deleteEnrollmentRowById } from "@/lib/face-enrollment-table";

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
      const relative = row.local_path.replace(/^\/+/, "");
      const diskPath = path.join(process.cwd(), "public", relative);
      try {
        await fs.unlink(diskPath);
      } catch {
        // file may already be gone
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Delete failed";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
