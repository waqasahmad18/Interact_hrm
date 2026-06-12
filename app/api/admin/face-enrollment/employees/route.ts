import { NextRequest, NextResponse } from "next/server";
import {
  listEmployeesFaceVerification,
  setEmployeeFaceVerificationEnabled,
} from "@/lib/employee-face-verification";
import { isFaceVerificationEnabled } from "@/lib/face-matching";

export const runtime = "nodejs";

export async function GET() {
  try {
    const employees = await listEmployeesFaceVerification();
    return NextResponse.json({
      success: true,
      globalEnabled: isFaceVerificationEnabled(),
      employees,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load employees";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    if (!isFaceVerificationEnabled()) {
      return NextResponse.json(
        { success: false, error: "Face verification is disabled globally in settings." },
        { status: 400 }
      );
    }

    const body = (await req.json()) as { employeeId?: string | number; enabled?: boolean };
    const employeeId = String(body.employeeId ?? "").trim();
    if (!employeeId || typeof body.enabled !== "boolean") {
      return NextResponse.json(
        { success: false, error: "employeeId and enabled (boolean) are required." },
        { status: 400 }
      );
    }

    const ok = await setEmployeeFaceVerificationEnabled(employeeId, body.enabled);
    if (!ok) {
      return NextResponse.json({ success: false, error: "Employee not found." }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      employeeId,
      face_verification_enabled: body.enabled,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Update failed";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
