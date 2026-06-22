import "server-only";

import { randomUUID } from "crypto";
import type { NextRequest, NextResponse } from "next/server";

export const DEVICE_COOKIE_NAME = "interact_hrm_device";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

function cookieOptions(req: NextRequest) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: req.nextUrl.protocol === "https:",
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
  };
}

export function readDeviceKey(req: NextRequest): string | null {
  const value = req.cookies.get(DEVICE_COOKIE_NAME)?.value?.trim();
  return value || null;
}

export function ensureDeviceKey(req: NextRequest, res: NextResponse): string {
  const existing = readDeviceKey(req);
  if (existing) return existing;

  const deviceKey = randomUUID().replace(/-/g, "");
  res.cookies.set(DEVICE_COOKIE_NAME, deviceKey, cookieOptions(req));
  return deviceKey;
}
