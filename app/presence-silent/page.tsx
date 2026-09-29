"use client";

import React from "react";
import {
  ensureFaceModelsLoaded,
  scanVideoFrameFast,
  descriptorToJson,
  averageDescriptors,
} from "@/lib/face-client-engine";

/**
 * Guard idle face check.
 * Pre-warm loads models during Are-you-there; Here uses a fast scan + presence
 * match thresholds so verify finishes before Guard's wait ends.
 */
const REQUIRED_PROBES = 3;
const SCAN_DEADLINE_MS = 15000;
const SCAN_INTERVAL_MS = 50;
const MAX_MATCH_ATTEMPTS = 3;
const CAMERA_OPEN_MS = 8000;

function isWebView2(): boolean {
  try {
    const w = window as Window & { chrome?: { webview?: unknown } };
    return Boolean(w.chrome?.webview);
  } catch {
    return false;
  }
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
      /* agent may still get webview message */
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

  if (checkId && !isWebView2()) {
    window.setTimeout(() => {
      try {
        window.close();
      } catch {
        /* ignore */
      }
    }, 400);
  }
}

async function waitForStartSignal(
  checkId: string,
  cancelled: () => boolean
): Promise<"start" | "gone" | "cancelled"> {
  // Poll until Guard signals Here, or session disappears (cancel / timeout)
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

async function runFastVerify(
  video: HTMLVideoElement,
  employeeId: string,
  employeeName: string | null,
  checkId: string | null,
  cancelled: () => boolean,
  setStatus: (s: string) => void
): Promise<void> {
  setStatus("Scanning…");
  const deadline = Date.now() + SCAN_DEADLINE_MS;
  let lastCode = "no_face";
  let lastError: string | null = null;
  let lastSimilarity: number | null = null;
  const probes: number[][] = [];
  let matchAttempts = 0;

  while (!cancelled() && Date.now() < deadline) {
    const scan = await scanVideoFrameFast(video);

    if (scan.status === "multiple") {
      probes.length = 0;
      lastCode = "multiple";
      setStatus("Multiple faces — only you");
      await new Promise((r) => setTimeout(r, SCAN_INTERVAL_MS));
      continue;
    }

    if (scan.status !== "ok") {
      lastCode = "no_face";
      await new Promise((r) => setTimeout(r, SCAN_INTERVAL_MS));
      continue;
    }

    if (scan.coverage >= 0.9 || scan.coverage <= 0.1) {
      lastCode = "adjust";
      await new Promise((r) => setTimeout(r, SCAN_INTERVAL_MS));
      continue;
    }

    probes.push(descriptorToJson(scan.descriptor));
    setStatus(`Capturing… ${probes.length}/${REQUIRED_PROBES}`);
    if (probes.length < REQUIRED_PROBES) {
      await new Promise((r) => setTimeout(r, SCAN_INTERVAL_MS));
      continue;
    }

    const averaged = averageDescriptors(probes);
    probes.length = 0;
    matchAttempts += 1;
    setStatus("Matching…");

    const res = await fetch("/api/biometric/presence-check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employee_id: employeeId,
        employee_name: employeeName,
        descriptor: averaged,
      }),
    });
    const data = await res.json();
    if (cancelled()) return;

    lastSimilarity = typeof data.similarity === "number" ? data.similarity : null;
    lastCode = String(data.code || (data.verified ? "ok" : "mismatch"));
    lastError = data.error ?? null;

    if (data.atSeat || data.verified) {
      await postToAgent(
        {
          cameraOk: true,
          atSeat: true,
          code: "ok",
          error: null,
          similarity: lastSimilarity,
        },
        checkId
      );
      setStatus("Present");
      return;
    }

    if (matchAttempts >= MAX_MATCH_ATTEMPTS) break;
    setStatus("Retry…");
    await new Promise((r) => setTimeout(r, 120));
  }

  if (!cancelled()) {
    await postToAgent(
      {
        cameraOk: true,
        atSeat: false,
        code: lastCode,
        error: lastError || "Face did not match enrolled photos in time",
        similarity: lastSimilarity,
      },
      checkId
    );
    setStatus(`Done — ${lastCode}`);
  }
}

export default function PresenceSilentPage() {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const [status, setStatus] = React.useState("Starting…");
  const [silentUi, setSilentUi] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;

    (async () => {
      const params = new URLSearchParams(window.location.search);
      const employeeId = (params.get("employeeId") || params.get("employee_id") || "").trim();
      const employeeName = (params.get("employeeName") || "").trim() || null;
      const checkId = (params.get("checkId") || params.get("check_id") || "").trim() || null;
      const armed = params.get("armed") === "1";
      const silent =
        params.get("silent") === "1" ||
        params.get("source") === "interact-guard";
      setSilentUi(silent);

      if (!employeeId) {
        await postToAgent(
          { cameraOk: false, atSeat: false, code: "error", error: "employeeId missing" },
          checkId
        );
        setStatus("Missing employeeId");
        return;
      }

      try {
        setStatus(armed ? "Warming up (waiting for Here)…" : "Loading…");
        const modelsPromise = ensureFaceModelsLoaded({ preferCpu: isWebView2() });

        const camPromise = navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 24, max: 30 },
          },
          audio: false,
        });
        const camTimeout = new Promise<MediaStream>((_, reject) => {
          window.setTimeout(
            () => reject(new Error("Camera open timed out — close apps using the webcam (e.g. Discord) and retry.")),
            CAMERA_OPEN_MS
          );
        });
        stream = await Promise.race([camPromise, camTimeout]);
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        const video = videoRef.current;
        if (!video) {
          await postToAgent(
            { cameraOk: false, atSeat: false, code: "error", error: "No video element" },
            checkId
          );
          return;
        }
        video.srcObject = stream;
        await video.play();
        await new Promise<void>((resolve) => {
          if (video.readyState >= 2) resolve();
          else video.onloadeddata = () => resolve();
        });

        await modelsPromise;
        if (cancelled) return;

        // One warm inference so Here → first real scan is instant
        await scanVideoFrameFast(video);

        if (armed && checkId) {
          setStatus("Ready — click Here");
          const signal = await waitForStartSignal(checkId, () => cancelled);
          if (signal !== "start") {
            // Timed out / cancelled — exit quietly (Guard handles ticket)
            setStatus("Cancelled");
            return;
          }
        }

        await runFastVerify(
          video,
          employeeId,
          employeeName,
          checkId,
          () => cancelled,
          setStatus
        );
      } catch (err) {
        if (!cancelled) {
          await postToAgent(
            {
              cameraOk: false,
              atSeat: false,
              code: "error",
              error: err instanceof Error ? err.message : "Camera/model failed",
            },
            checkId
          );
          setStatus("Error");
        }
      } finally {
        stream?.getTracks().forEach((t) => t.stop());
      }
    })();

    return () => {
      cancelled = true;
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, []);

  return (
    <div
      style={{
        margin: 0,
        padding: 0,
        width: "100%",
        height: "100vh",
        background: "#000",
        color: "#e2e8f0",
        fontFamily: "system-ui, sans-serif",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <video
        ref={videoRef}
        muted
        playsInline
        autoPlay
        style={{
          flex: 1,
          width: "100%",
          minHeight: 0,
          objectFit: "cover",
          transform: "scaleX(-1)",
          background: "#000",
          opacity: silentUi ? 0.02 : 1,
        }}
      />
      {!silentUi ? (
        <div
          style={{
            padding: "8px 12px",
            fontSize: 12,
            background: "#1e293b",
            borderTop: "1px solid #334155",
          }}
        >
          {status}
        </div>
      ) : null}
    </div>
  );
}
