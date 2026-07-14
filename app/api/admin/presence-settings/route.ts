import { NextRequest, NextResponse } from "next/server";
import {
  getPresenceSettings,
  savePresenceSettings,
} from "@/lib/presence-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStoreJson(body: unknown, init?: { status?: number }) {
  return NextResponse.json(body, {
    status: init?.status,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      Pragma: "no-cache",
    },
  });
}

export async function GET() {
  try {
    const settings = await getPresenceSettings();
    return noStoreJson({ success: true, settings });
  } catch (err) {
    return noStoreJson(
      {
        success: false,
        error: err instanceof Error ? err.message : "Failed to load settings",
      },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const settings = await savePresenceSettings({
      presenceEnabled:
        typeof body.presenceEnabled === "boolean"
          ? body.presenceEnabled
          : undefined,
      idleWarningSeconds:
        typeof body.idleWarningSeconds === "number"
          ? body.idleWarningSeconds
          : typeof body.idleWarningSeconds === "string"
            ? parseInt(body.idleWarningSeconds, 10)
            : undefined,
      popupCountdownSeconds:
        typeof body.popupCountdownSeconds === "number"
          ? body.popupCountdownSeconds
          : typeof body.popupCountdownSeconds === "string"
            ? parseInt(body.popupCountdownSeconds, 10)
            : undefined,
      cameraVerificationEnabled:
        typeof body.cameraVerificationEnabled === "boolean"
          ? body.cameraVerificationEnabled
          : undefined,
      recheckWhileIdleSeconds:
        typeof body.recheckWhileIdleSeconds === "number"
          ? body.recheckWhileIdleSeconds
          : typeof body.recheckWhileIdleSeconds === "string"
            ? parseInt(body.recheckWhileIdleSeconds, 10)
            : undefined,
      agentExitPassword:
        typeof body.agentExitPassword === "string"
          ? body.agentExitPassword.trim()
          : undefined,
      enabledEmployeeIds: Array.isArray(body.enabledEmployeeIds)
        ? (body.enabledEmployeeIds as unknown[]).map((v) => String(v))
        : undefined,
    });
    return noStoreJson({ success: true, settings });
  } catch (err) {
    return noStoreJson(
      {
        success: false,
        error: err instanceof Error ? err.message : "Failed to save settings",
      },
      { status: 500 }
    );
  }
}
