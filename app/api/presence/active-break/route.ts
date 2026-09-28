import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Guard agent: is employee on an open break / prayer / meeting?
 * GET ?employeeId=
 */
export async function GET(req: NextRequest) {
  try {
    const employeeId = String(
      new URL(req.url).searchParams.get("employeeId") || "",
    ).trim();
    if (!employeeId) {
      return NextResponse.json(
        { success: false, error: "employeeId required" },
        { status: 400 },
      );
    }

    let active = false;
    let kind: string | null = null;

    try {
      const [breaks] = await pool.query(
        `SELECT id FROM breaks
         WHERE employee_id = ? AND break_end IS NULL
         ORDER BY break_start DESC LIMIT 1`,
        [employeeId],
      );
      if (Array.isArray(breaks) && breaks.length > 0) {
        active = true;
        kind = "break";
      }
    } catch {
      /* table may differ on mongo adapter */
    }

    if (!active) {
      try {
        const [prayers] = await pool.query(
          `SELECT id FROM prayer_breaks
           WHERE employee_id = ? AND prayer_break_end IS NULL
           ORDER BY prayer_break_start DESC LIMIT 1`,
          [employeeId],
        );
        if (Array.isArray(prayers) && prayers.length > 0) {
          active = true;
          kind = "prayer";
        }
      } catch {
        /* optional */
      }
    }

    if (!active) {
      try {
        const [meetings] = await pool.query(
          `SELECT id FROM meeting_breaks
           WHERE employee_id = ? AND meeting_end IS NULL
           ORDER BY meeting_start DESC LIMIT 1`,
          [employeeId],
        );
        if (Array.isArray(meetings) && meetings.length > 0) {
          active = true;
          kind = "meeting";
        }
      } catch {
        /* optional */
      }
    }

    return NextResponse.json({ success: true, active, kind });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Check failed",
      },
      { status: 500 },
    );
  }
}
