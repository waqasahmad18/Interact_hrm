"use client";

import React from "react";
import {
  ensureFaceModelsLoaded,
  scanVideoFrame,
  descriptorToJson,
  averageDescriptors,
  countFacesInVideo,
} from "@/lib/face-client-engine";

/**
 * Guard presence check — SAME face-api models + scan rules as FaceVerifyModal
 * (break / prayer), matched against Face Enrollment photos for this employee ID.
 */
const REQUIRED_PROBES = 4;
const SCAN_DEADLINE_MS = 55000;
const SCAN_INTERVAL_MS = 280;

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
    }, 600);
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
        // Same face-api load path as break / prayer FaceVerifyModal
        setStatus("Loading face engine (same as break)…");
        const modelsPromise = ensureFaceModelsLoaded({ preferCpu: isWebView2() });

        setStatus("Opening camera…");
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 24, max: 30 },
          },
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

        await modelsPromise;
        if (cancelled) return;

        setStatus("Scanning — same model as break/prayer…");
        const deadline = Date.now() + SCAN_DEADLINE_MS;
        let lastCode = "no_face";
        let lastError: string | null = null;
        let lastSimilarity: number | null = null;
        const probes: number[][] = [];
        let multiFaceStreak = 0;

        while (!cancelled && Date.now() < deadline) {
          const scan = await scanVideoFrame(video);

          if (scan.status === "multiple") {
            multiFaceStreak += 1;
            lastCode = "multiple";
            if (multiFaceStreak >= 2) {
              probes.length = 0;
              setStatus("Multiple faces — only you should be in frame");
            }
            await new Promise((r) => setTimeout(r, SCAN_INTERVAL_MS));
            continue;
          }
          multiFaceStreak = 0;

          if (scan.status !== "ok") {
            lastCode = scan.status === "adjust" ? "adjust" : "no_face";
            await new Promise((r) => setTimeout(r, SCAN_INTERVAL_MS));
            continue;
          }

          // Same distance gates as FaceVerifyModal (break/prayer)
          if (scan.coverage >= 0.82) {
            lastCode = "adjust";
            setStatus("Too close — move back a little…");
            await new Promise((r) => setTimeout(r, SCAN_INTERVAL_MS));
            continue;
          }
          if (scan.coverage <= 0.16) {
            lastCode = "adjust";
            setStatus("Too far — move a little closer…");
            await new Promise((r) => setTimeout(r, SCAN_INTERVAL_MS));
            continue;
          }

          probes.push(descriptorToJson(scan.descriptor));
          setStatus(`Capturing… (${probes.length}/${REQUIRED_PROBES}) — hold still`);
          if (probes.length < REQUIRED_PROBES) {
            await new Promise((r) => setTimeout(r, SCAN_INTERVAL_MS));
            continue;
          }

          const averaged = averageDescriptors(probes);
          probes.length = 0;

          // Same multi-pass count as break modal before accept
          const faceCount = await countFacesInVideo(video);
          if (faceCount >= 2) {
            lastCode = "multiple";
            setStatus("Multiple faces — blocked");
            await new Promise((r) => setTimeout(r, SCAN_INTERVAL_MS));
            continue;
          }

          setStatus("Matching Face Enrollment (your ID)…");

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
            setStatus("Present — matched enrollment");
            return;
          }

          setStatus(
            `Retry… ${Math.round((lastSimilarity ?? 0) * 100)}% — keep facing camera`
          );
          await new Promise((r) => setTimeout(r, 350));
        }

        if (!cancelled) {
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
          // Keep frames decoding for face-api (visibility:hidden can starve capture)
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
