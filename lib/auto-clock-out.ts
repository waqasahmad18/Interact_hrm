import { ATTENDANCE_TABLE } from "./attendance-table";
import { AUTO_PRESENCE_POPUP_MS } from "./shift-timing";

type Conn = {
  execute: (sql: string, params?: unknown[]) => Promise<unknown>;
};

/** Server-side auto clock-out after promptAt + 5 min popup window. */
export function shouldServerAutoClockOut(
  promptAtMs: number | null,
  clockInMs: number | null,
  lastPresenceAckMs: number | null,
  nowMs: number = Date.now(),
): boolean {
  if (promptAtMs == null || clockInMs == null) return false;
  if (nowMs < promptAtMs + AUTO_PRESENCE_POPUP_MS) return false;
  if (lastPresenceAckMs != null && lastPresenceAckMs >= promptAtMs) return false;
  return true;
}

export async function performAutoClockOut(
  conn: Conn,
  attendanceId: number,
  employeeName?: string | null,
  /** When server sweep runs late, use scheduled deadline — not Date.now(). */
  clockOutAtMs?: number,
) {
  const outDate = new Date(clockOutAtMs ?? Date.now());
  const formattedClockOut = outDate.toISOString().slice(0, 19).replace("T", " ");

  await conn.execute(
    `UPDATE ${ATTENDANCE_TABLE}
     SET clock_out = ?,
         auto_clock_out = 1,
         last_presence_ack_at = NULL,
         total_hours = LEAST(999.99, ROUND(TIMESTAMPDIFF(MINUTE, clock_in, ?)/60, 2)),
         employee_name = COALESCE(employee_name, ?)
     WHERE id = ? AND clock_out IS NULL`,
    [formattedClockOut, formattedClockOut, employeeName ?? null, attendanceId],
  );

  return { clock_out: outDate.toISOString(), formatted: formattedClockOut };
}
