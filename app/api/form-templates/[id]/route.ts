import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { pool } from "@/lib/db";
import { parseJsonField } from "@/lib/employee-documents";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT t.*, d.name AS department_name
       FROM hrm_form_templates t
       LEFT JOIN departments d ON d.id = t.department_id
       WHERE t.id = ? LIMIT 1`,
      [Number(id)]
    );
    if (!rows[0]) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({
      success: true,
      template: { ...rows[0], form_schema: parseJsonField(rows[0].form_schema) },
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const templateId = Number(id);

    if (body.is_active != null) {
      await pool.execute(`UPDATE hrm_form_templates SET is_active = ? WHERE id = ?`, [
        body.is_active ? 1 : 0,
        templateId,
      ]);
    }

    const sets: string[] = [];
    const params: (string | number)[] = [];

    if (body.title != null) {
      const title = String(body.title).trim();
      if (!title) {
        return NextResponse.json({ success: false, error: "Title required" }, { status: 400 });
      }
      sets.push("title = ?");
      params.push(title);
    }
    if (body.description != null) {
      sets.push("description = ?");
      params.push(body.description ? String(body.description) : "");
    }
    if (body.category != null) {
      sets.push("category = ?");
      params.push(String(body.category));
    }
    if (body.form_schema != null) {
      sets.push("form_schema = ?");
      params.push(JSON.stringify(body.form_schema));
    }

    if (sets.length) {
      await pool.execute(
        `UPDATE hrm_form_templates SET ${sets.join(", ")} WHERE id = ?`,
        [...params, templateId]
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Update failed" },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const templateId = Number(id);
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id, title FROM hrm_form_templates WHERE id = ? AND is_active = 1 LIMIT 1`,
      [templateId]
    );
    if (!rows[0]) {
      return NextResponse.json({ success: false, error: "Template not found" }, { status: 404 });
    }

    const [pending] = await pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS cnt FROM hrm_form_assignments
       WHERE template_id = ? AND status IN ('pending', 'in_progress', 'draft')`,
      [templateId]
    );
    if (Number(pending[0]?.cnt) > 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Cannot delete — employees still have pending forms for this template. Cancel those first.",
        },
        { status: 400 }
      );
    }

    await pool.execute(`UPDATE hrm_form_templates SET is_active = 0 WHERE id = ?`, [templateId]);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Delete failed" },
      { status: 500 }
    );
  }
}
