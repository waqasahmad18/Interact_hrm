"use client";

import React from "react";
import type { BiometricAction } from "@/lib/face-types";
import {
  averageDescriptors,
  countFacesInVideo,
  descriptorToJson,
  ensureFaceModelsLoaded,
  quickCountFacesInVideo,
  scanVideoFrame,
} from "@/lib/face-client-engine";

type Props = {
  open: boolean;
  action: BiometricAction;
  actionLabel: string;
  employeeId: string;
  employeeName: string;
  onVerified: (token: string) => void;
  onClose: () => void;
};

const SCAN_INTERVAL_MS = 280;
const RETRY_AFTER_FAIL_MS = 200;
// Good consecutive frames whose descriptors are averaged into one stable probe.
// Averaging cancels per-frame noise (pose, lighting, glasses glare, blur) so the
// match is far more reliable — and harder to fool — than a single snapshot.
const REQUIRED_PROBES = 3;

export function FaceVerifyModal({
  open,
  action,
  actionLabel,
  employeeId,
  employeeName,
  onVerified,
  onClose,
}: Props) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const rafRef = React.useRef<number | null>(null);
  const busyRef = React.useRef(false);
  const scanInFlightRef = React.useRef(false);
  const lastScanAtRef = React.useRef(0);
  const singleFaceStreakRef = React.useRef(0);
  const probeBufferRef = React.useRef<number[][]>([]);

  const [modelsReady, setModelsReady] = React.useState(false);
  const [cameraReady, setCameraReady] = React.useState(false);
  const [status, setStatus] = React.useState("Loading face engine…");
  const [error, setError] = React.useState<string | null>(null);
  const [verifying, setVerifying] = React.useState(false);
  const [multipleFaces, setMultipleFaces] = React.useState(false);
  const [guidance, setGuidance] = React.useState<string | null>(null);

  const stopCamera = React.useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraReady(false);
  }, []);

  const blockMultipleFaces = React.useCallback((count: number) => {
    singleFaceStreakRef.current = 0;
    probeBufferRef.current = [];
    setMultipleFaces(true);
    setError(null);
    setGuidance(
      "Only one person in the frame — ask anyone behind or beside you to step out of camera view."
    );
    setStatus(
      count >= 2
        ? `${count} faces in frame — clock action blocked.`
        : "Multiple faces in the frame — clock action blocked."
    );
  }, []);

  const submitScan = React.useCallback(async () => {
    if (busyRef.current || scanInFlightRef.current || !employeeId || !modelsReady || !cameraReady) {
      return;
    }

    const video = videoRef.current;
    if (!video) return;

    scanInFlightRef.current = true;
    try {
      const scan = await scanVideoFrame(video);

      if (scan.status === "multiple") {
        blockMultipleFaces(scan.count);
        return;
      }

      // Any non-multiple result continues scanning.
      if (scan.status === "none") {
        singleFaceStreakRef.current = 0;
        probeBufferRef.current = [];
        if (multipleFaces) setMultipleFaces(false);
        setError(null);
        setStatus("Look at the camera — scanning automatically…");
        setGuidance(null);
        return;
      }

      if (scan.status === "adjust") {
        singleFaceStreakRef.current = 0;
        probeBufferRef.current = [];
        if (multipleFaces) setMultipleFaces(false);
        setError(null);
        setStatus("Adjusting…");
        setGuidance("Center your face, look straight and hold still.");
        return;
      }

      if (multipleFaces) setMultipleFaces(false);
      setError(null);

      // Distance guidance from face coverage. If the face is too close or too
      // far we DON'T verify yet — we show guidance and let the user adjust, so
      // the message is actually visible and verification happens at a good size.
      if (scan.coverage >= 0.82) {
        singleFaceStreakRef.current = 0;
        probeBufferRef.current = [];
        setStatus("Adjust distance…");
        setGuidance("Too close — move back a little (about 40–50cm from the camera).");
        return;
      }
      if (scan.coverage <= 0.16) {
        singleFaceStreakRef.current = 0;
        probeBufferRef.current = [];
        setStatus("Adjust distance…");
        setGuidance("Too far — move a little closer to the camera.");
        return;
      }

      singleFaceStreakRef.current += 1;

      // Re-check the full frame before each captured probe — someone can walk
      // behind the user between scan ticks (e.g. standing slightly lower).
      const liveFaceCount = await quickCountFacesInVideo(video);
      if (liveFaceCount >= 2) {
        singleFaceStreakRef.current = 0;
        probeBufferRef.current = [];
        blockMultipleFaces(liveFaceCount);
        return;
      }

      // Collect several good frames and average their descriptors into one
      // stable probe before contacting the server. A single frame can be noisy
      // (slight angle, glasses glare, blur); the averaged embedding is much
      // closer to the enrolled photos and far harder to fool.
      probeBufferRef.current.push(descriptorToJson(scan.descriptor));
      if (probeBufferRef.current.length < REQUIRED_PROBES) {
        setError(null);
        setGuidance("Good — hold still…");
        setStatus(`Capturing face… (${probeBufferRef.current.length}/${REQUIRED_PROBES})`);
        return;
      }

      const averagedProbe = averageDescriptors(probeBufferRef.current);
      probeBufferRef.current = [];

      setGuidance("Hold still…");
      setStatus("Checking frame…");
      busyRef.current = true;
      setVerifying(true);

      // Thorough multi-pass count (full + crop) right before accepting so a
      // second face near the edge / smaller / farther is reliably caught and
      // the clock action is blocked. Only one face may proceed.
      const faceCount = await countFacesInVideo(video);
      if (faceCount >= 2) {
        busyRef.current = false;
        setVerifying(false);
        blockMultipleFaces(faceCount);
        return;
      }

      setStatus("Face detected — verifying…");

      try {
        const res = await fetch("/api/biometric/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            employee_id: employeeId,
            employee_name: employeeName || "",
            action,
            descriptor: averagedProbe,
          }),
        });
        const data = await res.json();

        if (data.success && data.biometric_token) {
          stopCamera();
          onVerified(data.biometric_token);
          return;
        }

        singleFaceStreakRef.current = 0;
        probeBufferRef.current = [];
        setError(data.error || "Face not verified. Hold still — retrying…");
        setStatus("Scanning again…");
        lastScanAtRef.current = performance.now() - SCAN_INTERVAL_MS + RETRY_AFTER_FAIL_MS;
      } catch {
        singleFaceStreakRef.current = 0;
        probeBufferRef.current = [];
        setError("Network error. Retrying…");
        setStatus("Scanning again…");
        lastScanAtRef.current = performance.now() - SCAN_INTERVAL_MS + RETRY_AFTER_FAIL_MS;
      } finally {
        busyRef.current = false;
        setVerifying(false);
      }
    } finally {
      scanInFlightRef.current = false;
    }
  }, [
    action,
    blockMultipleFaces,
    cameraReady,
    employeeId,
    employeeName,
    modelsReady,
    multipleFaces,
    onVerified,
    stopCamera,
  ]);

  React.useEffect(() => {
    if (!open) {
      stopCamera();
      setModelsReady(false);
      setVerifying(false);
      setError(null);
      setMultipleFaces(false);
      setGuidance(null);
      singleFaceStreakRef.current = 0;
      probeBufferRef.current = [];
      scanInFlightRef.current = false;
      busyRef.current = false;
      lastScanAtRef.current = 0;
      setStatus("Loading face engine…");
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        setStatus("Starting camera…");

        const modelsPromise = ensureFaceModelsLoaded();
        const stream = await navigator.mediaDevices.getUserMedia({
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

        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;

        video.srcObject = stream;
        await video.play();
        await new Promise<void>((resolve) => {
          if (video.readyState >= 2) resolve();
          else video.onloadeddata = () => resolve();
        });

        if (cancelled) return;
        setCameraReady(true);
        setStatus("Look at the camera — scanning…");

        await modelsPromise;
        if (cancelled) return;
        setModelsReady(true);
      } catch {
        setError("Camera access denied. Allow camera permission and retry.");
        setStatus("Camera unavailable");
      }
    })();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [open, stopCamera]);

  React.useEffect(() => {
    if (!open || !modelsReady || !cameraReady) return;

    lastScanAtRef.current = performance.now() - SCAN_INTERVAL_MS;
    void submitScan();

    let active = true;

    const tick = (now: number) => {
      if (!active) return;
      if (now - lastScanAtRef.current >= SCAN_INTERVAL_MS) {
        lastScanAtRef.current = now;
        void submitScan();
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      active = false;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [open, modelsReady, cameraReady, submitScan]);

  if (!open) return null;

  const ringColor = multipleFaces
    ? "#e74c3c"
    : verifying
      ? "#f39c12"
      : cameraReady && modelsReady
        ? "#27ae60"
        : "#dfe6e9";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10000,
      }}
    >
      <style>{`
        @keyframes fvm-pulse {
          0%, 100% { box-shadow: 0 0 0 3px ${ringColor}, 0 0 12px rgba(39,174,96,0.35); }
          50% { box-shadow: 0 0 0 3px ${ringColor}, 0 0 22px rgba(39,174,96,0.55); }
        }
        .fvm-video-ring {
          animation: fvm-pulse 2.4s ease-in-out infinite;
        }
      `}</style>

      <div
        style={{
          background: "#fff",
          borderRadius: 18,
          padding: "28px 24px",
          width: "min(420px, 92vw)",
          textAlign: "center",
          boxShadow: "0 12px 40px rgba(0,0,0,0.2)",
        }}
      >
        <div style={{ fontWeight: 700, fontSize: "1.2rem", marginBottom: 6, color: "#2d3436" }}>
          Face Verification
        </div>
        <div style={{ fontSize: "0.95rem", color: "#636e72", marginBottom: 8 }}>
          Verify to <strong>{actionLabel}</strong>
        </div>
        <div style={{ fontSize: "0.88rem", color: "#2d3436", marginBottom: 16, lineHeight: 1.4 }}>
          <strong>{employeeName || "Employee"}</strong>
          {employeeId ? ` · ID ${employeeId}` : ""}
        </div>

        {multipleFaces && (
          <div
            style={{
              background: "#fdecea",
              border: "2px solid #e74c3c",
              borderRadius: 10,
              padding: "12px 14px",
              marginBottom: 14,
              color: "#c0392b",
              fontWeight: 700,
              fontSize: "0.95rem",
              lineHeight: 1.45,
            }}
            role="alert"
          >
            Multiple faces in the frame
            <div style={{ fontWeight: 500, fontSize: "0.85rem", marginTop: 4 }}>
              {actionLabel} is blocked. Only one person should be visible — remove others from
              camera view.
            </div>
          </div>
        )}

        <div
          className={cameraReady && modelsReady && !verifying && !multipleFaces ? "fvm-video-ring" : undefined}
          style={{
            position: "relative",
            margin: "0 auto 14px",
            width: 280,
            height: 210,
            borderRadius: 12,
            overflow: "hidden",
            background: "#111",
            boxShadow: `0 0 0 3px ${ringColor}`,
            transition: "box-shadow 0.4s ease",
          }}
        >
          <video
            ref={videoRef}
            playsInline
            muted
            style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" }}
          />
          {verifying && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "rgba(0,0,0,0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontWeight: 600,
                fontSize: "0.95rem",
              }}
            >
              Verifying…
            </div>
          )}
        </div>

        {guidance && !error && (
          <div
            style={{
              fontSize: "0.86rem",
              color: multipleFaces ? "#c0392b" : "#2563eb",
              background: multipleFaces ? "#fdecea" : "#eef4ff",
              border: `1px solid ${multipleFaces ? "#f5c6c0" : "#cfe0ff"}`,
              borderRadius: 8,
              padding: "8px 12px",
              marginBottom: 10,
              lineHeight: 1.4,
              fontWeight: 500,
            }}
          >
            {guidance}
          </div>
        )}
        {error && !multipleFaces && (
          <div style={{ fontSize: "0.88rem", color: "#e74c3c", marginBottom: 10, lineHeight: 1.4 }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 12 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: "none",
              borderRadius: 8,
              padding: "10px 20px",
              fontWeight: 600,
              background: "#dfe6e9",
              color: "#2d3436",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
