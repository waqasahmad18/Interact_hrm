"use client";

import React from "react";
import { createPortal } from "react-dom";
import type { BiometricAction } from "@/lib/face-types";
import {
  averageDescriptors,
  collectFaceDescriptorsFromVideo,
  descriptorDistance,
  descriptorToJson,
  ensureFaceModelsLoaded,
  PROBE_FRAME_AGREE_MAX,
  scanVideoFrame,
} from "@/lib/face-client-engine";
import { FaceScanViewport, type FaceScanMode } from "@/app/components/FaceScanHud";
import modalStyles from "./face-verify-modal.module.css";

type Props = {
  open: boolean;
  action: BiometricAction;
  actionLabel: string;
  employeeId: string;
  employeeName: string;
  onVerified: (token: string) => void;
  onClose: () => void;
  /**
   * Idle / Guard seat check — same camera + models + HUD as break,
   * but hits /api/biometric/presence-check (no biometric_token).
   */
  presenceCheck?: boolean;
  /** Fired once for presenceCheck success/fail (after limited identity retries). */
  onPresenceResult?: (result: {
    verified: boolean;
    code: string;
    error?: string | null;
    similarity?: number | null;
  }) => void;
  /** Identity mismatches before failing presenceCheck (default 2). */
  maxIdentityFails?: number;
  /**
   * Guard-only: seconds with no face in frame before auto-fail.
   * Omit / 0 on Break — no timer there.
   */
  noFaceTimeoutSec?: number;
  /**
   * Guard WebView2 embed: no dimmed/blurred overlay behind the card
   * (Break / prayer keep the normal page dim).
   */
  clearBackdrop?: boolean;
};

const SCAN_INTERVAL_MS = 160;
const SCAN_INTERVAL_PRESENCE_MS = 180;
const RETRY_AFTER_FAIL_MS = 120;
// 2 stable frames is enough for Break/Clock/Prayer — cuts ~half the wait.
const REQUIRED_PROBES = 2;
const REQUIRED_PROBES_PRESENCE = 2;
/** Face height / frame height — wide band so Adjust loops don't stall verify. */
const COVERAGE_MIN = 0.1;
const COVERAGE_MAX = 0.88;

function resolveScanMode(input: {
  verifySuccess: boolean;
  verifying: boolean;
  cameraReady: boolean;
  modelsReady: boolean;
  status: string;
  guidance: string | null;
}): FaceScanMode {
  if (input.verifySuccess) return "success";
  if (input.verifying) return "verifying";
  if (!input.cameraReady || !input.modelsReady) return "initializing";
  if (
    input.status.startsWith("Adjust") ||
    input.guidance?.includes("Center") ||
    input.guidance?.includes("Too close") ||
    input.guidance?.includes("Too far")
  ) {
    return "adjust";
  }
  if (input.status.startsWith("Capturing")) return "capturing";
  return "scanning";
}

