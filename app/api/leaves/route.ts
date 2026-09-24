import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../lib/db";
import { broadcastWsEvent } from "@/lib/ws-broadcast";
import {
  canApproveStep1,
  canApproveStep2,
  leaveStatusLabel,
  normStep,
  overallLeaveStatus,
} from "@/lib/leave-approval";
import {
  resolveViewerDataScope,
  rowInViewerScope,
} from "@/lib/access-control/data-scope";
import { isCeoOrgRole, isManagerOrgRole } from "@/lib/org-role";

async function assertManagerLeaveApprover(
  actorId: string | null,
  leaveEmployeeId: string | number | null | undefined,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  if (!actorId || !/^\d+$/.test(actorId)) {
    return {
      ok: false,
      error: "Only a Manager (Add Employee role) can approve leave — actor required",
      status: 403,
    };
  }

  const [roleRows] = (await query(
    `SELECT role FROM hrm_employees WHERE id = ? LIMIT 1`,
    [Number(actorId)],
  )) as any;
  const actorRole = Array.isArray(roleRows) ? roleRows[0]?.role : null;

  // Leave approval is Manager scope only (CEO may also approve — all departments)
  if (!isManagerOrgRole(actorRole) && !isCeoOrgRole(actorRole)) {
    return {
      ok: false,
      error: "Leave approval is limited to Managers (and CEO). Team Lead / Officer cannot approve.",
      status: 403,
    };
  }

  if (isCeoOrgRole(actorRole)) {
    return { ok: true };
  }

  const scope = await resolveViewerDataScope(actorId);
  if (
    !rowInViewerScope(scope, {
      employeeId: leaveEmployeeId,
    })
  ) {
    return {
      ok: false,
      error: "You can only approve leave for employees in your department scope",
      status: 403,
    };
  }
  return { ok: true };
}

async function isTwoStepEnabled(): Promise<boolean> {
  try {
    const [rows] = (await query(
      `SELECT is_enabled FROM hrm_global_features WHERE feature_key = ? LIMIT 1`,
      ["two_step_leave"],
    )) as any;
    const list = Array.isArray(rows) ? rows : [];
    if (!list.length) return true; // default on when feature row missing
    const v = list[0]?.is_enabled;
    return v === 1 || v === true || v === "1";
  } catch {
    return true;
  }
}

