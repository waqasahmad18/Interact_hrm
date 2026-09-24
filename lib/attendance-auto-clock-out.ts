/** MySQL TINYINT(1) may arrive as 0/1, boolean, or string. */
export function isAutoClockOutRecord(
  value: boolean | number | string | null | undefined,
): boolean {
  return value === true || value === 1 || value === "1";
}

/** Valid T.Punch Out display value (not empty / placeholder). */
export function isValidTPunchOutTime(value: string | null | undefined): boolean {
  const tp = String(value ?? "").trim();
  return Boolean(tp) && tp !== "-" && tp !== "---";
}

/**
 * When a session was system auto clocked-out, Clock Out must show the same
 * time as T.Punch Out (monthly attendance / reports).
 */
export function applyAutoClockOutTPunchDisplay<
  T extends { hrmClockOut: string; tungstenPunchOut: string },
>(
  session: T,
  autoClockOut: boolean | number | string | null | undefined,
): T {
  if (!isAutoClockOutRecord(autoClockOut)) return session;
  if (!isValidTPunchOutTime(session.tungstenPunchOut)) return session;
  if (session.hrmClockOut === session.tungstenPunchOut) return session;
  return { ...session, hrmClockOut: session.tungstenPunchOut };
}
