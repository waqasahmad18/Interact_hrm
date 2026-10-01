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
 * Guard idle face check — SAME scan + match path as break FaceVerifyModal.
 * Only difference: UI stays hidden (silent) and result goes to Guard via session.
 */
const REQUIRED_PROBES = 4;
const SCAN_INTERVAL_MS = 280;
const SCAN_DEADLINE_MS = 55000;
const MAX_MATCH_ATTEMPTS = 6;
/** Confirmed identity fail (wrong face) — stop early so Guard gets ticket, not wait-timeout. */
const MAX_IDENTITY_FAILS = 2;
const CAMERA_OPEN_MS = 10000;

function isIdentityFailCode(code: string): boolean {
  return (
    code === "wrong_person" ||
    code === "low_similarity" ||
    code === "mismatch" ||
    code === "no_enrollment"
  );
}

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

/** Same capture + gates as FaceVerifyModal (break/prayer). */
async function runBreakSameVerify(
  video: HTMLVideoElement,
  employeeId: string,
  employeeName: string | null,
  checkId: string | null,
  cancelled: () => boolean,
  setStatus: (s: string) => void
): Promise<void> {
  setStatus("Scanning — same model as break…");
  const deadline = Date.now() + SCAN_DEADLINE_MS;
  let lastCode = "no_face";
  let lastError: string | null = null;
  let lastSimilarity: number | null = null;
  const probes: number[][] = [];
  let matchAttempts = 0;
  let identityFails = 0;
  let multiFaceStreak = 0;

  while (!cancelled() && Date.now() < deadline) {
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
      probes.length = 0;
      await new Promise((r) => setTimeout(r, SCAN_INTERVAL_MS));
      continue;
    }

    // Same distance gates as FaceVerifyModal
    if (scan.coverage >= 0.82) {
      lastCode = "adjust";
      probes.length = 0;
      setStatus("Too close — move back a little…");
      await new Promise((r) => setTimeout(r, SCAN_INTERVAL_MS));
      continue;
    }
    if (scan.coverage <= 0.16) {
      lastCode = "adjust";
      probes.length = 0;
      setStatus("Too far — move a little closer…");
      await new Promise((r) => setTimeout(r, SCAN_INTERVAL_MS));
      continue;
    }

    probes.push(descriptorToJson(scan.descriptor));
    setStatus(`Capturing face… (${probes.length}/${REQUIRED_PROBES})`);
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

    matchAttempts += 1;
    setStatus("Matching Face Enrollment (same as break)…");

    // Same matcher as break — presence-check uses action thresholds (not soft presence)
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
      setStatus("Present — matched enrollment");
      return;
    }

    // Wrong person / low match — do not burn the full deadline (that looked like a timeout)
    if (isIdentityFailCode(lastCode)) {
      identityFails += 1;
      if (identityFails >= MAX_IDENTITY_FAILS || matchAttempts >= MAX_MATCH_ATTEMPTS) {
        await postToAgent(
          {
            cameraOk: true,
            atSeat: false,
            code: lastCode,
            error: lastError || "Face did not match enrolled employee",
            similarity: lastSimilarity,
          },
          checkId
        );
        setStatus(`Done — ${lastCode}`);
        return;
      }
    } else {
      identityFails = 0;
    }

    if (matchAttempts >= MAX_MATCH_ATTEMPTS) break;
    setStatus(
      `Retry… ${Math.round((lastSimilarity ?? 0) * 100)}% — keep facing camera`
    );
    await new Promise((r) => setTimeout(r, 350));
  }

  if (!cancelled()) {
    await postToAgent(
      {
        cameraOk: true,
        atSeat: false,
        // Prefer identity fail codes so Guard sends HR ticket (not "timeout")
        code: isIdentityFailCode(lastCode) ? lastCode : lastCode || "mismatch",
        error: lastError || "Face did not match enrolled photos",
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
        // Same face-api load path as break FaceVerifyModal (WebGL in Chrome)
        setStatus(armed ? "Warming up (same model as break)…" : "Loading face engine…");
        const modelsPromise = ensureFaceModelsLoaded(
          isWebView2() ? { preferCpu: true } : undefined
        );

        // Same camera constraints as FaceVerifyModal
        const camPromise = navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 24, max: 30 },
          },
          audio: false,
        });
        const camTimeout = new Promise<MediaStream>((_, reject) => {
          window.setTimeout(
            () =>
              reject(
                new Error(
                  "Camera open timed out — close apps using the webcam and retry."
                )
              ),
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

        // Warm same pipeline as break
        await scanVideoFrame(video);

        if (armed && checkId) {
          setStatus("Ready — click Here");
          const signal = await waitForStartSignal(checkId, () => cancelled);
          if (signal !== "start") {
            setStatus("Cancelled");
            return;
          }
        }

        await runBreakSameVerify(
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
