import { parseAttendanceDateTimeMs } from "./shift-timing";
import { dateTimeLocalToIsoInTimeZone, SERVER_TIMEZONE } from "./timezone";

/** Prefer device-local eventTime from raw_json; fall back to event_time / imported_at. */
export function parseZkbioDateTimeMs(z: Record<string, unknown>): number | null {
  const rawJson = z.raw_json;
  if (rawJson != null && rawJson !== "") {
    try {
      const parsed =
        typeof rawJson === "string" ? JSON.parse(rawJson) : (rawJson as Record<string, unknown>);
      const eventTime = parsed?.eventTime ?? parsed?.event_time;
      if (eventTime != null && String(eventTime).trim() !== "") {
        const local = String(eventTime).trim().replace(" ", "T");
        const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::(\d{2}))?/.exec(local);
        if (match) {
          const isoLocal = `${match[1]}:${match[2] || "00"}`;
          const iso = dateTimeLocalToIsoInTimeZone(isoLocal, SERVER_TIMEZONE);
          if (iso) {
            const ms = new Date(iso).getTime();
            if (!Number.isNaN(ms)) return ms;
          }
        }
      }
    } catch {
      /* fall through */
    }
  }

  const rawVal = z.event_time ?? z.imported_at;
  if (rawVal == null || rawVal === "") return null;
  return parseAttendanceDateTimeMs(rawVal);
}
