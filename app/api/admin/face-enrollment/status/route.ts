import { NextResponse } from "next/server";
import {
  getFaceVerificationStatus,
  RECOMMENDED_ENROLLMENT_MAX,
  RECOMMENDED_ENROLLMENT_MIN,
} from "@/lib/face-verify";

export async function GET() {
  const status = await getFaceVerificationStatus();
  return NextResponse.json({
    success: true,
    ...status,
    configured: true,
    reachable: true,
    recommendedMin: RECOMMENDED_ENROLLMENT_MIN,
    recommendedMax: RECOMMENDED_ENROLLMENT_MAX,
  });
}
