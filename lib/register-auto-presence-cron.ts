import "server-only";

import { sweepAutoPresenceClockOuts } from "./auto-presence-sweep";

/**
 * Periodically closes open attendance sessions after shift grace + 5 min — no browser required.
 */
export function registerAutoPresenceCron(): void {
  if (
    process.env.AUTO_PRESENCE_SWEEP_ENABLED === "false" ||
    process.env.AUTO_PRESENCE_SWEEP_ENABLED === "0"
  ) {
    console.log("[auto-presence] Server sweep off (AUTO_PRESENCE_SWEEP_ENABLED=false).");
    return;
  }

  const parsed = Number(process.env.AUTO_PRESENCE_SWEEP_INTERVAL_MS ?? 30_000);
  const intervalMs = Number.isFinite(parsed) && parsed >= 15_000 ? parsed : 30_000;

  const g = globalThis as typeof globalThis & {
    __autoPresenceSweepInterval?: ReturnType<typeof setInterval>;
  };
  if (g.__autoPresenceSweepInterval) return;

  const tick = () => {
    sweepAutoPresenceClockOuts()
      .then((r) => {
        if (r.clockedOut > 0) {
          console.log(
            `[auto-presence] Auto clock-out: ${r.clockedOut} session(s) [${r.attendanceIds.join(", ")}]`,
          );
        }
      })
      .catch((e) => {
        console.error("[auto-presence] Sweep failed:", e);
      });
  };

  g.__autoPresenceSweepInterval = setInterval(tick, intervalMs);
  console.log(
    `[auto-presence] DB sweep every ${intervalMs / 1000}s (browser/logout independent).`,
  );

  setTimeout(tick, 5_000);
}
