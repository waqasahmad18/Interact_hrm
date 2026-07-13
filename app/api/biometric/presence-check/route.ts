import { NextRequest, NextResponse } from "next/server";
import { verifyDescriptorForEmployee } from "@/lib/face-verify";
import { isValidDescriptor } from "@/lib/face-matching";
import { resolveEmployeeDbId } from "@/lib/resolve-employee-id";

export const runtime = "nodejs";

/**
 * Silent presence check for the desktop agent.
 * Uses the same enrollment descriptors + matching as clock/break verify,
 * but does NOT issue a biometric_token (no clock/break action).
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      employee_id?: string;
      employee_name?: string;
      descriptor?: number[];
    };
    const employeeId = String(body.employee_id || "").trim();
    const employeeName = String(body.employee_name || "").trim() || null;
    const descriptor = isValidDescriptor(body.descriptor) ? body.descriptor! : null;

    if (!employeeId) {
      return NextResponse.json(
        { success: false, error: "employee_id required", code: "error" },
        { status: 400 },
      );
    }
    if (!descriptor) {
      return NextResponse.json({
        success: true,
        verified: false,
        atSeat: false,
        code: "no_face",
        error: "No face detected in frame.",
      });
    }

    const resolvedId = (await resolveEmployeeDbId(employeeId)) || employeeId;
    const result = await verifyDescriptorForEmployee(descriptor, resolvedId, employeeName);

    return NextResponse.json({
      success: true,
      verified: result.verified,
      atSeat: result.verified,
      code: result.verified ? "ok" : result.code,
      similarity: result.similarity,
      error: result.verified ? null : result.reason,
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        verified: false,
        atSeat: false,
        code: "error",
        error: err instanceof Error ? err.message : "Presence check failed",
      },
      { status: 500 },
    );
  }
}
