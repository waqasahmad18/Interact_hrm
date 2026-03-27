import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    let rows: any;
    try {
      rows = await query(
        "SELECT id, message, is_active, display_order, created_at, updated_at FROM reminders WHERE is_active = 1 AND TRIM(COALESCE(message, '')) <> '' ORDER BY display_order ASC, id ASC"
      );
    } catch (innerError: any) {
      // Backward compatibility for older reminders table schema.
      if (innerError?.code !== "ER_BAD_FIELD_ERROR") throw innerError;
      rows = await query(
        "SELECT id, message, 1 AS is_active, id AS display_order, created_at, updated_at FROM reminders WHERE TRIM(COALESCE(message, '')) <> '' ORDER BY id ASC"
      );
    }
    return NextResponse.json({ success: true, reminders: rows });
  } catch (error) {
    console.error("/api/reminders GET error", error);
    return NextResponse.json({ success: false, error: "Failed to fetch reminders" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { message, is_active = 1, display_order = 1 } = body;
    const normalizedMessage = String(message ?? "").trim();

    if (!normalizedMessage) {
      return NextResponse.json({ success: false, error: "message is required" }, { status: 400 });
    }

    let result: any;
    try {
      result = await query(
        "INSERT INTO reminders (message, is_active, display_order) VALUES (?, ?, ?)",
        [normalizedMessage, is_active ? 1 : 0, Number(display_order) || 1]
      );
    } catch (innerError: any) {
      // Backward compatibility for older reminders table schema.
      if (innerError?.code !== "ER_BAD_FIELD_ERROR") throw innerError;
      result = await query("INSERT INTO reminders (message) VALUES (?)", [normalizedMessage]);
    }

    const inserted = (await query(
      "SELECT id, message, is_active, display_order, created_at, updated_at FROM reminders WHERE id = ?",
      [result.insertId]
    )) as any[];

    return NextResponse.json({ success: true, reminder: inserted[0] });
  } catch (error) {
    console.error("/api/reminders POST error", error);
    return NextResponse.json({ success: false, error: "Failed to create reminder" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { id, message, is_active, display_order } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: "id is required" }, { status: 400 });
    }

    const updates: string[] = [];
    const values: any[] = [];

    if (message !== undefined) {
      const normalizedMessage = String(message ?? "").trim();
      if (!normalizedMessage) {
        return NextResponse.json({ success: false, error: "message cannot be empty" }, { status: 400 });
      }
      updates.push("message = ?");
      values.push(normalizedMessage);
    }
    if (is_active !== undefined) {
      updates.push("is_active = ?");
      values.push(is_active ? 1 : 0);
    }
    if (display_order !== undefined) {
      updates.push("display_order = ?");
      values.push(display_order);
    }

    if (updates.length === 0) {
      return NextResponse.json({ success: false, error: "No fields to update" }, { status: 400 });
    }

    values.push(id);
    await query(`UPDATE reminders SET ${updates.join(", ")} WHERE id = ?`, values);

    const updated = (await query(
      "SELECT id, message, is_active, display_order, created_at, updated_at FROM reminders WHERE id = ?",
      [id]
    )) as any[];

    return NextResponse.json({ success: true, reminder: updated[0] });
  } catch (error) {
    console.error("/api/reminders PUT error", error);
    return NextResponse.json({ success: false, error: "Failed to update reminder" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = Number(searchParams.get("id"));

    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ success: false, error: "id is required" }, { status: 400 });
    }

    const result: any = await query("DELETE FROM reminders WHERE id = ?", [id]);
    if (!result?.affectedRows) {
      return NextResponse.json({ success: false, error: "Reminder not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("/api/reminders DELETE error", error);
    return NextResponse.json({ success: false, error: "Failed to delete reminder" }, { status: 500 });
  }
}
