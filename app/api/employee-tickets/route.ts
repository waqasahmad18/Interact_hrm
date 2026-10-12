import { NextRequest, NextResponse } from "next/server";
import { broadcastWsEvent } from "@/lib/ws-broadcast";
import { pool, query } from "@/lib/db";
import {
  EMPLOYEE_TICKETS_TABLE,
  buildTicketNumber,
  broadcastTicketUpdate,
  ensureEmployeeTicketsTable,
  rowToTicket,
  type EmployeeTicketRow,
  type TicketStatus,
} from "@/lib/employee-tickets-table";
import { isTicketClosed } from "@/lib/ticket-status";
import {
  appendAdminMessage,
  appendEmployeeMessage,
  latestAdminRemark,
  seedEmployeeMessage,
} from "@/lib/ticket-thread";
import { getEmployeePseudonym } from "@/lib/ticket-employee-meta";
import {
  findTicketType,
  ticketTypeLabel,
  type TicketCategory,
} from "@/lib/ticket-catalog";
import {
  canModerateTicketStatus,
  filterTicketsForInbox,
  getHrEmployeeIdSet,
  isHrDepartmentSubmitter,
  loadHrTicketViewer,
} from "@/lib/hr-department-tickets";
import { syncLeaveRecordFromTicket } from "@/lib/leave-ticket-sync";

function viewerIdFromReq(req: NextRequest, searchParams?: URLSearchParams) {
  const q =
    searchParams?.get("viewerId") ||
    searchParams?.get("viewer_id") ||
    "";
  const h =
    req.headers.get("x-employee-id") ||
    req.headers.get("x-hrm-employee-id") ||
    "";
  return String(q || h || "").trim();
}

const VALID_CATEGORIES = new Set(["ESS", "IT", "HR", "ADMIN", "OPERATIONS"]);
const VALID_STATUSES = new Set([
  "pending",
  "in_progress",
  "resolved",
  "rejected",
  "closed",
]);
const VALID_PRIORITIES = new Set(["low", "normal", "high", "urgent"]);

async function ticketForBroadcast(ticket: EmployeeTicketRow) {
  const employee_pseudonym = await getEmployeePseudonym(ticket.employee_id);
  return { ...ticket, employee_pseudonym };
}

