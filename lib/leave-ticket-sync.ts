/**
 * Leave tickets (Generate Ticket) must drive `employee_leaves` so Monthly Attendance
 * and other screens show Leave status after HR Manager / TL approve.
 */

import { pool, query } from "@/lib/db";
import type { EmployeeTicketRow } from "@/lib/employee-tickets-table";
import { broadcastWsEvent } from "@/lib/ws-broadcast";

function ticketForm(ticket: EmployeeTicketRow): Record<string, unknown> {
  const fd = ticket.form_data;
  return fd && typeof fd === "object" ? (fd as Record<string, unknown>) : {};
}

function ymd(v: unknown): string {
  const s = String(v || "").trim();
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  return m ? m[1] : "";
}

function leaveStatusFromTicket(status: string): "pending" | "approved" | "rejected" {
  const s = String(status || "").toLowerCase();
  if (s === "resolved" || s === "closed") return "approved";
  if (s === "rejected") return "rejected";
  return "pending";
}

async function findLeaveIdForTicket(
  employeeId: string,
  startDate: string,
  endDate: string,
  ticketId: number
): Promise<number | null> {
  try {
    const [rows] = await query(
      `SELECT id, reason FROM employee_leaves
       WHERE employee_id = ? AND start_date = ? AND end_date = ?
       ORDER BY id DESC LIMIT 20`,
      [employeeId, startDate, endDate]
    );
    const list = Array.isArray(rows) ? rows : [];
    const marker = `[ticket:${ticketId}]`;
    for (const r of list as { id: number; reason?: string }[]) {
      if (String(r.reason || "").includes(marker)) return Number(r.id);
    }
    if (list.length === 1) return Number((list[0] as { id: number }).id);
    return null;
  } catch {
    return null;
  }
}

/**
 * Create or update employee_leaves from a leave ticket.
 * Returns leave row id when known.
 */
