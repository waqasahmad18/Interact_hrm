"use client";

import React from "react";
import { GuardIdleFaceVerifyModal } from "@/app/components/GuardIdleFaceVerifyModal";
import {
  ensureFaceModelsLoaded,
  preloadFaceRuntime,
} from "@/lib/face-client-engine";
import { startCameraPrewarm } from "@/lib/camera-prewarm";

/**
 * Guard idle seat check — same FaceVerifyModal popup as Break/Clock.
 * Result posted to presence-session for Interact Guard.
 *
 * Embed mode must NEVER paint a blank white page — always show the card chrome.
 */

// CAMERA FIRST — do not let TF.js/WebGL init delay getUserMedia in WebView2.
if (typeof window !== "undefined") {
  startCameraPrewarm();
  preloadFaceRuntime();
  // Models after a tick so camera request wins the first event-loop slots.
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
  }, 200);
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
    const params = new URLSearchParams(window.location.search);
    const warmOnly = params.get("warm") === "1";
    if (warmOnly) {
      // Agent WebView prewarm — open camera only, no FaceVerify UI.
      startCameraPrewarm();
      setStatus("Camera warm");
      setEmbed(params.get("embed") === "1");
      return;
    }

    const eid = (params.get("employeeId") || params.get("employee_id") || "").trim();
    const ename = (params.get("employeeName") || "").trim();
    const cid = (params.get("checkId") || params.get("check_id") || "").trim() || null;
    const isEmbed = params.get("embed") === "1";
    setEmbed(isEmbed);
    setEmployeeId(eid);
    setEmployeeName(ename);
    setCheckId(cid);

    if (!eid) {
      setStatus("Missing employeeId");
      void postToAgent(
        { cameraOk: false, atSeat: false, code: "error", error: "employeeId missing" },
        cid,
      );
      return;
    }

    startCameraPrewarm();
    void ensureFaceModelsLoaded().catch(() => undefined);
    setStatus("Scanning…");
    setReady(true);
  }, []);

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
        background: embed ? "#ffffff" : "rgba(15, 23, 42, 0.92)",
        display: "flex",
        alignItems: embed ? "stretch" : "center",
        justifyContent: embed ? "stretch" : "center",
        fontFamily: "system-ui, sans-serif",
        color: embed ? "#0f172a" : "#e2e8f0",
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
