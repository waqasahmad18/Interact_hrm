import { NextRequest, NextResponse } from "next/server";
import {
  completePresenceSession,
  createPresenceSession,
  getPresenceSession,
  takePresenceSessionResult,
  type PresenceSessionResult,
} from "@/lib/presence-check-sessions";

export const runtime = "nodejs";

/** Create a pending check the desktop agent will poll. */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      employee_id?: string;
      result?: PresenceSessionResult;
      check_id?: string;
    };

    // Complete an existing session (called from presence-silent in Chrome)
    if (body.check_id && body.result) {
      const ok = completePresenceSession(body.check_id, body.result);
      if (!ok) {
        return NextResponse.json(
          { success: false, error: "Unknown or expired check_id" },
          { status: 404 }
        );
      }
      return NextResponse.json({ success: true });
    }

    const employeeId = String(body.employee_id || "").trim();
    if (!employeeId) {
      return NextResponse.json(
        { success: false, error: "employee_id required" },
        { status: 400 }
      );
    }
    const checkId = createPresenceSession(employeeId);
    return NextResponse.json({ success: true, check_id: checkId });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Session error",
      },
      { status: 500 }
    );
  }
}

/** Agent polls until result is ready. */
export async function GET(req: NextRequest) {
  const checkId = req.nextUrl.searchParams.get("check_id") || "";
  if (!checkId) {
    return NextResponse.json(
      { success: false, error: "check_id required" },
      { status: 400 }
    );
  }

  const session = getPresenceSession(checkId);
  if (!session) {
    return NextResponse.json(
      { success: false, pending: false, error: "Unknown or expired check_id" },
      { status: 404 }
    );
  }

  if (!session.result) {
    return NextResponse.json({ success: true, pending: true });
  }

  const result = takePresenceSessionResult(checkId);
  return NextResponse.json({ success: true, pending: false, result });
}
