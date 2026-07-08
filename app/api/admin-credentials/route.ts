import { NextRequest, NextResponse } from "next/server";
import { setAdminPassword } from "@/lib/admin-settings";

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const currentPassword = String(body.currentPassword || "");
    const newPassword = String(body.newPassword || "");
    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { success: false, error: "Current and new password are required." },
        { status: 400 }
      );
    }
    const result = await setAdminPassword(currentPassword, newPassword);
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Update failed" },
      { status: 500 }
    );
  }
}
