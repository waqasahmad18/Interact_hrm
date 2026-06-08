import { NextRequest, NextResponse } from "next/server";
import { sweepAutoPresenceClockOuts } from "@/lib/auto-presence-sweep";
import { registerAutoPresenceCron } from "@/lib/register-auto-presence-cron";

export const runtime = "nodejs";

/** Manual / Task Scheduler trigger — also ensures background cron is registered. */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    const auth = req.headers.get("authorization")?.trim();
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
  }

  registerAutoPresenceCron();
  const result = await sweepAutoPresenceClockOuts();

  return NextResponse.json({
    success: true,
    serverNow: Date.now(),
    ...result,
  });
}
