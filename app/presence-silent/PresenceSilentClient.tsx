"use client";

import React from "react";
import { GuardIdleFaceVerifyModal } from "@/app/components/GuardIdleFaceVerifyModal";
import {
  ensureFaceModelsLoaded,
  preloadFaceRuntime,
} from "@/lib/face-client-engine";

/**
 * Guard idle FaceVerify — same modal as Break.
 * Server passes URL params so the card paints on first frame (no white slab).
 */

if (typeof window !== "undefined") {
  preloadFaceRuntime();
  window.setTimeout(() => {
    void ensureFaceModelsLoaded().catch(() => undefined);
  }, 0);
}

type BridgeResult = {
  cameraOk: boolean;
  atSeat: boolean;
  code: string;
  error?: string | null;
  similarity?: number | null;
};

type Props = {
  initialEmployeeId: string;
  initialEmployeeName: string;
  initialCheckId: string | null;
  initialEmbed: boolean;
  warmOnly: boolean;
};

function postUiReady() {
  try {
    const w = window as Window & {
      chrome?: { webview?: { postMessage: (msg: string) => void } };
    };
    w.chrome?.webview?.postMessage(JSON.stringify({ type: "ui-ready" }));
  } catch {
    /* not WebView2 */
  }
}

async function postToAgent(payload: BridgeResult, checkId: string | null) {
  if (checkId) {
    try {
      await fetch("/api/biometric/presence-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ check_id: checkId, result: payload }),
      });
    } catch {
      /* ignore */
    }
  }

  try {
    const w = window as Window & {
      chrome?: { webview?: { postMessage: (msg: string) => void } };
    };
    w.chrome?.webview?.postMessage(JSON.stringify(payload));
  } catch {
    /* ignore */
  }

  (window as unknown as { __presenceResult?: BridgeResult }).__presenceResult = payload;
  document.title = `presence:${payload.atSeat ? "1" : "0"}:${payload.code}`;

  window.setTimeout(() => {
    try {
      window.close();
    } catch {
      /* ignore */
    }
  }, 200);
}

export default function PresenceSilentClient({
  initialEmployeeId,
  initialEmployeeName,
  initialCheckId,
  initialEmbed,
  warmOnly,
}: Props) {
  const [employeeId] = React.useState(initialEmployeeId);
  const [employeeName] = React.useState(initialEmployeeName);
  const [checkId] = React.useState(initialCheckId);
  const [embed] = React.useState(initialEmbed);
  const [ready, setReady] = React.useState(!warmOnly && Boolean(initialEmployeeId));
  const [status, setStatus] = React.useState(
    warmOnly
      ? "Ready"
      : initialEmployeeId
        ? "Scanning…"
        : "Missing employeeId",
  );
  const doneRef = React.useRef(false);
  const uiReadySent = React.useRef(false);

  React.useEffect(() => {
    if (warmOnly) return;
    if (!employeeId) {
      void postToAgent(
        { cameraOk: false, atSeat: false, code: "error", error: "employeeId missing" },
        checkId,
      );
      return;
    }
    void ensureFaceModelsLoaded().catch(() => undefined);
    setReady(true);
  }, [warmOnly, employeeId, checkId]);

  React.useEffect(() => {
    if (!ready || !employeeId || uiReadySent.current) return;
    uiReadySent.current = true;
    const id = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => postUiReady());
    });
    return () => window.cancelAnimationFrame(id);
  }, [ready, employeeId]);

  React.useEffect(() => {
    if (!embed) return;
    const html = document.documentElement;
    const body = document.body;
    html.style.background = "#ffffff";
    body.style.background = "#ffffff";
    body.style.margin = "0";
    html.style.height = "100%";
    body.style.height = "100%";
    body.style.overflow = "hidden";
  }, [embed]);

  const finish = React.useCallback(
    (payload: BridgeResult) => {
      if (doneRef.current) return;
      doneRef.current = true;
      setReady(false);
      setStatus(payload.atSeat ? "Present" : "Failed");
      void postToAgent(payload, checkId);
    },
    [checkId],
  );

  const shell = (
    <div
      style={{
        width: "100%",
        minHeight: "100%",
        boxSizing: "border-box",
        padding: "14px 16px 12px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        fontFamily: "system-ui, sans-serif",
        color: "#0f172a",
        background: "#ffffff",
      }}
    >
      <div style={{ fontWeight: 800, fontSize: "1.02rem", marginBottom: 4 }}>Face Verification</div>
      <div style={{ fontSize: "0.82rem", color: "#64748b", marginBottom: 12 }}>{status}</div>
      <button
        type="button"
        onClick={() =>
          finish({
            cameraOk: true,
            atSeat: false,
            code: "cancelled",
            error: "Face verification cancelled",
          })
        }
        style={{
          marginTop: 8,
          padding: "8px 18px",
          borderRadius: 8,
          border: "1px solid #e2e8f0",
          background: "#fff",
          color: "#0f172a",
          cursor: "pointer",
          fontWeight: 600,
        }}
      >
        Cancel
      </button>
    </div>
  );

  return (
    <div
      style={{
        margin: 0,
        height: embed ? "100%" : undefined,
        minHeight: embed ? "100%" : "100vh",
        width: embed ? "100%" : undefined,
        background: embed || warmOnly ? "#ffffff" : "rgba(15, 23, 42, 0.92)",
        display: "flex",
        alignItems: embed ? "stretch" : "center",
        justifyContent: embed ? "stretch" : "center",
        fontFamily: "system-ui, sans-serif",
        color: embed || warmOnly ? "#0f172a" : "#e2e8f0",
        overflow: embed ? "hidden" : undefined,
      }}
    >
      {ready && employeeId ? (
        <GuardIdleFaceVerifyModal
          employeeId={employeeId}
          employeeName={employeeName || "Employee"}
          clearBackdrop={embed}
          onResult={(r) => {
            finish({
              cameraOk: true,
              atSeat: r.verified,
              code: r.code,
              error: r.error ?? null,
              similarity: r.similarity ?? null,
            });
          }}
          onCancelled={() => {
            finish({
              cameraOk: true,
              atSeat: false,
              code: "cancelled",
              error: "Face verification cancelled",
            });
          }}
        />
      ) : (
        shell
      )}
    </div>
  );
}
