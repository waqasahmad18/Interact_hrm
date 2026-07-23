import { NextResponse } from "next/server";
import { cycleLabel, getPendingAppraisals } from "@/lib/appraisal-due";

export async function GET() {
  try {
    const pending = await getPendingAppraisals();
    return NextResponse.json({
      success: true,
      count: pending.length,
      pending: pending.map((p) => ({
        ...p,
        cycle_label: cycleLabel(p.cycle, p.due_after_months),
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Failed to load pending appraisals" },
      { status: 500 }
    );
  }
}
