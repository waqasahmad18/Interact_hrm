import { NextResponse } from "next/server";
import type { BiometricAction } from "@/lib/face-types";
import {
  biometricRequiredError,
  consumeBiometricGrant,
  isBiometricEnforcementEnabled,
} from "@/lib/biometric-session";
import { isEmployeeFaceVerificationEnabled } from "@/lib/employee-face-verification";

export async function enforceBiometricOrRespond(
  biometricToken: string | undefined | null,
  employeeId: string,
  action: BiometricAction,
  employeeName?: string | null
): Promise<NextResponse | null> {
  if (!isBiometricEnforcementEnabled()) return null;
  if (!(await isEmployeeFaceVerificationEnabled(employeeId))) return null;
  if (await consumeBiometricGrant(biometricToken, employeeId, employeeName, action)) {
    return null;
  }
  return NextResponse.json(
    { success: false, error: biometricRequiredError(action) },
    { status: 403 }
  );
}
