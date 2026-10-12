"use client";

import TicketsPage from "../../admin/tickets/page";

/** HR Manager / Team Lead inbox — HR department tickets only. */
export default function EmployeeTicketsPage() {
  return <TicketsPage inboxMode="hr" />;
}
