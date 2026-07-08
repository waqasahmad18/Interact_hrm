import { NextRequest, NextResponse } from "next/server";
import { isAdminLoginId, verifyAdminPassword } from "@/lib/admin-settings";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const loginId = String(body.loginId || "").trim();
    const password = String(body.password || "");
    if (!isAdminLoginId(loginId)) {
      return NextResponse.json({ success: false, error: "Not an admin account." }, { status: 401 });
    }
    const ok = await verifyAdminPassword(password);
    if (!ok) {
      return NextResponse.json({ success: false, error: "Invalid credentials." }, { status: 401 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Login failed" },
      { status: 500 }
    );
  }
}
