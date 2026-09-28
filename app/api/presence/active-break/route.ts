import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BreakKind = "break" | "prayer" | "refreshment" | "meeting";

/**
 * Guard agent: is employee on an open break / prayer / refreshment / meeting?
 * Only counts rows that actually started (start IS NOT NULL) and have not ended.
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

    const idNum = Number(employeeId);
    const idParam = Number.isFinite(idNum) && idNum > 0 ? idNum : employeeId;

    let active = false;
    let kind: BreakKind | null = null;

    const tryOpen = async (
      sql: string,
      nextKind: BreakKind,
    ): Promise<boolean> => {
      try {
        const [rows] = await pool.query(sql, [idParam]);
        if (Array.isArray(rows) && rows.length > 0) {
          active = true;
          kind = nextKind;
          return true;
        }
      } catch {
        /* table may be missing on older DBs */
      }
      return false;
    };

    // Must have started AND not ended — orphan rows with NULL start must not count.
    if (
      await tryOpen(
        `SELECT id FROM breaks
         WHERE employee_id = ?
           AND break_start IS NOT NULL
           AND break_end IS NULL
         ORDER BY break_start DESC LIMIT 1`,
        "break",
      )
    ) {
      return NextResponse.json({ success: true, active, kind });
    }

    if (
      await tryOpen(
        `SELECT id FROM prayer_breaks
         WHERE employee_id = ?
           AND prayer_break_start IS NOT NULL
           AND prayer_break_end IS NULL
         ORDER BY prayer_break_start DESC LIMIT 1`,
        "prayer",
      )
    ) {
      return NextResponse.json({ success: true, active, kind });
    }

    if (
      await tryOpen(
        `SELECT id FROM refreshment_breaks
         WHERE employee_id = ?
           AND refreshment_break_start IS NOT NULL
           AND refreshment_break_end IS NULL
         ORDER BY refreshment_break_start DESC LIMIT 1`,
        "refreshment",
      )
    ) {
      return NextResponse.json({ success: true, active, kind });
    }

    await tryOpen(
      `SELECT id FROM meeting_breaks
       WHERE employee_id = ?
         AND meeting_break_start IS NOT NULL
         AND meeting_break_end IS NULL
       ORDER BY meeting_break_start DESC LIMIT 1`,
      "meeting",
    );

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
