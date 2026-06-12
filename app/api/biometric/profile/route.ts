import { NextRequest, NextResponse } from "next/server";
import { getSimilarityMin } from "@/lib/face-matching";
import { countDescriptorsForEmployee, getDescriptorsForEmployee } from "@/lib/face-enrollment-table";
import { getEmployeeMatchKeys } from "@/lib/biometric-employee";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const employeeId = searchParams.get("employeeId")?.trim();
  const employeeName = searchParams.get("employeeName")?.trim() || null;

  if (!employeeId) {
    return NextResponse.json({ success: false, error: "employeeId required" }, { status: 400 });
  }

  const matchKeys = await getEmployeeMatchKeys(employeeId, employeeName);
  const enrollment = await getDescriptorsForEmployee(employeeId);
  const descriptorCount = await countDescriptorsForEmployee(employeeId);

  return NextResponse.json({
    success: true,
    matchKeys,
    canonicalSubject: enrollment.subject,
    enrollmentCount: enrollment.count,
    descriptorCount,
    similarityMin: getSimilarityMin(),
    engine: "local",
  });
}
