"use client";

import TicketsPage from "../../admin/tickets/page";

/** HR ticket inbox — all HR staff may view; only Manager may approve/reject. */
export default function EmployeeTicketsPage() {
  return <TicketsPage inboxMode="hr" />;
}
