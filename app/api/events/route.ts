import { NextResponse } from "next/server";
import { query } from "@/lib/db";

// Force Node runtime (mysql2 is not supported on the Edge runtime)
export const runtime = "nodejs";
// Always serve fresh data
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await query(
      "SELECT id, title, description, start_at, end_at, is_all_day, location, status, created_at, updated_at FROM upcoming_events WHERE status = 'published' ORDER BY start_at ASC"
    );
    return NextResponse.json({ success: true, events: rows });
  } catch (error) {
    console.error("/api/events GET error", error);
    return NextResponse.json({ success: false, error: "Failed to fetch events" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      title,
      description = null,
      start_at,
      end_at = null,
      is_all_day = false,
      location = null,
      status = "published"
    } = body;

    if (!title || !start_at) {
      return NextResponse.json({ success: false, error: "title and start_at are required" }, { status: 400 });
    }

    const result: any = await query(
      "INSERT INTO upcoming_events (title, description, start_at, end_at, is_all_day, location, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [title, description, start_at, end_at, is_all_day ? 1 : 0, location, status]
    );

    const inserted = (await query(
      "SELECT id, title, description, start_at, end_at, is_all_day, location, status, created_at, updated_at FROM upcoming_events WHERE id = ?",
      [result.insertId]
    )) as any[]; // mysql2 returns RowDataPacket[] for SELECT queries

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
