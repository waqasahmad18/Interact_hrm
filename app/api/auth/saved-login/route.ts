import { NextRequest, NextResponse } from "next/server";
import {
  deleteSavedLoginForDevice,
  getSavedLoginForDevice,
  upsertSavedLogin,
} from "@/lib/saved-login-db";
import { ensureDeviceKey, readDeviceKey } from "@/lib/saved-login-device";

export async function GET(req: NextRequest) {
  try {
    const deviceKey = readDeviceKey(req);
    if (!deviceKey) {
      return NextResponse.json({ success: true, loginId: null, password: null });
    }

    const saved = await getSavedLoginForDevice(deviceKey);
    if (!saved) {
      return NextResponse.json({ success: true, loginId: null, password: null });
    }

    return NextResponse.json({
      success: true,
      loginId: saved.login_id,
      password: saved.password,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load saved login";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const loginId = String(body?.loginId || "").trim();
    const password = String(body?.password || "");

    if (!loginId || !password) {
      return NextResponse.json(
        { success: false, error: "loginId and password are required" },
        { status: 400 }
      );
    }

    const res = NextResponse.json({ success: true });
    const deviceKey = ensureDeviceKey(req, res);
    await upsertSavedLogin(deviceKey, loginId, password);
    return res;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to save login";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const deviceKey = readDeviceKey(req);
    if (deviceKey) {
      await deleteSavedLoginForDevice(deviceKey);
    }
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to delete saved login";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
