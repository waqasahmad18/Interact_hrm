"use client";

import TicketsPage from "../../admin/tickets/page";

/** HR ticket inbox — all HR staff may view; Manager / Team Lead may approve leave. */
export default function EmployeeTicketsPage() {
  return <TicketsPage inboxMode="hr" />;
}
