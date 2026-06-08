import {
  AUTO_PRESENCE_GRACE_MS,
  clockInDateKey,
  computePresencePromptAtMs,
  computeSessionGracePromptAtMs,
  computeShiftEndEpochMs,
  normalizeDateKey,
  parseAttendanceDateTimeMs,
  type ShiftAssignmentTiming,
} from "./shift-timing";

export type OpenAttendanceRow = {
  id: number;
  employee_id: string;
  clock_in: string;
  last_presence_ack_at: string | null;
};

export async function fetchShiftForEmployee(
  conn: { execute: (sql: string, params?: unknown[]) => Promise<unknown> },
  employeeId: string,
  onOrBeforeDate: string,
): Promise<ShiftAssignmentTiming | null> {
  const [rows] = await conn.execute(
    `SELECT start_time, end_time, assigned_date
     FROM shift_assignments
     WHERE employee_id = ?
       AND assigned_date <= ?
     ORDER BY assigned_date DESC, id DESC
     LIMIT 1`,
    [employeeId, onOrBeforeDate],
  );
  const list = rows as ShiftAssignmentTiming[];
  if (!list.length || !list[0].start_time || !list[0].end_time) return null;
  const row = list[0];
  const assigned_date = normalizeDateKey(row.assigned_date);
  if (!assigned_date) return null;
  return {
    start_time: String(row.start_time),
    end_time: String(row.end_time),
    assigned_date,
  };
}

export function evaluatePresencePrompt(
  open: OpenAttendanceRow,
  shift: ShiftAssignmentTiming | null,
  nowMs: number = Date.now(),
) {
  if (!shift) {
    return {
      clockedIn: true,
      shouldPrompt: false,
      reason: "no_shift",
      shiftEndMs: null as number | null,
      promptAtMs: null as number | null,
    };
  }

  const sessionDateKey = clockInDateKey(open.clock_in);
  const shiftEndMs = computeShiftEndEpochMs(shift, sessionDateKey);
  if (shiftEndMs == null) {
    return {
      clockedIn: true,
      shouldPrompt: false,
      reason: "invalid_shift",
      shiftEndMs: null,
      promptAtMs: null,
    };
  }

  const clockInMs = parseAttendanceDateTimeMs(open.clock_in);
  if (clockInMs == null) {
    return {
      clockedIn: true,
      shouldPrompt: false,
      reason: "invalid_clock_in",
      shiftEndMs,
      promptAtMs: null,
    };
  }

  const ackParsed = open.last_presence_ack_at
    ? parseAttendanceDateTimeMs(open.last_presence_ack_at)
    : null;

  const shiftGraceEndMs = shiftEndMs + AUTO_PRESENCE_GRACE_MS;
  // After shift+3h grace: new clock-in = fresh 3h session (shift already finished today).
  const isPostShiftGraceClockIn = clockInMs >= shiftGraceEndMs;
  const promptAtMs = isPostShiftGraceClockIn
    ? computeSessionGracePromptAtMs(clockInMs, ackParsed)
    : computePresencePromptAtMs(shiftEndMs, ackParsed);
  const shouldPrompt = nowMs >= promptAtMs;
  const reason = shouldPrompt
    ? "due"
    : isPostShiftGraceClockIn
      ? "waiting_post_shift_session_grace"
      : "waiting_shift_grace";

  return {
    clockedIn: true,
    shouldPrompt,
    reason,
    shiftEndMs,
    shiftGraceEndMs,
    promptAtMs,
    clockInMs,
    lastPresenceAckMs: ackParsed,
  };
}
