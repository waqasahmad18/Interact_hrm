/**
 * Attendance Summary ordering: open (running) sessions first, then latest activity first.
 * - Open rows: sort by clock_in descending (newest clock-in first among opens).
 * - Closed rows: sort by max(clock_in, clock_out) descending so the session that ended last is on top.
 */
export function compareAttendanceRows(a: any, b: any): number {
  const isOpen = (row: any) =>
    !!(row?.clock_in && (row.clock_out == null || String(row.clock_out).trim() === ""));

  const aOpen = isOpen(a);
  const bOpen = isOpen(b);
  if (aOpen !== bOpen) return aOpen ? -1 : 1;

  if (aOpen && bOpen) {
    const ta = a.clock_in ? new Date(a.clock_in).getTime() : 0;
    const tb = b.clock_in ? new Date(b.clock_in).getTime() : 0;
    if (tb !== ta) return tb - ta;
    return (Number(b.id) || 0) - (Number(a.id) || 0);
  }

  const endMs = (row: any) => {
    const tIn = row.clock_in ? new Date(row.clock_in).getTime() : 0;
    const tOut = row.clock_out ? new Date(row.clock_out).getTime() : 0;
    return Math.max(tIn, tOut);
  };
  const ka = endMs(a);
  const kb = endMs(b);
  if (kb !== ka) return kb - ka;
  return (Number(b.id) || 0) - (Number(a.id) || 0);
}
