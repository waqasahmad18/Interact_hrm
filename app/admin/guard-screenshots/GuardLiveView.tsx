"use client";

import React from "react";
import adminStyles from "../admin-page.module.css";
import styles from "../presence-idle/presence-idle.module.css";
import { toastError, toastSuccess } from "@/lib/app-toast";

type ProfileLite = {
  employeeId: string;
  name: string;
  pseudonym: string;
  department: string;
  health: "healthy" | "stale" | "offline";
};

type FrameMeta = {
  employeeId: string;
  updatedAt: string;
  size: number;
  name: string | null;
  pseudonym: string | null;
};

type Props = {
  profiles: ProfileLite[];
  onClose: () => void;
};

function frameUrl(employeeId: string, updatedAt: string) {
  // Bust cache only when the server frame actually changed — avoids useless reloads.
  return `/api/admin/guard-live/frame?employeeId=${encodeURIComponent(employeeId)}&v=${encodeURIComponent(updatedAt)}`;
}

/**
 * Keep the last good frame visible while the next JPEG loads (no blank blink).
 */
function SmoothLiveImg({
  employeeId,
  updatedAt,
  alt,
  className,
}: {
  employeeId: string;
  updatedAt: string;
  alt: string;
  className: string;
}) {
  const [displaySrc, setDisplaySrc] = React.useState<string | null>(null);
  const lastAtRef = React.useRef<string>("");
  const loadGen = React.useRef(0);

  React.useEffect(() => {
    if (!updatedAt || updatedAt === lastAtRef.current) return;
    const url = frameUrl(employeeId, updatedAt);
    const gen = ++loadGen.current;
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      if (gen !== loadGen.current) return;
      lastAtRef.current = updatedAt;
      setDisplaySrc(url);
    };
    img.onerror = () => {
      /* keep previous frame */
    };
    img.src = url;
  }, [employeeId, updatedAt]);

  if (!displaySrc) {
    return <span className={styles.liveTileWait}>Waiting for stream…</span>;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={displaySrc} alt={alt} className={className} decoding="async" />
  );
}

