import { getEmployeeMatchKeys } from "@/lib/biometric-employee";
import {
  findClosestRival,
  getMaxMatchDistance,
  getMinMatchingPhotos,
  getSimilarityMin,
  isFaceVerificationEnabled,
  isValidDescriptor,
  matchProbeToDescriptors,
} from "@/lib/face-matching";
import {
  RECOMMENDED_ENROLLMENT_MIN,
  type VerifyResult,
} from "@/lib/face-types";
import {
  countDescriptorsForEmployee,
  countEnrollmentForEmployee,
  getDescriptorsForEmployee,
  getOtherEmployeesDescriptorSamples,
} from "@/lib/face-enrollment-table";
import { resolveEmployeeDbId } from "@/lib/resolve-employee-id";

export { RECOMMENDED_ENROLLMENT_MIN, RECOMMENDED_ENROLLMENT_MAX } from "@/lib/face-types";
export type { BiometricAction, VerifyResult, VerifyFailCode } from "@/lib/face-types";
export { isFaceVerificationEnabled, getSimilarityMin } from "@/lib/face-matching";

export function defaultSubjectForEmployee(
  employeeId: string,
  employeeName?: string | null
): string {
  const id = String(employeeId || "").trim();
  const name = String(employeeName || "")
    .trim()
    .replace(/\s+/g, " ");
  if (name && id) return `${name} ID ${id}`;
  if (id) return `employee_${id}`;
  return "unknown_employee";
}

function employeeDisplayLabel(
  matchKeys: { dbIds: string[]; names: string[] },
  fallbackId: string
): string {
  const name = matchKeys.names[0];
  const id = matchKeys.dbIds[0] || fallbackId;
  if (name && id) return `${name} (ID ${id})`;
  if (name) return name;
  return `Employee ID ${id}`;
}

export async function getFaceVerificationStatus() {
  return {
    configured: isFaceVerificationEnabled(),
    reachable: true,
    engine: "local",
    maxDistance: getMaxMatchDistance(),
    similarityMin: getSimilarityMin(),
  };
}

export async function verifyDescriptorForEmployee(
  descriptor: number[],
  employeeId: string,
  employeeName?: string | null
): Promise<VerifyResult> {
  const rawId = String(employeeId || "").trim();
  if (!rawId) {
    return { verified: false, reason: "Employee session missing. Log in again.", code: "error" };
  }
  if (!isFaceVerificationEnabled()) {
    return { verified: false, reason: "Face verification is disabled.", code: "error" };
  }
  if (!isValidDescriptor(descriptor)) {
    return {
      verified: false,
      reason: "No face detected. Center your face in the camera frame.",
      code: "no_face",
    };
  }

  const id = (await resolveEmployeeDbId(rawId)) || rawId;
  const matchKeys = await getEmployeeMatchKeys(id, employeeName);
  const label = employeeDisplayLabel(matchKeys, id);
  const enrollment = await getDescriptorsForEmployee(id);
  const descriptorCount = await countDescriptorsForEmployee(id);
  const photoCount = await countEnrollmentForEmployee(id);

  if (descriptorCount < RECOMMENDED_ENROLLMENT_MIN || !enrollment.descriptors.length) {
    if (photoCount >= RECOMMENDED_ENROLLMENT_MIN) {
      return {
        verified: false,
        reason: `Photos exist for ${label} but face profiles need refresh. HR: open Admin → Face Enrollment, select this employee — profiles will auto-update.`,
        code: "not_enrolled",
      };
    }
    return {
      verified: false,
      reason: `Face not enrolled for ${label}. Ask HR to add ${RECOMMENDED_ENROLLMENT_MIN}+ photos at Admin → Face Enrollment.`,
      code: "not_enrolled",
    };
  }

  const subject =
    enrollment.subject || defaultSubjectForEmployee(id, matchKeys.names[0] || employeeName);
  const maxDistance = getMaxMatchDistance();
  const minPhotos = getMinMatchingPhotos(enrollment.descriptors.length);
  const needPct = Math.round(getSimilarityMin() * 100);

  const self = matchProbeToDescriptors(
    descriptor,
    enrollment.descriptors,
    maxDistance,
    minPhotos
  );

  if (!self.pass) {
    const simPct = Math.round(self.similarity * 100);
    return {
      verified: false,
      reason: `Face does not match ${label} (${simPct}% — need ~${needPct}%+ on ${minPhotos} enrolled photos).`,
      code: "low_similarity",
      similarity: self.similarity,
      subject,
      expectedSubject: subject,
    };
  }

  const rivals = await getOtherEmployeesDescriptorSamples(id);
  const rival = findClosestRival(descriptor, rivals, self.bestDistance, maxDistance);
  if (rival) {
    return {
      verified: false,
      reason: `Face matches employee ID ${rival.employeeId} more closely. Only your enrolled face can proceed.`,
      code: "wrong_person",
      similarity: self.similarity,
      subject,
      expectedSubject: subject,
    };
  }

  return {
    verified: true,
    similarity: self.similarity,
    subject,
  };
}
