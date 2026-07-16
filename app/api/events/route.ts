import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { EVENT_CHIP_COLORS } from "@/lib/event-colors";
import { getUsFederalHolidaysAround } from "@/lib/us-holidays";

/** Empty string is not a valid MySQL DATETIME/TIMESTAMP under strict mode; use NULL for optional end times. */
function optionalDatetimeForDb(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function normalizeColor(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(t)) return null;
  return t.toLowerCase();
}

let colorColumnReady: Promise<void> | null = null;

async function ensureColorColumn() {
  if (!colorColumnReady) {
    colorColumnReady = (async () => {
      try {
        await query(
          "ALTER TABLE upcoming_events ADD COLUMN color VARCHAR(16) NULL AFTER location"
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!/Duplicate column name/i.test(msg)) throw err;
      }
    })();
  }
  await colorColumnReady;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await ensureColorColumn();
    const { searchParams } = new URL(req.url);
    const includeHolidays = searchParams.get("holidays") !== "0";
    const yearParam = searchParams.get("year");
    const year = yearParam ? Number(yearParam) : new Date().getFullYear();

    const [rows] = (await query(
      "SELECT id, title, description, start_at, end_at, is_all_day, location, color, status, widget_heading, created_at, updated_at FROM upcoming_events WHERE status = 'published' ORDER BY start_at ASC"
    )) as any;

    let widgetHeading = "Upcoming Events";
    const rowsArray = rows as any[];
    if (rowsArray?.length > 0 && rowsArray[0]?.widget_heading) {
      widgetHeading = rowsArray[0].widget_heading;
    }

    const holidays = includeHolidays
      ? getUsFederalHolidaysAround(Number.isFinite(year) ? year : new Date().getFullYear())
      : [];

    return NextResponse.json({
      success: true,
      events: rowsArray || [],
      holidays,
      widgetHeading,
      palette: EVENT_CHIP_COLORS,
    });
  } catch (error) {
    console.error("/api/events GET error", error);
    return NextResponse.json({ success: false, error: "Failed to fetch events" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await ensureColorColumn();
    const body = await req.json();
    const {
      title,
      description = null,
      start_at,
      end_at = null,
      is_all_day = false,
      location = null,
      status = "published",
      widget_heading,
      color = null,
    } = body;

    if (!title || !start_at) {
      return NextResponse.json({ success: false, error: "title and start_at are required" }, { status: 400 });
    }

    let headingToUse = widget_heading;
    if (!headingToUse) {
      const [headingResult] = (await query(
        "SELECT widget_heading FROM upcoming_events WHERE status = 'published' LIMIT 1"
      )) as any;
      const headingArray = headingResult as any[];
      headingToUse =
        headingArray && headingArray.length > 0
          ? headingArray[0].widget_heading
          : "Upcoming Events";
    }

    const endAtDb = optionalDatetimeForDb(end_at);
    const colorDb = normalizeColor(color);

    const [result]: any = await query(
      "INSERT INTO upcoming_events (title, description, start_at, end_at, is_all_day, location, color, status, widget_heading) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [title, description, start_at, endAtDb, is_all_day ? 1 : 0, location, colorDb, status, headingToUse]
    );

    const [inserted] = (await query(
      "SELECT id, title, description, start_at, end_at, is_all_day, location, color, status, widget_heading, created_at, updated_at FROM upcoming_events WHERE id = ?",
      [result.insertId]
    )) as any;

    return NextResponse.json({ success: true, event: inserted[0] });
  } catch (error) {
    console.error("/api/events POST error", error);
    return NextResponse.json({ success: false, error: "Failed to create event" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ success: false, error: "id is required" }, { status: 400 });
    }

    await query("DELETE FROM upcoming_events WHERE id = ?", [id]);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("/api/events DELETE error", error);
    return NextResponse.json({ success: false, error: "Failed to delete event" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    await ensureColorColumn();
    const body = await req.json();
    const { widget_heading, id, title, description, start_at, end_at, is_all_day, location, color, status } =
      body;

    // Per-event update
    if (id != null) {
      if (!title || !start_at) {
        return NextResponse.json(
          { success: false, error: "title and start_at are required" },
          { status: 400 }
        );
      }
      await query(
        `UPDATE upcoming_events SET
          title = ?, description = ?, start_at = ?, end_at = ?,
          is_all_day = ?, location = ?, color = ?, status = ?
         WHERE id = ?`,
        [
          title,
          description ?? null,
          start_at,
          optionalDatetimeForDb(end_at),
          is_all_day ? 1 : 0,
          location ?? null,
          normalizeColor(color),
          status || "published",
          id,
        ]
      );
      const [rows] = (await query(
        "SELECT id, title, description, start_at, end_at, is_all_day, location, color, status, widget_heading, created_at, updated_at FROM upcoming_events WHERE id = ?",
        [id]
      )) as any;
      return NextResponse.json({ success: true, event: rows?.[0] });
    }

    if (!widget_heading) {
      return NextResponse.json({ success: false, error: "widget_heading is required" }, { status: 400 });
    }

    const allowedHeadings = ["Upcoming Events", "Announcements"];
    if (!allowedHeadings.includes(widget_heading)) {
      return NextResponse.json(
        { success: false, error: "Invalid heading. Allowed: Upcoming Events, Announcements" },
        { status: 400 }
      );
    }

    await query("UPDATE upcoming_events SET widget_heading = ? WHERE status = 'published'", [
      widget_heading,
    ]);
    return NextResponse.json({ success: true, widgetHeading: widget_heading });
  } catch (error) {
    console.error("/api/events PUT error", error);
    return NextResponse.json({ success: false, error: "Failed to update" }, { status: 500 });
  }
}