export default function GuardLiveView({ profiles, onClose }: Props) {
  const [running, setRunning] = React.useState(false);
  const [frames, setFrames] = React.useState<Record<string, FrameMeta>>({});
  const [focusId, setFocusId] = React.useState<string | null>(null);
  const [starting, setStarting] = React.useState(false);
  const framesRef = React.useRef(frames);
  framesRef.current = frames;

  const stop = React.useCallback(async () => {
    try {
      await fetch("/api/admin/guard-live", { method: "DELETE" });
    } catch {
      /* ignore */
    }
    setRunning(false);
    setFocusId(null);
  }, []);

  const start = React.useCallback(async () => {
    setStarting(true);
    try {
      const res = await fetch("/api/admin/guard-live", { method: "POST" });
      const data = await res.json();
      if (!data.success) {
        toastError(data.error || "Could not start live view");
        return;
      }
      setRunning(true);
      toastSuccess("Live view on — agents join within a few seconds");
    } catch {
      toastError("Network error starting live view");
    } finally {
      setStarting(false);
    }
  }, []);

  React.useEffect(() => {
    void start();
    return () => {
      void stop();
    };
  }, [start, stop]);

  React.useEffect(() => {
    if (!running) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      try {
        const q = focusId
          ? `?focus=${encodeURIComponent(focusId)}`
          : "?focus=";
        const res = await fetch(`/api/admin/guard-live${q}`, {
          cache: "no-store",
        });
        const data = await res.json();
        if (cancelled) return;
        if (res.status === 401 || data.locked) {
          toastError("Gallery locked");
          onClose();
          return;
        }
        if (!data.success || !data.session?.active) {
          setRunning(false);
          return;
        }
        const nextList = (data.frames || []) as FrameMeta[];
        setFrames((prev) => {
          const next: Record<string, FrameMeta> = { ...prev };
          let changed = false;
          for (const f of nextList) {
            const old = prev[f.employeeId];
            if (!old || old.updatedAt !== f.updatedAt || old.size !== f.size) {
              next[f.employeeId] = f;
              changed = true;
            }
          }
          return changed ? next : prev;
        });
      } catch {
        /* retry */
      } finally {
        if (!cancelled) {
          // Slightly slower grid poll = less thrash; popup stays snappier.
          const delay = focusId ? 400 : 700;
          timer = setTimeout(() => void poll(), delay);
        }
      }
    }

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [running, focusId, onClose]);

  async function handleClose() {
    await stop();
    onClose();
  }

  const focusProfile = profiles.find((p) => p.employeeId === focusId) || null;
  const focusMeta = focusId ? frames[focusId] : null;

  return (
    <div className={styles.galleryWrap}>
      <div className={styles.detailHeader}>
        <button
          type="button"
          className={adminStyles.btnSecondary}
          onClick={() => void handleClose()}
        >
          ← Profiles
        </button>
        <div>
          <h2 className={styles.detailTitle}>Live screens</h2>
          <p className={styles.detailSub}>
            All installed agents stream here. Click a tile for a larger view.
            Needs Guard <strong>1.2.48+</strong>.
          </p>
        </div>
        <button
          type="button"
          className={adminStyles.btnSecondary}
          disabled={starting}
          onClick={() => void (running ? stop() : start())}
        >
          {starting ? "Starting…" : running ? "Pause stream" : "Resume stream"}
        </button>
      </div>

      {!running ? (
        <p className={styles.tip}>Live stream paused. Resume to watch again.</p>
      ) : (
        <div className={styles.liveGrid}>
          {profiles.map((p) => {
            const meta = frames[p.employeeId];
            return (
              <button
                key={p.employeeId}
                type="button"
                className={styles.liveTile}
                onClick={() => setFocusId(p.employeeId)}
              >
                <div className={styles.liveTileHead}>
                  <span className={styles.liveTileName}>{p.name}</span>
                  <span
                    className={
                      p.health === "healthy"
                        ? styles.healthOk
                        : p.health === "stale"
                          ? styles.healthWarn
                          : styles.healthBad
                    }
                  >
                    {p.health === "healthy"
                      ? "Online"
                      : p.health === "stale"
                        ? "Stale"
                        : "Offline"}
                  </span>
                </div>
                <div className={styles.liveTileStage}>
                  {meta ? (
                    <SmoothLiveImg
                      employeeId={p.employeeId}
                      updatedAt={meta.updatedAt}
                      alt={p.name}
                      className={styles.liveTileImg}
                    />
                  ) : (
                    <span className={styles.liveTileWait}>
                      Waiting for stream…
                    </span>
                  )}
                </div>
                {p.pseudonym || p.department ? (
                  <span className={styles.liveTileMeta}>
                    {[p.pseudonym, p.department].filter(Boolean).join(" · ")}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      )}

      {focusId ? (
        <div
          className={styles.modalBackdrop}
          role="dialog"
          aria-modal="true"
          onClick={() => setFocusId(null)}
        >
          <div
            className={styles.modalPanel}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalActions}>
              <strong style={{ flex: 1, fontSize: 14 }}>
                {focusProfile?.name || `Employee ${focusId}`}
                {focusProfile?.pseudonym
                  ? ` · ${focusProfile.pseudonym}`
                  : ""}
              </strong>
              <button
                type="button"
                className={adminStyles.btnSecondary}
                onClick={() => setFocusId(null)}
              >
                Close
              </button>
            </div>
            <div className={styles.modalBody}>
              {focusMeta ? (
                <SmoothLiveImg
                  employeeId={focusId}
                  updatedAt={focusMeta.updatedAt}
                  alt="Live screen"
                  className={styles.modalImg}
                />
              ) : (
                <p className={styles.tip}>Waiting for live frames…</p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