export async function GET(req: NextRequest) {
  try {
    await ensureEmployeeTicketsTable();
    const { searchParams } = new URL(req.url);
    const employeeId = searchParams.get("employeeId");
    const ticketId = searchParams.get("id");
    const status = searchParams.get("status");
    const category = searchParams.get("category");
    const ticketType = searchParams.get("ticketType");
    const includePolicy = searchParams.get("includePolicy") === "1";
    const inboxRaw = String(searchParams.get("inbox") || "").trim().toLowerCase();
    const inbox: "admin" | "hr" | "own" =
      inboxRaw === "hr" ? "hr" : inboxRaw === "own" ? "own" : "admin";
    const viewerId = viewerIdFromReq(req, searchParams);
    const limit = Math.min(parseInt(searchParams.get("limit") || "500", 10), 1000);

    let sql = `SELECT * FROM ${EMPLOYEE_TICKETS_TABLE}`;
    const params: (string | number)[] = [];
    const clauses: string[] = [];

    if (employeeId) {
      clauses.push("employee_id = ?");
      params.push(employeeId);
    }
    if (ticketId) {
      clauses.push("id = ?");
      params.push(parseInt(ticketId, 10));
    }
    if (status === "open") {
      clauses.push("status IN ('pending', 'in_progress')");
    } else if (status) {
      clauses.push("status = ?");
      params.push(status);
    }
    if (category) {
      clauses.push("category = ?");
      params.push(category);
    }
    if (ticketType) {
      clauses.push("ticket_type = ?");
      params.push(ticketType);
    }

    if (clauses.length) {
      sql += ` WHERE ${clauses.join(" AND ")}`;
    }

    // Newest first by numeric id (Mongo Date/string mix breaks requested_at ORDER BY).
    sql += ` ORDER BY id DESC LIMIT ${limit}`;

    const [rows]: unknown[] = await query(sql, params);
    const POLICY_TYPES = new Set(["guard_policy_alert", "guard_keyword_alert"]);
    let tickets = (Array.isArray(rows) ? rows : [])
      .map((r) => rowToTicket(r as Record<string, unknown>))
      .sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0));
    // Keep Guard Policy alerts out of the normal Ticket Inbox unless asked for.
    if (!ticketType && !includePolicy && !ticketId) {
      tickets = tickets.filter((t) => !POLICY_TYPES.has(String(t.ticket_type || "")));
    }

    const hrIds = await getHrEmployeeIdSet();
    const viewer = viewerId ? await loadHrTicketViewer(viewerId) : null;

    // Single-ticket fetch: owner or HR moderator (for HR tickets) or admin (non-HR).
    if (ticketId) {
      tickets = tickets.filter((t) => {
        const hrTicket = isHrDepartmentSubmitter(t.employee_id, hrIds);
        if (!hrTicket) return true;
        if (viewer && String(t.employee_id) === viewer.employeeId) return true;
        return Boolean(viewer?.canModerateHrTickets);
      });
      return NextResponse.json({
        success: true,
        tickets,
        count: tickets.length,
        canModerate: Boolean(viewer?.canModerateHrTickets),
      });
    }

    // Own tickets list (employee portal "my tickets") — always own only.
    if (employeeId) {
      return NextResponse.json({
        success: true,
        tickets,
        count: tickets.length,
        canModerate: false,
      });
    }

    // Inbox lists — HR dept tickets never appear in admin inbox.
    const filtered = filterTicketsForInbox(tickets, {
      inbox,
      viewer,
      hrIds,
    });

    return NextResponse.json({
      success: true,
      tickets: filtered,
      count: filtered.length,
      canModerate:
        inbox === "hr"
          ? Boolean(viewer?.canModerateHrTickets)
          : inbox === "admin",
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureEmployeeTicketsTable();
    const body = await req.json();
    const {
      employee_id,
      employee_name,
      category,
      ticket_type,
      subject,
      description,
      form_data,
      priority,
      is_custom,
    } = body;

    if (!employee_id || !category || !ticket_type) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    if (!VALID_CATEGORIES.has(String(category))) {
      return NextResponse.json({ success: false, error: "Invalid category" }, { status: 400 });
    }

    const cat = category as TicketCategory;
    const typeKey = String(ticket_type);
    const typeConfig = findTicketType(cat, typeKey);
    if (!typeConfig) {
      return NextResponse.json({ success: false, error: "Invalid ticket type" }, { status: 400 });
    }

    const custom = Boolean(is_custom) || typeKey === "custom";
    const prio = VALID_PRIORITIES.has(String(priority)) ? String(priority) : "normal";

    let finalSubject = String(subject || "").trim();
    if (!finalSubject) {
      finalSubject = `${ticketTypeLabel(cat, typeKey)} — ${employee_name || "Employee"}`;
    }
    if (custom && !String(subject || "").trim()) {
      return NextResponse.json(
        { success: false, error: "Subject is required for custom tickets" },
        { status: 400 }
      );
    }

    const desc = String(description || "").trim();
    if (
      !desc &&
      (typeConfig.form === "generic" ||
        typeConfig.form === "custom" ||
        typeConfig.form === "hrm_issue")
    ) {
      return NextResponse.json(
        { success: false, error: "Please describe your request" },
        { status: 400 }
      );
    }

    const formJson = form_data ? JSON.stringify(form_data) : null;

    const [result]: any = await pool.query(
      `INSERT INTO ${EMPLOYEE_TICKETS_TABLE}
       (ticket_number, employee_id, employee_name, category, ticket_type, is_custom,
        subject, description, form_data, priority, status, requested_at, updated_at)
       VALUES ('PENDING', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NOW(), NOW())`,
      [
        String(employee_id),
        employee_name || "Employee",
        cat,
        typeKey,
        custom ? 1 : 0,
        finalSubject,
        desc || null,
        formJson,
        prio,
      ]
    );

    const insertId = Number(result?.insertId);
    const ticketNumber = buildTicketNumber(insertId);
    await query(
      `UPDATE ${EMPLOYEE_TICKETS_TABLE} SET ticket_number = ? WHERE id = ?`,
      [ticketNumber, insertId]
    );

    const initialMessages =
      typeKey === "leave"
        ? []
        : seedEmployeeMessage(employee_name || "Employee", desc || null);
    if (initialMessages.length > 0) {
      await query(
        `UPDATE ${EMPLOYEE_TICKETS_TABLE} SET messages = ? WHERE id = ?`,
        [JSON.stringify(initialMessages), insertId]
      );
    }

    const [rows]: any = await query(
      `SELECT * FROM ${EMPLOYEE_TICKETS_TABLE} WHERE id = ? LIMIT 1`,
      [insertId]
    );
    const ticket = rowToTicket(rows?.[0] ?? {});

    // Leave tickets also create employee_leaves (pending) for attendance / leave inbox.
    if (typeKey === "leave") {
      try {
        await syncLeaveRecordFromTicket(ticket);
      } catch (err) {
        console.warn("[employee-tickets] leave sync on create failed", err);
      }
    }

    broadcastWsEvent({
      type: "ticket_created",
      ticket: await ticketForBroadcast(ticket),
    });
    return NextResponse.json({ success: true, ticket });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await ensureEmployeeTicketsTable();
    const body = await req.json();
    const { id, status, reply, admin_remark, author_name, from, employee_id } = body;
    if (!id) {
      return NextResponse.json({ success: false, error: "Invalid data" }, { status: 400 });
    }

    const replyText = String(reply ?? admin_remark ?? "").trim();
    const hasStatus = status && VALID_STATUSES.has(String(status));
    const isEmployeeReply = String(from || "").toLowerCase() === "employee";
    if (!hasStatus && !replyText) {
      return NextResponse.json({ success: false, error: "Nothing to update" }, { status: 400 });
    }
    if (isEmployeeReply && hasStatus) {
      return NextResponse.json(
        { success: false, error: "Employees cannot change ticket status" },
        { status: 403 }
      );
    }

    const [existing]: any = await query(
      `SELECT * FROM ${EMPLOYEE_TICKETS_TABLE} WHERE id = ? LIMIT 1`,
      [id]
    );
    if (!existing?.[0]) {
      return NextResponse.json({ success: false, error: "Ticket not found" }, { status: 404 });
    }

    const current = rowToTicket(existing[0] as Record<string, unknown>);
    if (isTicketClosed(current.status)) {
      return NextResponse.json(
        { success: false, error: "This ticket is closed. No further replies are allowed." },
        { status: 403 }
      );
    }

    // HR department tickets: only HR Manager / Team Lead may approve / reject / resolve.
    if (hasStatus && !isEmployeeReply) {
      const viewerId =
        String(body.viewerId || body.viewer_id || employee_id || "").trim() ||
        viewerIdFromReq(req);
      const viewer = viewerId ? await loadHrTicketViewer(viewerId) : null;
      const hrIds = await getHrEmployeeIdSet();
      if (
        !canModerateTicketStatus({
          ticketEmployeeId: current.employee_id,
          viewer,
          hrIds,
        })
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Only HR Manager or HR Team Lead can approve or reject HR department tickets.",
          },
          { status: 403 }
        );
      }
    }

    let messages = current.messages ?? [];
    if (replyText) {
      if (current.ticket_type === "leave") {
        return NextResponse.json(
          { success: false, error: "Leave tickets are status-only. Chat replies are not allowed." },
          { status: 403 }
        );
      }
      if (isEmployeeReply) {
        if (!employee_id || String(employee_id) !== String(current.employee_id)) {
          return NextResponse.json(
            { success: false, error: "You can only reply to your own tickets" },
            { status: 403 }
          );
        }
        messages = appendEmployeeMessage(
          messages,
          String(author_name || current.employee_name || "Employee"),
          replyText
        );
      } else {
        messages = appendAdminMessage(messages, String(author_name || "Admin"), replyText);
      }
    }

    const newStatus = (hasStatus ? String(status) : current.status) as TicketStatus;
    const resolvedAt =
      newStatus === "resolved" || newStatus === "rejected" || newStatus === "closed"
        ? new Date()
        : hasStatus
          ? null
          : current.resolved_at;

    await query(
      `UPDATE ${EMPLOYEE_TICKETS_TABLE}
       SET status = ?, admin_remark = ?, messages = ?, resolved_at = ?, updated_at = NOW()
       WHERE id = ?`,
      [newStatus, latestAdminRemark(messages), JSON.stringify(messages), resolvedAt, id]
    );

    const [rows]: any = await query(
      `SELECT * FROM ${EMPLOYEE_TICKETS_TABLE} WHERE id = ? LIMIT 1`,
      [id]
    );
    const ticket = rows?.[0] ? rowToTicket(rows[0] as Record<string, unknown>) : null;

    // Approve/reject leave ticket → employee_leaves (Monthly Attendance Leave status).
    if (ticket && ticket.ticket_type === "leave" && hasStatus) {
      try {
        await syncLeaveRecordFromTicket(ticket);
      } catch (err) {
        console.warn("[employee-tickets] leave sync on status failed", err);
      }
    }

    if (ticket) {
      broadcastTicketUpdate(await ticketForBroadcast(ticket));
    } else {
      broadcastTicketUpdate();
    }
    return NextResponse.json({ success: true, ticket });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

