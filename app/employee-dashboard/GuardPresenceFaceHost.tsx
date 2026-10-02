"use client";

import React from "react";
import { FaceVerifyModal } from "@/app/components/FaceVerifyModal";

type Challenge = {
  checkId: string;
  employeeId: string;
  employeeName: string;
};

/**
 * Polls HRM presence-session (same server as dashboard) when Guard signals Here.
 * Shows Break-style FaceVerifyModal on this screen — no Chrome tab, no localhost.
 */
export function GuardPresenceFaceHost({
  employeeId,
  employeeName,
}: {
  employeeId: string;
  employeeName: string;
}) {
  const [challenge, setChallenge] = React.useState<Challenge | null>(null);
  const busyRef = React.useRef(false);
  const handledRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!employeeId || !/^\d+$/.test(employeeId)) return;

    let cancelled = false;
    const tick = async () => {
      if (cancelled || busyRef.current) return;
      try {
        const res = await fetch(
          `/api/biometric/presence-session?employeeId=${encodeURIComponent(employeeId)}`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled || !data?.pending || !data?.check_id || !data?.start) return;
        const cid = String(data.check_id);
        if (handledRef.current === cid) return;
        setChallenge({
          checkId: cid,
          employeeId: String(data.employee_id || employeeId),
          employeeName: employeeName || "Employee",
        });
      } catch {
        /* ignore */
      }
    };

    void tick();
    const id = window.setInterval(tick, 1000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [employeeId, employeeName]);

  const finish = React.useCallback(
    async (payload: {
      cameraOk: boolean;
      atSeat: boolean;
      code: string;
      error?: string | null;
      similarity?: number | null;
    }) => {
      const ch = challenge;
      if (!ch || busyRef.current) return;
      busyRef.current = true;
      handledRef.current = ch.checkId;
      try {
        await fetch("/api/biometric/presence-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ check_id: ch.checkId, result: payload }),
        });
      } catch {
        /* ignore */
      }
      setChallenge(null);
      busyRef.current = false;
    },
    [challenge],
  );

  if (!challenge) return null;

  return (
    <FaceVerifyModal
      open
      presenceCheck
      maxIdentityFails={2}
      action="break_start"
      actionLabel="confirm you are at your seat"
      employeeId={challenge.employeeId}
      employeeName={challenge.employeeName || employeeName || "Employee"}
      onVerified={() => {
        /* also via onPresenceResult */
      }}
      onPresenceResult={(r) => {
        void finish({
          cameraOk: true,
          atSeat: r.verified,
          code: r.code,
          error: r.error ?? null,
          similarity: r.similarity ?? null,
        });
      }}
      onClose={() => {
        void finish({
          cameraOk: true,
          atSeat: false,
          code: "cancelled",
          error: "Face verification cancelled",
        });
      }}
    />
  );
}
