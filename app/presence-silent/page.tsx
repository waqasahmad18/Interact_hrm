"use client";

import React from "react";
import { FaceVerifyModal } from "@/app/components/FaceVerifyModal";

/**
 * Guard idle seat check — same FaceVerifyModal popup as Break/Clock.
 * Result posted to presence-session for Interact Guard.
 */

type BridgeResult = {
  cameraOk: boolean;
  atSeat: boolean;
  code: string;
  error?: string | null;
  similarity?: number | null;
};

async function postToAgent(payload: BridgeResult, checkId: string | null) {
  if (checkId) {
    try {
      await fetch("/api/biometric/presence-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ check_id: checkId, result: payload }),
      });
    } catch {
      /* agent may still poll */
    }
  }

  try {
    const w = window as Window & {
      chrome?: { webview?: { postMessage: (msg: string) => void } };
    };
    w.chrome?.webview?.postMessage(JSON.stringify(payload));
  } catch {
    /* not in WebView2 */
  }

  (window as unknown as { __presenceResult?: BridgeResult }).__presenceResult = payload;
  document.title = `presence:${payload.atSeat ? "1" : "0"}:${payload.code}`;

  window.setTimeout(() => {
    try {
      window.close();
    } catch {
      /* ignore */
    }
  }, 700);
}

async function waitForStartSignal(
  checkId: string,
  cancelled: () => boolean
): Promise<"start" | "gone" | "cancelled"> {
  while (!cancelled()) {
    try {
      const res = await fetch(
        `/api/biometric/presence-session?check_id=${encodeURIComponent(checkId)}`,
        { cache: "no-store" }
      );
      if (res.status === 404) return "gone";
      const data = await res.json();
      if (data?.start === true) return "start";
      if (data?.pending === false && data?.result) return "gone";
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return "cancelled";
}

export default function PresenceSilentPage() {
  const [ready, setReady] = React.useState(false);
  const [employeeId, setEmployeeId] = React.useState("");
  const [employeeName, setEmployeeName] = React.useState("");
  const [checkId, setCheckId] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState("Preparing face check…");
  const [embed, setEmbed] = React.useState(false);
  const doneRef = React.useRef(false);

  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      const params = new URLSearchParams(window.location.search);
      const eid = (params.get("employeeId") || params.get("employee_id") || "").trim();
      const ename = (params.get("employeeName") || "").trim();
      const cid = (params.get("checkId") || params.get("check_id") || "").trim() || null;
      const armed = params.get("armed") === "1";
      const isEmbed = params.get("embed") === "1";
      setEmbed(isEmbed);

      setEmployeeId(eid);
      setEmployeeName(ename);
      setCheckId(cid);

      if (!eid) {
        await postToAgent(
          { cameraOk: false, atSeat: false, code: "error", error: "employeeId missing" },
          cid
        );
        setStatus("Missing employeeId");
        return;
      }

      if (armed && cid) {
        setStatus("Ready — waiting for Here…");
        const signal = await waitForStartSignal(cid, () => cancelled);
        if (signal !== "start") {
          setStatus("Cancelled");
          return;
        }
      }

      if (!cancelled) {
        setStatus("Scanning…");
        setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const finish = React.useCallback(
    async (payload: BridgeResult) => {
      if (doneRef.current) return;
      doneRef.current = true;
      setReady(false);
      setStatus(payload.atSeat ? "Present" : "Failed");
      await postToAgent(payload, checkId);
    },
    [checkId]
  );

  // Keep html/body fully clear in Guard embed so no gray WebView slab shows
  React.useEffect(() => {
    if (!embed) return;
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlBg = html.style.background;
    const prevBodyBg = body.style.background;
    const prevHtmlH = html.style.height;
    const prevBodyH = body.style.height;
    const prevOverflow = body.style.overflow;
    html.style.background = "transparent";
    body.style.background = "transparent";
    body.style.margin = "0";
    html.style.height = "100%";
    body.style.height = "100%";
    body.style.overflow = "hidden";
    return () => {
      html.style.background = prevHtmlBg;
      body.style.background = prevBodyBg;
      html.style.height = prevHtmlH;
      body.style.height = prevBodyH;
      body.style.overflow = prevOverflow;
    };
  }, [embed]);

  return (
    <div
      style={{
        margin: 0,
        // embed: fill host window only (host is sized to the card — no extra slab)
        height: embed ? "100%" : undefined,
        minHeight: embed ? "100%" : "100vh",
        width: embed ? "100%" : undefined,
        background: embed ? "transparent" : "rgba(15, 23, 42, 0.92)",
        display: "flex",
        alignItems: embed ? "stretch" : "center",
        justifyContent: embed ? "stretch" : "center",
        fontFamily: "system-ui, sans-serif",
        color: embed ? "#0f172a" : "#e2e8f0",
        overflow: embed ? "hidden" : undefined,
      }}
    >
      {!ready ? (
        embed ? null : (
          <p style={{ fontSize: 15, opacity: 0.9 }}>{status}</p>
        )
      ) : (
        <FaceVerifyModal
          open
          presenceCheck
          clearBackdrop={embed}
          maxIdentityFails={2}
          noFaceTimeoutSec={15}
          action="break_start"
          actionLabel="confirm you are at your seat"
          employeeId={employeeId}
          employeeName={employeeName || "Employee"}
          onVerified={() => {
            /* success also via onPresenceResult */
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
      )}
    </div>
  );
}