/** DELETE ?id=123 — permanently remove a ticket (admin). */
export async function DELETE(req: NextRequest) {
  try {
    await ensureEmployeeTicketsTable();
    const { searchParams } = new URL(req.url);
    let id = parseInt(searchParams.get("id") || "", 10);
    if (!Number.isFinite(id) || id <= 0) {
      try {
        const body = await req.json();
        id = parseInt(String(body?.id ?? ""), 10);
      } catch {
        /* no body */
      }
    }
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ success: false, error: "Ticket id is required" }, { status: 400 });
    }

    const [existing]: any = await query(
      `SELECT * FROM ${EMPLOYEE_TICKETS_TABLE} WHERE id = ? LIMIT 1`,
      [id]
    );
    if (!existing?.[0]) {
      return NextResponse.json({ success: false, error: "Ticket not found" }, { status: 404 });
    }
    const current = rowToTicket(existing[0] as Record<string, unknown>);
    const viewerId = viewerIdFromReq(req);
    const viewer = viewerId ? await loadHrTicketViewer(viewerId) : null;
    const hrIds = await getHrEmployeeIdSet();
    if (
      !canModerateTicketStatus({
        ticketEmployeeId: current.employee_id,
        viewer,
        hrIds,
      })
    ) {
      return NextResponse.json(
        { success: false, error: "Not allowed to delete this ticket." },
        { status: 403 }
      );
    }

    await query(`DELETE FROM ${EMPLOYEE_TICKETS_TABLE} WHERE id = ?`, [id]);
    broadcastWsEvent({
      type: "ticket_update",
      ticket: { id, deleted: true },
    });
    return NextResponse.json({
      success: true,
      deleted: true,
      id,
      ticket_number: existing[0].ticket_number,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
