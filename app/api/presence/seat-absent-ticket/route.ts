import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import {
  EMPLOYEE_TICKETS_TABLE,
  buildTicketNumber,
  broadcastTicketUpdate,
  ensureEmployeeTicketsTable,
  rowToTicket,
} from "@/lib/employee-tickets-table";
import { getEmployeePseudonym } from "@/lib/ticket-employee-meta";
import { seedEmployeeMessage } from "@/lib/ticket-thread";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Interact Guard: auto ticket when employee not at seat and no break.
 * Body: employee_id, employee_name?, pseudonym?, machine_id?, hostname?, reason?
 */
export async function POST(req: NextRequest) {
  try {
    await ensureEmployeeTicketsTable();
    const body = (await req.json()) as {
      employee_id?: string;
      employee_name?: string;
      pseudonym?: string;
      machine_id?: string;
      hostname?: string;
      reason?: string;
    };

    const employeeId = String(body.employee_id ?? "").trim();
    if (!employeeId) {
      return NextResponse.json(
        { success: false, error: "employee_id required" },
        { status: 400 },
      );
    }

    // Enrich from HRM
    let employeeName = String(body.employee_name ?? "").trim();
    let pseudonym = String(body.pseudonym ?? "").trim();
    try {
      const [rows] = await pool.query(
        `SELECT first_name, last_name, pseudonym FROM hrm_employees WHERE id = ? LIMIT 1`,
        [employeeId],
      );
      const emp = (rows as {
        first_name?: string;
        last_name?: string;
        pseudonym?: string;
      }[])[0];
      if (emp) {
        const n = `${emp.first_name || ""} ${emp.last_name || ""}`.trim();
        if (n) employeeName = n;
        if (emp.pseudonym?.trim()) pseudonym = emp.pseudonym.trim();
      }
    } catch {
      /* keep body values */
    }
    if (!pseudonym) {
      pseudonym = (await getEmployeePseudonym(employeeId)) || "";
    }
    if (!employeeName) employeeName = `Employee ${employeeId}`;

    const host = String(body.hostname ?? "").trim();
    const machine = String(body.machine_id ?? "").trim();
    const reason =
      String(body.reason ?? "").trim() ||
      "Employee not at seat; no break/meeting/restroom active";

    const subject = `Seat absent — ${employeeName}${pseudonym ? ` (${pseudonym})` : ""} · ID ${employeeId}`;
    const description = [
      reason,
      `Employee: ${employeeName}`,
      pseudonym ? `Pseudonym: ${pseudonym}` : null,
      `HRM ID: ${employeeId}`,
      host ? `PC: ${host}` : null,
      machine ? `Machine: ${machine}` : null,
      `Source: Interact Guard auto-detect`,
    ]
      .filter(Boolean)
      .join("\n");

    // Dedup: same employee open seat-absent ticket in last 30 minutes
    try {
      const [dup] = await pool.query(
        `SELECT id FROM ${EMPLOYEE_TICKETS_TABLE}
         WHERE employee_id = ?
           AND ticket_type = 'seat_absent'
           AND status IN ('pending', 'in_progress')
           AND requested_at >= (NOW() - INTERVAL 30 MINUTE)
         LIMIT 1`,
        [employeeId],
      );
      if (Array.isArray(dup) && dup.length > 0) {
        return NextResponse.json({
          success: true,
          deduped: true,
          ticket_id: (dup[0] as { id: number }).id,
        });
      }
    } catch {
      /* continue */
    }

    const formJson = JSON.stringify({
      employee_id: employeeId,
      employee_name: employeeName,
      pseudonym: pseudonym || null,
      machine_id: machine || null,
      hostname: host || null,
      source: "interact_guard",
    });

    const [result]: any = await pool.query(
      `INSERT INTO ${EMPLOYEE_TICKETS_TABLE}
       (ticket_number, employee_id, employee_name, category, ticket_type, is_custom,
        subject, description, form_data, priority, status, requested_at, updated_at)
       VALUES ('PENDING', ?, ?, 'HR', 'seat_absent', 0,
        ?, ?, ?, 'high', 'pending', NOW(), NOW())`,
      [employeeId, employeeName, subject, description, formJson],
    );

    const id = Number(result?.insertId);
    const ticketNumber = buildTicketNumber(id);
    await pool.query(
      `UPDATE ${EMPLOYEE_TICKETS_TABLE} SET ticket_number = ? WHERE id = ?`,
      [ticketNumber, id],
    );

    const messages = seedEmployeeMessage(employeeName, description);
    try {
      await pool.query(
        `UPDATE ${EMPLOYEE_TICKETS_TABLE} SET messages = ? WHERE id = ?`,
        [JSON.stringify(messages), id],
      );
    } catch {
      /* optional */
    }

    const [rows]: any = await pool.query(
      `SELECT * FROM ${EMPLOYEE_TICKETS_TABLE} WHERE id = ? LIMIT 1`,
      [id],
    );
    const ticket = rowToTicket(rows[0]);
    try {
      await broadcastTicketUpdate({
        ...ticket,
        employee_pseudonym: pseudonym || null,
      } as any);
    } catch {
      /* optional */
    }

    return NextResponse.json({
      success: true,
      ticket,
      ticket_number: ticketNumber,
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Ticket failed",
      },
      { status: 500 },
    );
  }
}
