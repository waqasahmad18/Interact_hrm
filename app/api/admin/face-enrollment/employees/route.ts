import { NextRequest, NextResponse } from "next/server";
import {
  listEmployeesFaceVerification,
  setEmployeeFaceVerificationEnabled,
  setEmployeesFaceVerificationEnabled,
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

    const body = (await req.json()) as {
      employeeId?: string | number;
      employeeIds?: Array<string | number>;
      enabled?: boolean;
    };
    if (typeof body.enabled !== "boolean") {
      return NextResponse.json(
        { success: false, error: "enabled (boolean) is required." },
        { status: 400 }
      );
    }

    if (Array.isArray(body.employeeIds) && body.employeeIds.length > 0) {
      const updated = await setEmployeesFaceVerificationEnabled(
        body.employeeIds,
        body.enabled
      );
      return NextResponse.json({
        success: true,
        updated,
        face_verification_enabled: body.enabled,
      });
    }

    const employeeId = String(body.employeeId ?? "").trim();
    if (!employeeId) {
      return NextResponse.json(
        { success: false, error: "employeeId or employeeIds required." },
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
