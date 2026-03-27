import { NextResponse } from "next/server";
import { query } from "@/lib/db";

// GET: Fetch all company policies
export async function GET() {
  try {
    const rows = await query("SELECT * FROM company_policies WHERE status = 'active' ORDER BY display_order ASC, id ASC");
    return NextResponse.json({ success: true, policies: rows });
  } catch (error) {
    console.error("/api/company-policies GET error", error);
    return NextResponse.json({ success: false, policies: [], error: "Failed to fetch company policies" }, { status: 500 });
  }
}

// POST: Add new company policy
export async function POST(req: Request) {
  try {
    const { heading, description } = await req.json();
    const normalizedHeading = String(heading ?? "").trim();
    const normalizedDescription = String(description ?? "").trim();
    if (!normalizedHeading) {
      return NextResponse.json({ success: false, error: "heading is required" }, { status: 400 });
    }
    await query(
      "INSERT INTO company_policies (heading, description, display_order, status) VALUES (?, ?, 1, 'active')",
      [normalizedHeading, normalizedDescription]
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("/api/company-policies POST error", error);
    return NextResponse.json({ success: false, error: "Failed to create company policy" }, { status: 500 });
  }
}

// PUT: Update company policy
export async function PUT(req: Request) {
  try {
    const { id, heading, description } = await req.json();
    const policyId = Number(id);
    const normalizedHeading = String(heading ?? "").trim();
    const normalizedDescription = String(description ?? "").trim();
    if (!Number.isInteger(policyId) || policyId <= 0) {
      return NextResponse.json({ success: false, error: "id is required" }, { status: 400 });
    }
    if (!normalizedHeading) {
      return NextResponse.json({ success: false, error: "heading is required" }, { status: 400 });
    }
    const result: any = await query(
      "UPDATE company_policies SET heading = ?, description = ? WHERE id = ?",
      [normalizedHeading, normalizedDescription, policyId]
    );
    if (!result?.affectedRows) {
      return NextResponse.json({ success: false, error: "Company policy not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("/api/company-policies PUT error", error);
    return NextResponse.json({ success: false, error: "Failed to update company policy" }, { status: 500 });
  }
}

// DELETE: Delete company policy
export async function DELETE(req: Request) {
  try {
    const { id } = await req.json();
    const policyId = Number(id);
    if (!Number.isInteger(policyId) || policyId <= 0) {
      return NextResponse.json({ success: false, error: "id is required" }, { status: 400 });
    }
    const result: any = await query("DELETE FROM company_policies WHERE id = ?", [policyId]);
    if (!result?.affectedRows) {
      return NextResponse.json({ success: false, error: "Company policy not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("/api/company-policies DELETE error", error);
    return NextResponse.json({ success: false, error: "Failed to delete company policy" }, { status: 500 });
  }
}
