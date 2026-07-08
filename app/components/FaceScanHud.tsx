"use client";

import React from "react";
import styles from "./face-scan-hud.module.css";

export type FaceScanMode =
  | "initializing"
  | "scanning"
  | "capturing"
  | "verifying"
  | "success"
  | "blocked"
  | "adjust";

type FaceScanHudProps = {
  mode: FaceScanMode;
  statusLine?: string;
  subjectName?: string;
  subjectId?: string;
  captureCurrent?: number;
  captureTotal?: number;
  loadingLabel?: string;
};

const PINK_RGB = [236, 72, 153] as const;
const GREEN_RGB = [34, 197, 94] as const;

export function verifyProgressForMode(
  mode: FaceScanMode,
  captureCurrent: number,
  captureTotal: number,
): number {
  if (mode === "success") return 1;
  if (mode === "verifying") return 0.88;
  if (mode === "capturing") {
    const slice = captureTotal > 0 ? captureCurrent / captureTotal : 0;
    return 0.35 + slice * 0.45;
  }
  if (mode === "scanning") return 0.22;
  if (mode === "adjust") return 0.14;
  return 0;
}

export function scanColorFromProgress(progress: number): string {
  const p = Math.min(1, Math.max(0, progress));
  const r = Math.round(PINK_RGB[0] + (GREEN_RGB[0] - PINK_RGB[0]) * p);
  const g = Math.round(PINK_RGB[1] + (GREEN_RGB[1] - PINK_RGB[1]) * p);
  const b = Math.round(PINK_RGB[2] + (GREEN_RGB[2] - PINK_RGB[2]) * p);
  return `rgb(${r}, ${g}, ${b})`;
}

export function FaceScanHud({
  mode,
  statusLine,
  subjectName,
  subjectId,
  captureCurrent = 0,
  captureTotal = 3,
  loadingLabel = "Initializing sensors…",
}: FaceScanHudProps) {
  const progress = verifyProgressForMode(mode, captureCurrent, captureTotal);
  const scanColor = scanColorFromProgress(progress);

  const hudClass = [
    styles.hud,
    mode === "blocked" ? styles.hudBlocked : "",
    mode === "success" ? styles.hudSuccess : "",
    mode === "initializing" ? styles.hudInitializing : "",
  ]
    .filter(Boolean)
    .join(" ");

  const showStatus = mode !== "initializing";
  const progressWidth = Math.round(progress * 100);

  const defaultStatus =
    mode === "success"
      ? "VERIFICATION COMPLETE"
      : mode === "blocked"
        ? "MULTI-SUBJECT BLOCK"
        : mode === "verifying"
          ? "VERIFYING"
          : mode === "capturing"
            ? `CAPTURING ${captureCurrent}/${captureTotal}`
            : mode === "adjust"
              ? "CENTER YOUR FACE"
              : "SCANNING";

  return (
    <>
      {mode === "initializing" && (
        <div className={styles.loadingPanel}>
          <div className={styles.loadingLabel}>{loadingLabel}</div>
        </div>
      )}

      <div
        className={hudClass}
        style={{ "--scan-color": scanColor, "--scan-progress": progress } as React.CSSProperties}
      >
        {mode === "success" && <div className={styles.successVeil} />}
        {mode === "blocked" && <div className={styles.blockedVeil} />}

        {showStatus && (
          <div className={styles.hudBottom}>
            <div className={styles.hudStatus}>{statusLine || defaultStatus}</div>
            {mode !== "blocked" && mode !== "success" && (
              <div className={styles.progressTrack}>
                <div className={styles.progressFill} style={{ width: `${progressWidth}%` }} />
              </div>
            )}
            {mode === "success" && (
              <div className={styles.successCheck} aria-hidden="true">
                ✓
              </div>
            )}
            {(subjectName || subjectId) && mode !== "success" && (
              <div className={styles.hudSubject}>
                {subjectName ? <span>{subjectName}</span> : null}
                {subjectId ? <span>ID {subjectId}</span> : null}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

type FaceScanViewportProps = FaceScanHudProps & {
  videoRef?: React.Ref<HTMLVideoElement>;
  className?: string;
  aspectRatio?: string;
  autoPlay?: boolean;
  onVideoLoaded?: () => void;
};

export function FaceScanViewport({
  videoRef,
  className,
  aspectRatio = "4 / 3",
  autoPlay = false,
  onVideoLoaded,
  ...hudProps
}: FaceScanViewportProps) {
  return (
    <div
      className={[styles.viewport, className].filter(Boolean).join(" ")}
      style={{ aspectRatio }}
    >
      <video
        ref={videoRef}
        className={styles.video}
        playsInline
        muted
        autoPlay={autoPlay}
        onLoadedMetadata={(e) => {
          const v = e.currentTarget;
          if (v.videoWidth > 0) onVideoLoaded?.();
        }}
      />
      <FaceScanHud {...hudProps} />
    </div>
  );
}
