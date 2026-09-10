import { NextRequest, NextResponse } from "next/server";
import { getEmployeeAccessPayload } from "@/lib/access-control/store";

export const runtime = "nodejs";

/**
 * Runtime access for the logged-in employee.
 * Query: ?employeeId=96
 */
export async function GET(req: NextRequest) {
  try {
    const employeeId =
      req.nextUrl.searchParams.get("employeeId") ||
      req.nextUrl.searchParams.get("id") ||
      "";
    if (!employeeId.trim()) {
      return NextResponse.json(
        { success: false, error: "employeeId required" },
        { status: 400 },
      );
    }
    const payload = await getEmployeeAccessPayload(employeeId.trim());
    return NextResponse.json({ success: true, ...payload });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
