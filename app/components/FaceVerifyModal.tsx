"use client";

import React from "react";
import { createPortal } from "react-dom";
import type { BiometricAction } from "@/lib/face-types";
import {
  averageDescriptors,
  countFacesInVideo,
  descriptorToJson,
  ensureFaceModelsLoaded,
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

const SCAN_INTERVAL_MS = 280;
const RETRY_AFTER_FAIL_MS = 200;
// Good consecutive frames whose descriptors are averaged into one stable probe.
// Averaging cancels per-frame noise (pose, lighting, glasses glare, blur) so the
// match is far more reliable — and harder to fool — than a single snapshot.
// This is a big accuracy gain that costs almost nothing (pure math).
const REQUIRED_PROBES = 4;

function resolveScanMode(input: {
  verifySuccess: boolean;
  multipleFaces: boolean;
  verifying: boolean;
  cameraReady: boolean;
  modelsReady: boolean;
  status: string;
  guidance: string | null;
}): FaceScanMode {
  if (input.verifySuccess) return "success";
  if (input.multipleFaces) return "blocked";
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
  maxIdentityFails = 2,
  noFaceTimeoutSec = 0,
  clearBackdrop = false,
}: Props) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const rafRef = React.useRef<number | null>(null);
  const busyRef = React.useRef(false);
  const scanInFlightRef = React.useRef(false);
  const lastScanAtRef = React.useRef(0);
  const singleFaceStreakRef = React.useRef(0);
  const multiFaceStreakRef = React.useRef(0);
  const probeBufferRef = React.useRef<number[][]>([]);
  const identityFailsRef = React.useRef(0);
  const lastFaceAtRef = React.useRef<number | null>(null);
  const onPresenceResultRef = React.useRef(onPresenceResult);
  onPresenceResultRef.current = onPresenceResult;

  const [modelsReady, setModelsReady] = React.useState(false);
  const [cameraReady, setCameraReady] = React.useState(false);
  const [status, setStatus] = React.useState("Loading face engine…");
  const [error, setError] = React.useState<string | null>(null);
  const [verifying, setVerifying] = React.useState(false);
  const [multipleFaces, setMultipleFaces] = React.useState(false);
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

  const blockMultipleFaces = React.useCallback((count: number) => {
    singleFaceStreakRef.current = 0;
    probeBufferRef.current = [];
    setMultipleFaces(true);
    setError(null);
    setGuidance("Only one person should be in the frame — others please step out of camera view.");
    setStatus(
      count >= 2
        ? `${count} faces in frame — clock action blocked.`
        : "Multiple faces in the frame — clock action blocked."
    );
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

    scanInFlightRef.current = true;
    try {
      const scan = await scanVideoFrame(video);

      if (scan.status === "multiple") {
        // Require two consecutive multi-face frames before blocking. A single
        // flicker / momentary background ghost must not slam up the red wall —
        // this keeps the experience smooth and avoids false blocks on one
        // person.
        multiFaceStreakRef.current += 1;
        if (multiFaceStreakRef.current >= 2) {
          blockMultipleFaces(scan.count);
        }
        return;
      }

      // Any non-multiple result clears the multi-face streak immediately.
      multiFaceStreakRef.current = 0;

      if (scan.status === "none") {
        singleFaceStreakRef.current = 0;
        probeBufferRef.current = [];
        if (multipleFaces) setMultipleFaces(false);
        setError(null);
        setStatus("Look at the camera — scanning automatically…");
        setGuidance(null);
        return;
      }

      // Face visible in frame (Guard no-face timer resets only when face seen)
      lastFaceAtRef.current = performance.now();

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
                }
              : {
                  employee_id: employeeId,
                  employee_name: employeeName || "",
                  action,
                  descriptor: averagedProbe,
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
          }, 750);
          return;
        }

        const failCode = String(data.code || "mismatch");
        const failErr = String(data.error || data.reason || "Face not verified");
        const identityFail =
          failCode === "wrong_person" ||
          failCode === "low_similarity" ||
          failCode === "mismatch" ||
          failCode === "no_enrollment";

        if (presenceCheck && identityFail) {
          identityFailsRef.current += 1;
          if (identityFailsRef.current >= Math.max(1, maxIdentityFails)) {
            verifySuccessRef.current = true; // stop scan loop
            setError(failErr);
            setStatus("Verification failed");
            window.setTimeout(() => {
              stopCamera();
              onPresenceResultRef.current?.({
                verified: false,
                code: failCode,
                error: failErr,
                similarity: typeof data.similarity === "number" ? data.similarity : null,
              });
              onClose();
            }, 600);
            return;
          }
        }

        singleFaceStreakRef.current = 0;
        probeBufferRef.current = [];
        setError(failErr || "Face not verified. Hold still — retrying…");
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
    maxIdentityFails,
    modelsReady,
    multipleFaces,
    onClose,
    onVerified,
    presenceCheck,
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
      verifySuccessRef.current = false;
      setVerifySuccess(false);
      identityFailsRef.current = 0;
      lastFaceAtRef.current = null;
      singleFaceStreakRef.current = 0;
      multiFaceStreakRef.current = 0;
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
        setError(null);

        const modelsPromise = ensureFaceModelsLoaded();

        // Presence / Guard: lighter stream so camera opens fast.
        // Break keeps higher ideal resolution for enrollment-quality frames.
        const videoConstraints: MediaTrackConstraints = presenceCheck
          ? {
              facingMode: "user",
              width: { ideal: 640 },
              height: { ideal: 480 },
              frameRate: { ideal: 20, max: 30 },
            }
          : {
              facingMode: "user",
              width: { ideal: 1280 },
              height: { ideal: 720 },
              frameRate: { ideal: 24, max: 30 },
            };

        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: videoConstraints,
            audio: false,
          });
        } catch {
          // Fallback if ideal constraints fail (common in WebView2)
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        }

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;

        video.srcObject = stream;
        video.muted = true;
        video.playsInline = true;
        await video.play().catch(() => undefined);

        // Don't hang forever on loadeddata — show preview as soon as we can
        await Promise.race([
          new Promise<void>((resolve) => {
            if (video.readyState >= 2) resolve();
            else {
              const done = () => resolve();
              video.onloadeddata = done;
              video.onloadedmetadata = done;
            }
          }),
          new Promise<void>((resolve) => window.setTimeout(resolve, 800)),
        ]);

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
  if (typeof document === "undefined") return null;

  const captureMatch = status.match(/\((\d+)\/(\d+)\)/);
  const captureCurrent = captureMatch ? Number(captureMatch[1]) : 0;
  const captureTotal = captureMatch ? Number(captureMatch[2]) : REQUIRED_PROBES;
  const scanMode = resolveScanMode({
    verifySuccess,
    multipleFaces,
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

  return createPortal(
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

        {multipleFaces && (
          <div className={modalStyles.alertBlocked} role="alert">
            Multiple faces in the frame
            <div className={modalStyles.alertBlockedDetail}>
              {actionLabel} is blocked. Only one person should be visible — remove others from
              camera view.
            </div>
          </div>
        )}

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
              multipleFaces ? modalStyles.guidanceBlocked : "",
              verifySuccess ? modalStyles.guidanceSuccess : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {guidance}
          </div>
        )}
        {error && !multipleFaces && <div className={modalStyles.error}>{error}</div>}

        <div className={modalStyles.actions}>
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
    </div>,
    document.body
  );
}
