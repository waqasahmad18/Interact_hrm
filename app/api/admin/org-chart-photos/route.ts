import { NextRequest, NextResponse } from "next/server";
import {
  deleteOrgChartPhoto,
  getAllOrgChartPhotos,
  upsertOrgChartPhoto,
  type OrgChartPhotoSubjectType,
} from "@/lib/org-chart-photos-table";

function isSubjectType(v: unknown): v is OrgChartPhotoSubjectType {
  return (
    v === "employee" ||
    v === "role" ||
    v === "company_logo" ||
    v === "shell_avatar"
  );
}

export async function GET() {
  try {
    const photos = await getAllOrgChartPhotos();
    return NextResponse.json({ success: true, ...photos });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load photos";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const subjectType = body?.subjectType;
    const subjectId = String(body?.subjectId ?? "").trim();
    const photoData = String(body?.photoData ?? "").trim();

    if (!isSubjectType(subjectType) || !subjectId || !photoData) {
      return NextResponse.json(
        { success: false, error: "subjectType, subjectId, and photoData are required" },
        { status: 400 },
      );
    }
    if (!photoData.startsWith("data:image/")) {
      return NextResponse.json(
        { success: false, error: "photoData must be a base64 image data URL" },
        { status: 400 },
      );
    }

    await upsertOrgChartPhoto(subjectType, subjectId, photoData);
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to save photo";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const params = new URL(req.url).searchParams;
    const subjectType = params.get("subjectType");
    const subjectId = String(params.get("subjectId") ?? "").trim();

    if (!isSubjectType(subjectType) || !subjectId) {
      return NextResponse.json(
        { success: false, error: "subjectType and subjectId are required" },
        { status: 400 },
      );
    }

    const deleted = await deleteOrgChartPhoto(subjectType, subjectId);
    if (!deleted) {
      return NextResponse.json({ success: false, error: "Photo not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to delete photo";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