export async function syncLeaveRecordFromTicket(
  ticket: EmployeeTicketRow
): Promise<number | null> {
  if (String(ticket.ticket_type || "") !== "leave") return null;

  const fd = ticketForm(ticket);
  const employeeId = String(ticket.employee_id || "").trim();
  const startDate = ymd(fd.start_date);
  const endDate = ymd(fd.end_date) || startDate;
  if (!employeeId || !startDate) return null;

  const leaveCategory = String(fd.leave_category || "annual").trim() || "annual";
  const totalDays = Math.max(1, Number(fd.total_days) || 1);
  const reasonBody = String(fd.reason || ticket.description || "").trim();
  const marker = `[ticket:${ticket.id}]`;
  const reason = reasonBody.includes(marker)
    ? reasonBody
    : `${reasonBody}${reasonBody ? " " : ""}${marker}`.trim();
  const docs = Array.isArray(fd.document_paths) ? fd.document_paths : [];
  const leaveStatus = leaveStatusFromTicket(ticket.status);
  const employeeName = String(ticket.employee_name || "").trim();

  const existingId = await findLeaveIdForTicket(
    employeeId,
    startDate,
    endDate,
    Number(ticket.id)
  );

  const step1 = leaveStatus === "rejected" ? "rejected" : leaveStatus;
  const step2 = leaveStatus === "approved" ? "approved" : leaveStatus === "rejected" ? "rejected" : "pending";

  try {
    if (existingId) {
      try {
        await query(
          `UPDATE employee_leaves
           SET employee_name = ?, leave_category = ?, total_days = ?, reason = ?,
               status = ?, step1_status = ?, step2_status = ?,
               document_paths = ?, updated_at = NOW()
               ${leaveStatus === "approved" ? ", step1_at = COALESCE(step1_at, NOW()), step2_at = COALESCE(step2_at, NOW())" : ""}
           WHERE id = ?`,
          [
            employeeName,
            leaveCategory,
            totalDays,
            reason,
            leaveStatus,
            step1,
            step2,
            JSON.stringify(docs),
            existingId,
          ]
        );
      } catch {
        await query(
          `UPDATE employee_leaves
           SET employee_name = ?, leave_category = ?, total_days = ?, reason = ?,
               status = ?, document_paths = ?, updated_at = NOW()
           WHERE id = ?`,
          [
            employeeName,
            leaveCategory,
            totalDays,
            reason,
            leaveStatus,
            JSON.stringify(docs),
            existingId,
          ]
        );
      }
      broadcastWsEvent({ type: "leave_update" });
      return existingId;
    }

    try {
      const [result]: any = await pool.query(
        `INSERT INTO employee_leaves
          (employee_id, employee_name, leave_category, start_date, end_date, total_days, reason, status,
           step1_status, step2_status, document_paths, requested_at, updated_at
           ${leaveStatus === "approved" ? ", step1_at, step2_at" : ""})
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW()
           ${leaveStatus === "approved" ? ", NOW(), NOW()" : ""})`,
        [
          employeeId,
          employeeName,
          leaveCategory,
          startDate,
          endDate,
          totalDays,
          reason,
          leaveStatus,
          step1,
          step2,
          JSON.stringify(docs),
        ]
      );
      broadcastWsEvent({ type: "leave_update" });
      return Number(result?.insertId) || null;
    } catch {
      const [result]: any = await pool.query(
        `INSERT INTO employee_leaves
          (employee_id, employee_name, leave_category, start_date, end_date, total_days, reason, status,
           document_paths, requested_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          employeeId,
          employeeName,
          leaveCategory,
          startDate,
          endDate,
          totalDays,
          reason,
          leaveStatus,
          JSON.stringify(docs),
        ]
      );
      broadcastWsEvent({ type: "leave_update" });
      return Number(result?.insertId) || null;
    }
  } catch (err) {
    console.warn("[leave-ticket-sync] failed", err);
    return null;
  }
}

let lastBackfillAt = 0;

/**
 * Backfill: any resolved/rejected leave tickets missing from employee_leaves.
 * Throttled — safe to call from GET /api/leaves.
 */
export async function backfillLeavesFromTickets(): Promise<number> {
  const now = Date.now();
  if (now - lastBackfillAt < 15_000) return 0;
  lastBackfillAt = now;
  try {
    const [rows] = await query(
      `SELECT * FROM employee_tickets
       WHERE ticket_type = 'leave'
         AND status IN ('resolved', 'rejected', 'closed', 'pending', 'in_progress')
       ORDER BY id DESC
       LIMIT 300`
    );
    const tickets = Array.isArray(rows) ? rows : [];
    let n = 0;
    for (const raw of tickets) {
      const t = raw as Record<string, unknown>;
      // Minimal row shape for sync
      let form_data: Record<string, unknown> | null = null;
      const fdRaw = t.form_data;
      if (typeof fdRaw === "string") {
        try {
          form_data = JSON.parse(fdRaw);
        } catch {
          form_data = null;
        }
      } else if (fdRaw && typeof fdRaw === "object") {
        form_data = fdRaw as Record<string, unknown>;
      }
      const ticket = {
        id: Number(t.id),
        ticket_number: String(t.ticket_number || ""),
        employee_id: String(t.employee_id || ""),
        employee_name: String(t.employee_name || ""),
        category: String(t.category || "HR"),
        ticket_type: "leave",
        is_custom: 0,
        subject: t.subject != null ? String(t.subject) : null,
        description: t.description != null ? String(t.description) : null,
        form_data,
        priority: String(t.priority || "normal"),
        status: String(t.status || "pending"),
        admin_remark: null,
        messages: [],
        requested_at: String(t.requested_at || ""),
        updated_at: String(t.updated_at || ""),
        resolved_at: t.resolved_at != null ? String(t.resolved_at) : null,
      } as EmployeeTicketRow;

      const id = await syncLeaveRecordFromTicket(ticket);
      if (id) n += 1;
    }
    return n;
  } catch (err) {
    console.warn("[leave-ticket-sync] backfill failed", err);
    return 0;
  }
}
