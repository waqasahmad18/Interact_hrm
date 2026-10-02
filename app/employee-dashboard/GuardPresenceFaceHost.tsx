"use client";

import React from "react";
import { FaceVerifyModal } from "@/app/components/FaceVerifyModal";

const CHALLENGE_URL = "http://127.0.0.1:19501/presence-challenge";
const RESULT_ACK_URL = "http://127.0.0.1:19501/presence-result";

type Challenge = {
  checkId: string;
  employeeId: string;
  employeeName: string;
};

/**
 * Polls Interact Guard for idle seat-check. Shows the same FaceVerifyModal
 * popup as Break — on the Employee Dashboard screen (no Chrome tab).
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
        const ctrl = new AbortController();
        const t = window.setTimeout(() => ctrl.abort(), 1200);
        const res = await fetch(CHALLENGE_URL, {
          method: "GET",
          mode: "cors",
          cache: "no-store",
          signal: ctrl.signal,
        });
        window.clearTimeout(t);
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled || !data?.pending || !data?.check_id) return;
        const cid = String(data.check_id);
        if (handledRef.current === cid) return;
        const eid = String(data.employee_id || employeeId).trim();
        if (eid && eid !== String(employeeId)) return;
        setChallenge({
          checkId: cid,
          employeeId: eid || employeeId,
          employeeName: String(data.employee_name || employeeName || "Employee"),
        });
      } catch {
        /* Guard not running */
      }
    };

    void tick();
    const id = window.setInterval(tick, 1500);
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
      try {
        await fetch(RESULT_ACK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ check_id: ch.checkId }),
          mode: "cors",
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
