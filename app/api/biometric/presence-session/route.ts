import { NextRequest, NextResponse } from "next/server";
import {
  cancelPresenceSession,
  completePresenceSession,
  createPresenceSession,
  findPendingPresenceForEmployee,
  getPresenceSession,
  signalPresenceStart,
  takePresenceSessionResult,
  type PresenceSessionResult,
} from "@/lib/presence-check-sessions";

export const runtime = "nodejs";

/** Create / complete / start a presence check session. */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      employee_id?: string;
      result?: PresenceSessionResult;
      check_id?: string;
      action?: string;
    };

    // Guard: employee clicked Here → dashboard FaceVerifyModal (Break-style) should open
    if (body.check_id && body.action === "start") {
      const ok = signalPresenceStart(body.check_id);
      if (!ok) {
        return NextResponse.json(
          { success: false, error: "Unknown or expired check_id" },
          { status: 404 },
        );
      }
      return NextResponse.json({ success: true, start: true });
    }

    if (body.check_id && body.action === "cancel") {
      cancelPresenceSession(body.check_id);
      return NextResponse.json({ success: true, cancelled: true });
    }

    if (body.check_id && body.result) {
      const ok = completePresenceSession(body.check_id, body.result);
      if (!ok) {
        return NextResponse.json(
          { success: false, error: "Unknown or expired check_id" },
          { status: 404 },
        );
      }
      return NextResponse.json({ success: true });
    }

    const employeeId = String(body.employee_id || "").trim();
    if (!employeeId) {
      return NextResponse.json(
        { success: false, error: "employee_id required" },
        { status: 400 },
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
      { status: 500 },
    );
  }
}

/** Agent polls by check_id; dashboard polls by employeeId to open Break-style FaceVerify. */
export async function GET(req: NextRequest) {
  const employeeId = (req.nextUrl.searchParams.get("employeeId") || "").trim();
  if (employeeId) {
    const pending = findPendingPresenceForEmployee(employeeId);
    if (!pending) {
      return NextResponse.json({ success: true, pending: false });
    }
    return NextResponse.json({
      success: true,
      pending: true,
      check_id: pending.checkId,
      employee_id: pending.employeeId,
      start: true,
    });
  }

  const checkId = req.nextUrl.searchParams.get("check_id") || "";
  if (!checkId) {
    return NextResponse.json(
      { success: false, error: "check_id or employeeId required" },
      { status: 400 },
    );
  }

  const session = getPresenceSession(checkId);
  if (!session) {
    return NextResponse.json(
      { success: false, pending: false, error: "Unknown or expired check_id" },
      { status: 404 },
    );
  }

  if (!session.result) {
    return NextResponse.json({
      success: true,
      pending: true,
      start: Boolean(session.start),
    });
  }

  const result = takePresenceSessionResult(checkId);
  return NextResponse.json({ success: true, pending: false, result });
}
