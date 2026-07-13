import { NextResponse } from "next/server";
import { getPresenceSettings } from "@/lib/presence-settings";

export const runtime = "nodejs";

/**
 * Public read for desktop presence agent (no secrets).
 * Agent polls this to apply admin-configured idle / camera settings.
 */
export async function GET() {
  try {
    const settings = await getPresenceSettings();
    return NextResponse.json({
      success: true,
      settings: {
        presenceEnabled: settings.presenceEnabled,
        idleWarningSeconds: settings.idleWarningSeconds,
        popupCountdownSeconds: settings.popupCountdownSeconds,
        cameraVerificationEnabled: settings.cameraVerificationEnabled,
        recheckWhileIdleSeconds: settings.recheckWhileIdleSeconds,
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Failed to load settings",
      },
      { status: 500 }
    );
  }
}
