import { NextRequest, NextResponse } from "next/server";
import {
  getFaceVerificationStatus,
  getSimilarityMin,
  isFaceVerificationEnabled,
  RECOMMENDED_ENROLLMENT_MIN,
} from "@/lib/face-verify";
import {
  countDescriptorsForEmployee,
  countEnrollmentForEmployee,
  getDescriptorsForEmployee,
} from "@/lib/face-enrollment-table";
import { resolveEmployeeDbId } from "@/lib/resolve-employee-id";
import { isEmployeeFaceVerificationEnabled } from "@/lib/employee-face-verification";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rawEmployeeId = searchParams.get("employeeId")?.trim() || "";

  const config = await getFaceVerificationStatus();
  const globalEnabled = isFaceVerificationEnabled();

  if (!globalEnabled) {
    return NextResponse.json({
      ...config,
      enforcementRequired: false,
      enabled: false,
      connected: true,
      enrolled: false,
      enrollmentCount: 0,
      descriptorCount: 0,
      faceVerificationEnabledForEmployee: false,
    });
  }

  let canonicalSubject: string | null = null;
  let enrollmentCount = 0;
  let descriptorCount = 0;
  let resolvedEmployeeId: string | null = null;
  let needsDescriptorRefresh = false;

  try {
    if (rawEmployeeId) {
      resolvedEmployeeId = await resolveEmployeeDbId(rawEmployeeId);
      const id = resolvedEmployeeId || rawEmployeeId;
      const enrollment = await getDescriptorsForEmployee(id);
      canonicalSubject = enrollment.subject;
      enrollmentCount = await countEnrollmentForEmployee(id);
      descriptorCount = await countDescriptorsForEmployee(id);
      needsDescriptorRefresh =
        enrollmentCount >= RECOMMENDED_ENROLLMENT_MIN &&
        descriptorCount < RECOMMENDED_ENROLLMENT_MIN;
    }
  } catch (err) {
    console.error("biometric/status error:", err);
  }

  const enrolled = descriptorCount >= RECOMMENDED_ENROLLMENT_MIN;

  let faceVerificationEnabledForEmployee = true;
  if (rawEmployeeId) {
    const id = resolvedEmployeeId || rawEmployeeId;
    faceVerificationEnabledForEmployee = await isEmployeeFaceVerificationEnabled(id);
  }

  const enforcementRequired = globalEnabled && faceVerificationEnabledForEmployee;

  return NextResponse.json({
    ...config,
    enforcementRequired,
    enabled: globalEnabled,
    connected: true,
    enrolled,
    needsDescriptorRefresh,
    resolvedEmployeeId,
    canonicalSubject,
    enrollmentCount,
    descriptorCount,
    faceVerificationEnabledForEmployee,
    similarityMin: getSimilarityMin(),
  });
}