// POST: Submit a new leave request
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      employee_id,
      employee_name,
      leave_category,
      start_date,
      end_date,
      total_days,
      reason,
      document_paths,
    } = body;
    if (!employee_id || !leave_category || !start_date || !end_date || !total_days) {
      return NextResponse.json({ success: false, error: "Missing required fields" });
    }
    try {
      await query(
        `INSERT INTO employee_leaves
          (employee_id, employee_name, leave_category, start_date, end_date, total_days, reason, status,
           step1_status, step2_status, document_paths, requested_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 'pending', 'pending', ?, NOW(), NOW())`,
        [
          employee_id,
          employee_name || "",
          leave_category,
          start_date,
          end_date,
          total_days,
          reason || "",
          JSON.stringify(document_paths || []),
        ],
      );
    } catch {
      // Fallback if migration columns not applied yet
      await query(
        `INSERT INTO employee_leaves
          (employee_id, employee_name, leave_category, start_date, end_date, total_days, reason, status,
           document_paths, requested_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, NOW(), NOW())`,
        [
          employee_id,
          employee_name || "",
          leave_category,
          start_date,
          end_date,
          total_days,
          reason || "",
          JSON.stringify(document_paths || []),
        ],
      );
    }
    broadcastWsEvent({ type: "leave_update" });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// GET: Fetch leave requests
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const employeesParam = searchParams.get("employees");
    const fromDate = searchParams.get("fromDate");
    const toDate = searchParams.get("toDate");
    const status = searchParams.get("status");

    let sql = "SELECT * FROM employee_leaves WHERE 1=1";
    const params: any[] = [];

    if (status) {
      sql += " AND status = ?";
      params.push(status);
    }

    if (employeesParam) {
      const employees = employeesParam
        .split(",")
        .map((e) => e.trim())
        .filter(Boolean);
      if (employees.length > 0) {
        sql += ` AND employee_id IN (${employees.map(() => "?").join(",")})`;
        params.push(...employees);
      }
    }

    if (fromDate && toDate) {
      sql += " AND start_date <= ? AND end_date >= ?";
      params.push(toDate, fromDate);
    } else if (fromDate) {
      sql += " AND end_date >= ?";
      params.push(fromDate);
    } else if (toDate) {
      sql += " AND start_date <= ?";
      params.push(toDate);
    }

    sql += " ORDER BY requested_at DESC";
    const [rows] = (await query(sql, params)) as any;
    const leaves = (Array.isArray(rows) ? rows : []).map((l: any) => ({
      ...l,
      step1_status: normStep(l.step1_status ?? (l.status === "approved" ? "approved" : "pending")),
      step2_status: normStep(l.step2_status ?? (l.status === "approved" ? "approved" : "pending")),
      status_label: leaveStatusLabel(l),
      overall_status: overallLeaveStatus(l),
    }));
    return NextResponse.json({ success: true, leaves });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * PATCH: Two-step approve / reject
 * body: { id, action: 'approve_step1' | 'approve_step2' | 'approve' | 'reject', admin_remark?, actor? }
 * - approve_step1: 1st step only (status stays pending)
 * - approve_step2: 2nd step → status=approved (monthly attendance deduction 0%)
 * - approve: legacy single-step OR smart next step when two_step on
 * - reject: reject at any pending stage
 */
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, admin_remark, actor } = body;
    let action = String(body.action || "").toLowerCase();
    const legacyStatus = body.status ? String(body.status).toLowerCase() : "";

    if (!id) {
      return NextResponse.json({ success: false, error: "Invalid data" });
    }

    if (!action && legacyStatus === "rejected") action = "reject";
    if (!action && legacyStatus === "approved") action = "approve";

    if (!["approve_step1", "approve_step2", "approve", "reject"].includes(action)) {
      return NextResponse.json({ success: false, error: "Invalid data" });
    }

    const [rows] = (await query(`SELECT * FROM employee_leaves WHERE id = ? LIMIT 1`, [id])) as any;
    const leave = Array.isArray(rows) ? rows[0] : null;
    if (!leave) {
      return NextResponse.json({ success: false, error: "Leave not found" }, { status: 404 });
    }

    const twoStep = await isTwoStepEnabled();
    const actorId = actor != null ? String(actor) : null;

    if (action === "reject" || action.startsWith("approve")) {
      const gate = await assertManagerLeaveApprover(actorId, leave.employee_id);
      if (!gate.ok) {
        return NextResponse.json(
          { success: false, error: gate.error },
          { status: gate.status },
        );
      }
    }

    if (action === "reject") {
      const s1 = normStep(leave.step1_status);
      const nextStep1 = s1 === "approved" ? "approved" : "rejected";
      try {
        await query(
          `UPDATE employee_leaves SET status = 'rejected', step1_status = ?, step2_status = 'rejected',
            admin_remark = ?, updated_at = NOW() WHERE id = ?`,
          [nextStep1, admin_remark || "", id],
        );
      } catch {
        await query(
          `UPDATE employee_leaves SET status = 'rejected', admin_remark = ?, updated_at = NOW() WHERE id = ?`,
          [admin_remark || "", id],
        );
      }
      broadcastWsEvent({ type: "leave_update" });
      return NextResponse.json({ success: true, status: "rejected" });
    }

    // Resolve smart "approve" to the next required step
    if (action === "approve") {
      if (!twoStep) {
        await query(
          `UPDATE employee_leaves SET status = 'approved',
            step1_status = 'approved', step2_status = 'approved',
            step1_by = COALESCE(step1_by, ?), step2_by = COALESCE(step2_by, ?),
            step1_at = COALESCE(step1_at, NOW()), step2_at = COALESCE(step2_at, NOW()),
            updated_at = NOW() WHERE id = ?`,
          [actorId, actorId, id],
        );
        broadcastWsEvent({ type: "leave_update" });
        return NextResponse.json({ success: true, status: "approved" });
      }
      if (canApproveStep1(leave)) action = "approve_step1";
      else if (canApproveStep2(leave)) action = "approve_step2";
      else {
        return NextResponse.json({
          success: false,
          error: "Leave is not awaiting approval",
        });
      }
    }

    if (action === "approve_step1") {
      if (!canApproveStep1(leave) && twoStep) {
        return NextResponse.json({ success: false, error: "1st step already done or not pending" });
      }
      if (!twoStep) {
        await query(
          `UPDATE employee_leaves SET status = 'approved',
            step1_status = 'approved', step2_status = 'approved',
            step1_by = ?, step2_by = ?, step1_at = NOW(), step2_at = NOW(),
            updated_at = NOW() WHERE id = ?`,
          [actorId, actorId, id],
        );
        broadcastWsEvent({ type: "leave_update" });
        return NextResponse.json({ success: true, status: "approved", step: 1 });
      }
      await query(
        `UPDATE employee_leaves SET step1_status = 'approved', step1_by = ?, step1_at = NOW(),
          status = 'pending', updated_at = NOW() WHERE id = ?`,
        [actorId, id],
      );
      broadcastWsEvent({ type: "leave_update" });
      return NextResponse.json({
        success: true,
        status: "pending",
        step: 1,
        status_label: "pending — 2nd step",
      });
    }

    if (action === "approve_step2") {
      if (twoStep && !canApproveStep2(leave)) {
        return NextResponse.json({
          success: false,
          error: "2nd step requires 1st step approval first",
        });
      }
      await query(
        `UPDATE employee_leaves SET step1_status = 'approved', step2_status = 'approved',
          step2_by = ?, step2_at = NOW(),
          status = 'approved', updated_at = NOW() WHERE id = ?`,
        [actorId, id],
      );
      broadcastWsEvent({ type: "leave_update" });
      return NextResponse.json({
        success: true,
        status: "approved",
        step: 2,
        status_label: "approved",
      });
    }

    return NextResponse.json({ success: false, error: "Invalid data" });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
