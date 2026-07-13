"use client";

import React from "react";
import {
  ensureFaceModelsLoaded,
  scanVideoFrame,
  descriptorToJson,
  averageDescriptors,
} from "@/lib/face-client-engine";

/** Same as FaceVerifyModal — multi-frame average before server match. */
const REQUIRED_PROBES = 3;
const SCAN_DEADLINE_MS = 35000;
const CAMERA_WARMUP_MS = 1200;

function isWebView2(): boolean {
  try {
    const w = window as Window & { chrome?: { webview?: unknown } };
    return Boolean(w.chrome?.webview);
  } catch {
    return false;
  }
}

function isVideoFrameUsable(video: HTMLVideoElement): boolean {
  if (video.readyState < 2 || video.videoWidth < 64) return false;
  const c = document.createElement("canvas");
  c.width = 48;
  c.height = 48;
  const ctx = c.getContext("2d");
  if (!ctx) return true;
  ctx.drawImage(video, 0, 0, 48, 48);
  const data = ctx.getImageData(0, 0, 48, 48).data;
  let sum = 0;
  let min = 255;
  let max = 0;
  for (let i = 0; i < data.length; i += 4) {
    const y = (data[i] + data[i + 1] + data[i + 2]) / 3;
    sum += y;
    if (y < min) min = y;
    if (y > max) max = y;
  }
  const avg = sum / (data.length / 4);
  return avg > 18 && max - min > 12;
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

  // Chrome --app window: close after reporting so agent can finish
  if (checkId && !isWebView2()) {
    window.setTimeout(() => {
      try {
        window.close();
      } catch {
        /* ignore */
      }
    }, 600);
  }
}

export default function PresenceSilentPage() {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const [status, setStatus] = React.useState("Starting…");

  React.useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;

    (async () => {
      const params = new URLSearchParams(window.location.search);
      const employeeId = (params.get("employeeId") || params.get("employee_id") || "").trim();
      const employeeName = (params.get("employeeName") || "").trim() || null;
      const checkId = (params.get("checkId") || params.get("check_id") || "").trim() || null;

      if (!employeeId) {
        await postToAgent(
          { cameraOk: false, atSeat: false, code: "error", error: "employeeId missing" },
          checkId
        );
        setStatus("Missing employeeId");
        return;
      }

      try {
        // Chrome (clock/break path): WebGL. WebView2: CPU (WebGL often garbage → 0%).
        setStatus(isWebView2() ? "Loading models (CPU)…" : "Loading models (same as break)…");
        await ensureFaceModelsLoaded({ preferCpu: isWebView2() });
        if (cancelled) return;

        setStatus("Opening camera…");
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
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
        await new Promise((r) => setTimeout(r, CAMERA_WARMUP_MS));
        if (cancelled) return;

        setStatus("Scanning (same model as clock/break)…");
        const deadline = Date.now() + SCAN_DEADLINE_MS;
        let lastCode = "no_face";
        let lastError: string | null = null;
        let lastSimilarity: number | null = null;
        let sawGarbageZero = false;
        const probes: number[][] = [];

        while (!cancelled && Date.now() < deadline) {
          if (!isVideoFrameUsable(video)) {
            probes.length = 0;
            lastCode = "bad_frame";
            lastError = "Camera frame blank/frozen — retrying";
            await new Promise((r) => setTimeout(r, 300));
            continue;
          }

          const scan = await scanVideoFrame(video);

          if (scan.status === "multiple") {
            probes.length = 0;
            lastCode = "multiple";
            await new Promise((r) => setTimeout(r, 280));
            continue;
          }

          if (scan.status !== "ok") {
            probes.length = 0;
            lastCode = scan.status === "adjust" ? "adjust" : "no_face";
            await new Promise((r) => setTimeout(r, 280));
            continue;
          }

          if (scan.coverage >= 0.82 || scan.coverage <= 0.16) {
            probes.length = 0;
            lastCode = "adjust";
            await new Promise((r) => setTimeout(r, 200));
            continue;
          }

          probes.push(descriptorToJson(scan.descriptor));
          setStatus(`Capturing… (${probes.length}/${REQUIRED_PROBES})`);
          if (probes.length < REQUIRED_PROBES) {
            await new Promise((r) => setTimeout(r, 220));
            continue;
          }

          const averaged = averageDescriptors(probes);
          probes.length = 0;
          setStatus("Matching enrollment…");

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
          if (cancelled) return;

          lastSimilarity =
            typeof data.similarity === "number" ? data.similarity : null;
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
            setStatus("Matched — you are present");
            return;
          }

          if (lastSimilarity !== null && lastSimilarity < 0.05) {
            sawGarbageZero = true;
            lastCode = "bad_frame";
            lastError = "Unusable face sample (0%) — camera retry";
            setStatus("Bad sample — retrying…");
            await new Promise((r) => setTimeout(r, 350));
            continue;
          }

          setStatus(`Retry… ${Math.round((lastSimilarity ?? 0) * 100)}%`);
          await new Promise((r) => setTimeout(r, 400));
        }

        if (!cancelled) {
          const cameraFailed =
            lastCode === "bad_frame" ||
            lastCode === "error" ||
            (sawGarbageZero && (lastSimilarity === null || lastSimilarity < 0.05));
          await postToAgent(
            {
              cameraOk: !cameraFailed,
              atSeat: false,
              code: cameraFailed ? "bad_frame" : lastCode,
              error: lastError || "No enrolled face match in time window",
              similarity: lastSimilarity,
            },
            checkId
          );
          setStatus(`Done — ${lastCode}`);
        }
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
        background: "#0f172a",
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
        }}
      />
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
    </div>
  );
}
