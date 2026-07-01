import { NextRequest, NextResponse } from "next/server";
import { getEmployeeHierarchy } from "@/lib/employee-hierarchy-table";

export async function GET(req: NextRequest) {
  try {
    const employeeId = new URL(req.url).searchParams.get("employeeId");
    if (!employeeId?.trim()) {
      return NextResponse.json(
        { success: false, error: "employeeId required" },
        { status: 400 },
      );
    }

    const hierarchy = await getEmployeeHierarchy(employeeId.trim());
    if (!hierarchy) {
      return NextResponse.json(
        { success: false, error: "Employee not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, ...hierarchy });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