export function FaceVerifyModal({
  open,
  action,
  actionLabel,
  employeeId,
  employeeName,
  onVerified,
  onClose,
  presenceCheck = false,
  onPresenceResult,
  /** Presence: stop after this many identity fails. Break/clock auto-retries longer. */
  maxIdentityFails = 2,
  noFaceTimeoutSec = 0,
  clearBackdrop = false,
}: Props) {
  // Break/Clock/Prayer: more silent auto-retries before Retry button (was ~5 — too quick).
  const identityFailLimit = presenceCheck
    ? Math.max(1, maxIdentityFails)
    : Math.max(14, maxIdentityFails);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const rafRef = React.useRef<number | null>(null);
  const busyRef = React.useRef(false);
  const scanInFlightRef = React.useRef(false);
  const lastScanAtRef = React.useRef(0);
  const singleFaceStreakRef = React.useRef(0);
  const probeBufferRef = React.useRef<number[][]>([]);
  /** Extra faces seen during capture — reused on submit (no second detect). */
  const frameExtrasRef = React.useRef<number[][]>([]);
  const identityFailsRef = React.useRef(0);
  const lastFaceAtRef = React.useRef<number | null>(null);
  const onPresenceResultRef = React.useRef(onPresenceResult);
  onPresenceResultRef.current = onPresenceResult;

  const [modelsReady, setModelsReady] = React.useState(false);
  const [cameraReady, setCameraReady] = React.useState(false);
  const [status, setStatus] = React.useState("Loading face engine…");
  const [error, setError] = React.useState<string | null>(null);
  const [verifying, setVerifying] = React.useState(false);
  const [guidance, setGuidance] = React.useState<string | null>(null);
  const [verifySuccess, setVerifySuccess] = React.useState(false);
  const verifySuccessRef = React.useRef(false);

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

  const submitScan = React.useCallback(async () => {
    if (
      busyRef.current ||
      scanInFlightRef.current ||
      verifySuccessRef.current ||
      !employeeId ||
      !modelsReady ||
      !cameraReady
    ) {
      return;
    }

    const video = videoRef.current;
    if (!video) return;

    const probeNeed = presenceCheck ? REQUIRED_PROBES_PRESENCE : REQUIRED_PROBES;
    const scanInterval = presenceCheck ? SCAN_INTERVAL_PRESENCE_MS : SCAN_INTERVAL_MS;

    scanInFlightRef.current = true;
    try {
      // Multi-person OK: engine picks primary face for capture; submit tries all faces.
      const scan = await scanVideoFrame(video);

      if (scan.status === "multiple") {
        // Legacy status — treat as keep scanning (no block).
        return;
      }

      if (scan.status === "none") {
        // Brief miss: keep partial buffer so flicker does not restart 0/2.
        if (probeBufferRef.current.length === 0) {
          singleFaceStreakRef.current = 0;
          setError(null);
          setStatus("Look at the camera — scanning automatically…");
          setGuidance(null);
        } else {
          setStatus("Hold still…");
          setGuidance("Face briefly lost — stay in the oval.");
        }
        return;
      }

      // Face visible in frame (Guard no-face timer resets only when face seen)
      lastFaceAtRef.current = performance.now();

      if (scan.status === "adjust") {
        singleFaceStreakRef.current = 0;
        probeBufferRef.current = [];
        setError(null);
        setStatus("Adjusting…");
        setGuidance("Keep your face in frame (edges OK), look straight and hold still.");
        return;
      }

      setError(null);

      const frameDesc = descriptorToJson(scan.descriptor);
      const frameExtras = scan.extraDescriptors?.length
        ? scan.extraDescriptors
        : [];
      if (frameExtras.length) {
        frameExtrasRef.current = [
          ...frameExtrasRef.current,
          ...frameExtras,
        ].slice(-10);
      }

      // Soft distance guidance on primary only. With 2 faces, the large face may
      // be too close while the enrolled person sits on the edge — keep extras.
      const primaryCoverageBad =
        scan.coverage >= COVERAGE_MAX || scan.coverage <= COVERAGE_MIN;
      if (primaryCoverageBad && !frameExtras.length && !frameExtrasRef.current.length) {
        setStatus("Adjust distance…");
        setGuidance(
          scan.coverage >= COVERAGE_MAX
            ? "Too close — move back a little."
            : "Too far — move a little closer.",
        );
        return;
      }

      const prev = probeBufferRef.current[probeBufferRef.current.length - 1];
      const primaryFlipped =
        !!prev && descriptorDistance(prev, frameDesc) > PROBE_FRAME_AGREE_MAX;

      if (primaryFlipped) {
        // 2-person frames often flip who is "largest" — do NOT wipe the buffer
        // or replace it with the other person. Stash this face as an extra.
        frameExtrasRef.current = [
          ...frameExtrasRef.current,
          frameDesc,
          ...frameExtras,
        ].slice(-10);
        setError(null);
        setStatus(
          probeBufferRef.current.length
            ? `Capturing face… (${probeBufferRef.current.length}/${probeNeed})`
            : "Capturing faces…",
        );
        setGuidance("Two faces OK — keep your face visible (edges OK).");
        // Enough stable primary OR extras from multi-face → verify.
        if (
          probeBufferRef.current.length < probeNeed &&
          frameExtrasRef.current.length < 2
        ) {
          return;
        }
      } else if (!primaryCoverageBad) {
        singleFaceStreakRef.current += 1;
        probeBufferRef.current.push(frameDesc);
        if (probeBufferRef.current.length < probeNeed) {
          setError(null);
          setGuidance(
            frameExtrasRef.current.length || frameExtras.length
              ? "Two faces OK — hold still…"
              : "Good — hold still…",
          );
          setStatus(`Capturing face… (${probeBufferRef.current.length}/${probeNeed})`);
          return;
        }
      } else {
        // Primary size off but extras present — wait until we have extras to try.
        if (
          probeBufferRef.current.length < probeNeed &&
          frameExtrasRef.current.length < 2
        ) {
          setStatus("Capturing faces…");
          setGuidance("Keep your face in frame (edges OK).");
          return;
        }
      }

      const bufferCopy = [...probeBufferRef.current];
      const averagedProbe =
        bufferCopy.length > 0
          ? averageDescriptors(bufferCopy)
          : frameDesc;
      const extras = [...frameExtrasRef.current];
      probeBufferRef.current = [];
      frameExtrasRef.current = [];

      setGuidance("Hold still…");
      busyRef.current = true;
      setVerifying(true);
      setStatus("Face detected — verifying…");

      try {
        // Edge safety: one whole-frame collect so a side face is not missed.
        // Server match thresholds unchanged — only more probe candidates.
        const edgeFaces = await collectFaceDescriptorsFromVideo(video);
        const probes = [averagedProbe, ...bufferCopy, ...extras, ...edgeFaces].filter(
          (d, i, arr) =>
            Array.isArray(d) &&
            d.length === 128 &&
            arr.findIndex(
              (x) =>
                Array.isArray(x) &&
                x.length === 128 &&
                descriptorDistance(x, d) < 0.08,
            ) === i,
        );

        const endpoint = presenceCheck
          ? "/api/biometric/presence-check"
          : "/api/biometric/verify";
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            presenceCheck
              ? {
                  employee_id: employeeId,
                  employee_name: employeeName || "",
                  descriptor: averagedProbe,
                  descriptors: probes,
                }
              : {
                  employee_id: employeeId,
                  employee_name: employeeName || "",
                  action,
                  descriptor: averagedProbe,
                  descriptors: probes,
                },
          ),
        });
        const data = await res.json();

        const presenceOk = presenceCheck && (data.atSeat || data.verified);
        const actionOk = !presenceCheck && data.success && data.biometric_token;

        if (presenceOk || actionOk) {
          const token = presenceCheck ? "presence_ok" : String(data.biometric_token);
          verifySuccessRef.current = true;
          setVerifySuccess(true);
          setError(null);
          setGuidance("Face verified successfully.");
          setStatus("Verified");
          window.setTimeout(() => {
            stopCamera();
            if (presenceCheck) {
              onPresenceResultRef.current?.({
                verified: true,
                code: "ok",
                error: null,
                similarity: typeof data.similarity === "number" ? data.similarity : null,
              });
            }
            onVerified(token);
          }, 180);
          return;
        }

        const failCode = String(data.code || "mismatch");
        const failErr = String(data.error || data.reason || "Face not verified");
        const identityFail =
          failCode === "wrong_person" ||
          failCode === "low_similarity" ||
          failCode === "mismatch" ||
          failCode === "no_enrollment" ||
          failCode === "not_enrolled";

        // Enrollment missing — do not spin forever
        if (failCode === "not_enrolled" || failCode === "no_enrollment") {
          verifySuccessRef.current = true;
          setError(failErr);
          setStatus("Not enrolled");
          setGuidance("Ask HR to enroll your face photos, then try again.");
          busyRef.current = false;
          setVerifying(false);
          return;
        }

        if (identityFail) {
          identityFailsRef.current += 1;
          if (identityFailsRef.current >= identityFailLimit) {
            verifySuccessRef.current = true; // stop scan loop
            setError(failErr);
            setStatus("Verification failed");
            setGuidance("Hold still in good light, then use Retry — or Cancel.");
            if (presenceCheck) {
              window.setTimeout(() => {
                stopCamera();
                onPresenceResultRef.current?.({
                  verified: false,
                  code: failCode,
                  error: failErr,
                  similarity:
                    typeof data.similarity === "number" ? data.similarity : null,
                });
                onClose();
              }, 600);
            }
            busyRef.current = false;
            setVerifying(false);
            return;
          }
        }

        singleFaceStreakRef.current = 0;
        probeBufferRef.current = [];
        frameExtrasRef.current = [];
        setError(
          failErr ||
            `Face not verified (${identityFailsRef.current}/${identityFailLimit}). Hold still — retrying…`
        );
        setStatus("Scanning again…");
        lastScanAtRef.current = performance.now() - scanInterval + RETRY_AFTER_FAIL_MS;
      } catch {
        singleFaceStreakRef.current = 0;
        probeBufferRef.current = [];
        frameExtrasRef.current = [];
        setError("Network error. Retrying…");
        setStatus("Scanning again…");
        lastScanAtRef.current = performance.now() - scanInterval + RETRY_AFTER_FAIL_MS;
      } finally {
        busyRef.current = false;
        setVerifying(false);
      }
    } finally {
      scanInFlightRef.current = false;
    }
  }, [
    action,
    cameraReady,
    employeeId,
    employeeName,
    identityFailLimit,
    modelsReady,
    onClose,
    onVerified,
    presenceCheck,
    stopCamera,
  ]);

  const retryAfterFail = React.useCallback(() => {
    identityFailsRef.current = 0;
    verifySuccessRef.current = false;
    setVerifySuccess(false);
    setError(null);
    setGuidance(null);
    probeBufferRef.current = [];
    frameExtrasRef.current = [];
    singleFaceStreakRef.current = 0;
    busyRef.current = false;
    scanInFlightRef.current = false;
    setStatus("Look at the camera — scanning automatically…");
    lastScanAtRef.current = performance.now() - 1000;
  }, []);

  React.useEffect(() => {
    if (!open) {
      stopCamera();
      setModelsReady(false);
      setVerifying(false);
      setError(null);
      setGuidance(null);
      verifySuccessRef.current = false;
      setVerifySuccess(false);
      identityFailsRef.current = 0;
      lastFaceAtRef.current = null;
      singleFaceStreakRef.current = 0;
      probeBufferRef.current = [];
      frameExtrasRef.current = [];
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
        setError(null);

        // Paint FaceVerify card first (2 frames), THEN open camera — sync UI ↔ LED.
        await new Promise<void>((r) =>
          window.requestAnimationFrame(() => window.requestAnimationFrame(() => r())),
        );
        if (cancelled) return;

        const modelsPromise = ensureFaceModelsLoaded();

        let stream: MediaStream | null = null;
        if (presenceCheck) {
          // Fresh open after UI is visible — no early prewarm LED against blank page.
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: true,
              audio: false,
            });
          } catch {
            stream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: "user" },
              audio: false,
            });
          }
        } else {
          // 640×480 is enough for TinyFaceDetector and opens/scans faster than 720p.
          const videoConstraints: MediaTrackConstraints = {
            facingMode: "user",
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 24, max: 30 },
          };
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: videoConstraints,
              audio: false,
            });
          } catch {
            stream = await navigator.mediaDevices.getUserMedia({
              video: true,
              audio: false,
            });
          }
        }

        if (!stream) {
          setError("Camera could not start. Check permission and retry.");
          setStatus("Camera unavailable");
          return;
        }

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;

        let video = videoRef.current;
        for (let i = 0; i < 40 && !video; i++) {
          await new Promise((r) => window.setTimeout(r, 16));
          if (cancelled) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          video = videoRef.current;
        }
        if (!video) {
          setError("Camera preview failed to load.");
          setStatus("Camera unavailable");
          stream.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
          return;
        }

        video.srcObject = stream;
        video.muted = true;
        video.playsInline = true;
        await video.play().catch(() => undefined);

        if (cancelled) return;
        setCameraReady(true);
        setStatus("Look at the camera — scanning…");

        await modelsPromise;
        if (cancelled) return;
        setModelsReady(true);
      } catch (err) {
        const name = err instanceof DOMException ? err.name : "";
        const msg =
          name === "NotAllowedError" || name === "PermissionDeniedError"
            ? "Camera access denied. Allow camera permission and retry."
            : name === "NotFoundError"
              ? "No camera found on this PC."
              : name === "NotReadableError"
                ? "Camera is in use by another app. Close it and retry."
                : "Camera could not start. Check permission and retry.";
        setError(msg);
        setStatus("Camera unavailable");
      }
    })();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [open, stopCamera, presenceCheck]);

  React.useEffect(() => {
    if (!open || !modelsReady || !cameraReady) return;

    const scanInterval = presenceCheck ? SCAN_INTERVAL_PRESENCE_MS : SCAN_INTERVAL_MS;
    lastScanAtRef.current = performance.now() - scanInterval;
    void submitScan();

    let active = true;

    const tick = (now: number) => {
      if (!active) return;
      if (now - lastScanAtRef.current >= scanInterval) {
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
  }, [open, modelsReady, cameraReady, presenceCheck, submitScan]);

  // Guard presence only: no face in frame for N seconds → auto-fail (Break omits this prop)
  React.useEffect(() => {
    if (!open || !presenceCheck || !noFaceTimeoutSec || noFaceTimeoutSec <= 0) return;
    if (!cameraReady || !modelsReady) return;
    if (lastFaceAtRef.current == null) lastFaceAtRef.current = performance.now();

    const limitMs = noFaceTimeoutSec * 1000;
    const id = window.setInterval(() => {
      if (verifySuccessRef.current || busyRef.current) return;
      const last = lastFaceAtRef.current;
      if (last == null) return;
      if (performance.now() - last < limitMs) return;
      verifySuccessRef.current = true;
      setError("No face in frame");
      setStatus("No face — closing…");
      setGuidance(null);
      window.setTimeout(() => {
        stopCamera();
        onPresenceResultRef.current?.({
          verified: false,
          code: "no_face",
          error: `No face detected for ${noFaceTimeoutSec} seconds`,
          similarity: null,
        });
        onClose();
      }, 400);
    }, 500);

    return () => window.clearInterval(id);
  }, [
    open,
    presenceCheck,
    noFaceTimeoutSec,
    cameraReady,
    modelsReady,
    onClose,
    stopCamera,
  ]);

  if (!open) return null;
  // Embed SSR must still paint the card — returning null left a blank white WebView.

  const captureMatch = status.match(/\((\d+)\/(\d+)\)/);
  const captureCurrent = captureMatch ? Number(captureMatch[1]) : 0;
  const captureTotal = captureMatch
    ? Number(captureMatch[2])
    : presenceCheck
      ? REQUIRED_PROBES_PRESENCE
      : REQUIRED_PROBES;
  const scanMode = resolveScanMode({
    verifySuccess,
    verifying,
    cameraReady,
    modelsReady,
    status,
    guidance,
  });
  const hudStatus =
    verifySuccess
      ? "VERIFICATION COMPLETE"
      : status === "Look at the camera — scanning automatically…"
        ? "SCANNING FACE"
        : status.replace(/…/g, "").toUpperCase();

  const overlay = (
    <div
      className={[modalStyles.overlay, clearBackdrop ? modalStyles.overlayClear : ""]
        .filter(Boolean)
        .join(" ")}
      data-hrm-modal-overlay={clearBackdrop ? undefined : true}
      data-hrm-face-embed={clearBackdrop ? "1" : undefined}
    >
      <div
        className={[
          modalStyles.modal,
          clearBackdrop ? modalStyles.modalEmbed : "",
          verifySuccess ? modalStyles.modalSuccess : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div className={modalStyles.title}>Face Verification</div>
        <div
          className={[modalStyles.subtitle, verifySuccess ? modalStyles.subtitleSuccess : ""]
            .filter(Boolean)
            .join(" ")}
        >
          Verify to <strong>{actionLabel}</strong>
        </div>
        <div className={modalStyles.employeeLine}>
          <strong>{employeeName || "Employee"}</strong>
          {employeeId ? ` · ID ${employeeId}` : ""}
        </div>

        <div
          className={[modalStyles.scanWrap, verifySuccess ? modalStyles.scanWrapSuccess : ""]
            .filter(Boolean)
            .join(" ")}
        >
          <FaceScanViewport
            videoRef={videoRef}
            className={modalStyles.scanViewport}
            mode={scanMode}
            statusLine={hudStatus}
            subjectName={employeeName || undefined}
            subjectId={employeeId || undefined}
            captureCurrent={captureCurrent}
            captureTotal={captureTotal}
            loadingLabel={
              !cameraReady ? "Starting camera…" : !modelsReady ? "Loading face engine…" : undefined
            }
            aspectRatio="5 / 4"
          />
        </div>

        <div
          className={[modalStyles.statusLine, verifySuccess ? modalStyles.statusLineSuccess : ""]
            .filter(Boolean)
            .join(" ")}
        >
          {status}
        </div>

        {guidance && !error && (
          <div
            className={[
              modalStyles.guidance,
              verifySuccess ? modalStyles.guidanceSuccess : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {guidance}
          </div>
        )}
        {error && <div className={modalStyles.error}>{error}</div>}

        <div className={modalStyles.actions}>
          {!presenceCheck &&
          !verifySuccess &&
          status === "Verification failed" ? (
            <button
              type="button"
              onClick={retryAfterFail}
              className={modalStyles.cancelBtn}
              style={{ borderColor: "#86efac", color: "#166534", background: "#f0fdf4" }}
            >
              Retry
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              // Always stop camera + close immediately — never leave modal stuck
              stopCamera();
              busyRef.current = false;
              scanInFlightRef.current = false;
              verifySuccessRef.current = true;
              onClose();
            }}
            className={modalStyles.cancelBtn}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );

  // Guard WebView embed: paint inline (works on SSR + client). No portal.
  if (clearBackdrop) return overlay;
  if (typeof document === "undefined") return null;
  return createPortal(overlay, document.body);
}
