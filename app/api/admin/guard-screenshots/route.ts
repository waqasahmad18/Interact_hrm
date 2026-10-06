import { NextRequest, NextResponse } from "next/server";
import {
  isGalleryUnlocked,
  listScreenshotEmployees,
  listScreenshotsForEmployee,
} from "@/lib/guard-screenshots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    if (!isGalleryUnlocked(req)) {
      return NextResponse.json(
        { success: false, error: "Gallery locked", locked: true },
        { status: 401 }
      );
    }

    const employeeId = String(
      req.nextUrl.searchParams.get("employeeId") || ""
    ).trim();

    if (employeeId) {
      const files = await listScreenshotsForEmployee(employeeId);
      return NextResponse.json({ success: true, files });
    }

    const employees = await listScreenshotEmployees();
    return NextResponse.json({ success: true, employees });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "List failed",
      },
      { status: 500 }
    );
  }
}
