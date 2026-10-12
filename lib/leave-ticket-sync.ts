/**
 * Leave tickets (Generate Ticket) must drive `employee_leaves` so Monthly Attendance
 * and other screens show Leave status after HR Manager / TL approve.
 */

import { pool, query } from "@/lib/db";
import {
  EMPLOYEE_TICKETS_TABLE,
  rowToTicket,
  type EmployeeTicketRow,
} from "@/lib/employee-tickets-table";
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
  // form_data dates may be Date objects from Mongo
  const startDate = ymd(
    fd.start_date instanceof Date
      ? fd.start_date.toISOString()
      : fd.start_date
  );
  const endDate =
    ymd(
      fd.end_date instanceof Date ? fd.end_date.toISOString() : fd.end_date
    ) || startDate;
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

  // Avoid SQL COALESCE/NOW() expressions — Mongo adapter stores them as literal strings.
  const nowIso = new Date().toISOString().slice(0, 19).replace("T", " ");

  try {
    if (existingId) {
      try {
        const sets = [
          "employee_name = ?",
          "leave_category = ?",
          "total_days = ?",
          "reason = ?",
          "status = ?",
          "step1_status = ?",
          "step2_status = ?",
          "document_paths = ?",
          "updated_at = ?",
        ];
        const vals: unknown[] = [
          employeeName,
          leaveCategory,
          totalDays,
          reason,
          leaveStatus,
          step1,
          step2,
          JSON.stringify(docs),
          nowIso,
        ];
        if (leaveStatus === "approved") {
          sets.push("step1_at = ?", "step2_at = ?");
          vals.push(nowIso, nowIso);
        }
        vals.push(existingId);
        await query(
          `UPDATE employee_leaves SET ${sets.join(", ")} WHERE id = ?`,
          vals
        );
      } catch {
        await query(
          `UPDATE employee_leaves
           SET employee_name = ?, leave_category = ?, total_days = ?, reason = ?,
               status = ?, document_paths = ?, updated_at = ?
           WHERE id = ?`,
          [
            employeeName,
            leaveCategory,
            totalDays,
            reason,
            leaveStatus,
            JSON.stringify(docs),
            nowIso,
            existingId,
          ]
        );
      }
      broadcastWsEvent({ type: "leave_update" });
      return existingId;
    }

    try {
      const cols = [
        "employee_id",
        "employee_name",
        "leave_category",
        "start_date",
        "end_date",
        "total_days",
        "reason",
        "status",
        "step1_status",
        "step2_status",
        "document_paths",
        "requested_at",
        "updated_at",
      ];
      const vals: unknown[] = [
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
        nowIso,
        nowIso,
      ];
      if (leaveStatus === "approved") {
        cols.push("step1_at", "step2_at");
        vals.push(nowIso, nowIso);
      }
      const [result]: any = await pool.query(
        `INSERT INTO employee_leaves (${cols.join(", ")})
         VALUES (${cols.map(() => "?").join(", ")})`,
        vals
      );
      broadcastWsEvent({ type: "leave_update" });
      return Number(result?.insertId) || null;
    } catch {
      const [result]: any = await pool.query(
        `INSERT INTO employee_leaves
          (employee_id, employee_name, leave_category, start_date, end_date, total_days, reason, status,
           document_paths, requested_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          nowIso,
          nowIso,
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
export async function backfillLeavesFromTickets(
  opts?: { force?: boolean }
): Promise<number> {
  const now = Date.now();
  if (!opts?.force && now - lastBackfillAt < 15_000) return 0;
  lastBackfillAt = now;
  try {
    const [rows] = await query(
      `SELECT * FROM ${EMPLOYEE_TICKETS_TABLE}
       WHERE ticket_type = ?
       ORDER BY id DESC
       LIMIT 300`,
      ["leave"]
    );
    const tickets = Array.isArray(rows) ? rows : [];
    let n = 0;
    for (const raw of tickets) {
      try {
        const ticket = rowToTicket(raw as Record<string, unknown>);
        const id = await syncLeaveRecordFromTicket(ticket);
        if (id) n += 1;
      } catch (err) {
        console.warn("[leave-ticket-sync] row failed", err);
      }
    }
    return n;
  } catch (err) {
    console.warn("[leave-ticket-sync] backfill failed", err);
    return 0;
  }
}
