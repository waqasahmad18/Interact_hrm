import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { employeeInitials, getEmployeePhoto } from "@/lib/employee-photo";

export async function GET(req: NextRequest) {
  try {
    const employeeId = req.nextUrl.searchParams.get("employeeId");
    if (!employeeId) {
      return NextResponse.json({ success: false, error: "employeeId required" }, { status: 400 });
    }

    const [rows]: any = await query(
      `SELECT TRIM(CONCAT(COALESCE(first_name,''), ' ', COALESCE(last_name,''))) AS name
       FROM hrm_employees
       WHERE CAST(id AS CHAR) = ? OR employee_code = ?
       LIMIT 1`,
      [employeeId, employeeId]
    );
    const name =
      (Array.isArray(rows) && rows[0]?.name?.trim()) ||
      "Employee";
    const photo = await getEmployeePhoto(employeeId);

    return NextResponse.json({
      success: true,
      employeeId,
      name,
      photo,
      initials: employeeInitials(name),
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
