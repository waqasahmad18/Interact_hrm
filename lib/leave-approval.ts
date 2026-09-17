/** Two-step leave approval helpers. Final `status=approved` zeros monthly attendance deduction. */

export type LeaveStepStatus = "pending" | "approved" | "rejected";

export type LeaveApprovalRow = {
  status?: string | null;
  step1_status?: string | null;
  step2_status?: string | null;
  step1_by?: string | null;
  step2_by?: string | null;
  step1_at?: string | null;
  step2_at?: string | null;
};

export function normStep(v: unknown): LeaveStepStatus {
  const s = String(v || "pending").toLowerCase();
  if (s === "approved") return "approved";
  if (s === "rejected") return "rejected";
  return "pending";
}

export function overallLeaveStatus(row: LeaveApprovalRow): string {
  const overall = String(row.status || "pending").toLowerCase();
  if (overall === "rejected" || overall === "approved") return overall;
  const s1 = normStep(row.step1_status);
  const s2 = normStep(row.step2_status);
  if (s1 === "rejected" || s2 === "rejected") return "rejected";
  if (s1 === "approved" && s2 === "approved") return "approved";
  return "pending";
}

export function leaveStatusLabel(row: LeaveApprovalRow): string {
  const overall = overallLeaveStatus(row);
  if (overall === "approved") return "approved";
  if (overall === "rejected") return "rejected";
  const s1 = normStep(row.step1_status);
  const s2 = normStep(row.step2_status);
  if (s1 === "pending") return "pending — 1st step";
  if (s1 === "approved" && s2 === "pending") return "pending — 2nd step";
  return "pending";
}

export function canApproveStep1(row: LeaveApprovalRow): boolean {
  if (overallLeaveStatus(row) !== "pending") return false;
  return normStep(row.step1_status) === "pending";
}

export function canApproveStep2(row: LeaveApprovalRow): boolean {
  if (overallLeaveStatus(row) !== "pending") return false;
  return normStep(row.step1_status) === "approved" && normStep(row.step2_status) === "pending";
}
