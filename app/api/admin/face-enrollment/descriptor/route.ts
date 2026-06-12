import { NextRequest, NextResponse } from "next/server";
import { isValidDescriptor } from "@/lib/face-matching";
import { updateEnrollmentDescriptor } from "@/lib/face-enrollment-table";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { id?: number; descriptor?: number[] };
    const rowId = Number(body.id);
    if (!rowId || !isValidDescriptor(body.descriptor)) {
      return NextResponse.json(
        { success: false, error: "Valid row id and 128-d descriptor required." },
        { status: 400 }
      );
    }

    const ok = await updateEnrollmentDescriptor(rowId, body.descriptor);
    if (!ok) {
      return NextResponse.json({ success: false, error: "Enrollment row not found." }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Update failed";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
