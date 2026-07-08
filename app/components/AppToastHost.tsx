"use client";

import React from "react";
import { FaCheckCircle, FaExclamationCircle, FaInfoCircle } from "react-icons/fa";
import {
  APP_TOAST_EVENT,
  type AppToastPayload,
  type AppToastVariant,
} from "@/lib/app-toast";
import styles from "./app-toast-host.module.css";

type ToastItem = AppToastPayload & {
  key: string;
  durationMs: number;
};

const DEFAULT_MS = 3000;

function variantIcon(variant: AppToastVariant) {
  if (variant === "success") return <FaCheckCircle />;
  if (variant === "error") return <FaExclamationCircle />;
  return <FaInfoCircle />;
}

function variantTitle(variant: AppToastVariant) {
  if (variant === "success") return "Success";
  if (variant === "error") return "Error";
  return "Notice";
}

function ToastCard({
  toast,
  onDismiss,
}: {
  toast: ToastItem;
  onDismiss: () => void;
}) {
  const variant = toast.variant ?? "success";
  const [progress, setProgress] = React.useState(100);
  const [hovered, setHovered] = React.useState(false);
  const remainingRef = React.useRef(toast.durationMs);
  const lastTickRef = React.useRef(Date.now());
  const timerRef = React.useRef<number | null>(null);
  const rafRef = React.useRef<number | null>(null);

  const clearTimer = React.useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const scheduleDismiss = React.useCallback(() => {
    clearTimer();
    timerRef.current = window.setTimeout(() => onDismiss(), remainingRef.current);
  }, [clearTimer, onDismiss]);

  React.useEffect(() => {
    lastTickRef.current = Date.now();
    scheduleDismiss();

    const tick = () => {
      if (!hovered) {
        const now = Date.now();
        const delta = now - lastTickRef.current;
        lastTickRef.current = now;
        remainingRef.current = Math.max(0, remainingRef.current - delta);
        setProgress((remainingRef.current / toast.durationMs) * 100);
        if (remainingRef.current <= 0) return;
      } else {
        lastTickRef.current = Date.now();
      }
      rafRef.current = window.requestAnimationFrame(tick);
    };
    rafRef.current = window.requestAnimationFrame(tick);

    return () => {
      clearTimer();
      if (rafRef.current != null) window.cancelAnimationFrame(rafRef.current);
    };
  }, [hovered, scheduleDismiss, clearTimer, toast.durationMs]);

  return (
    <div
      className={`${styles.toast} ${styles.toastShell} ${
        variant === "success"
          ? styles.toastSuccess
          : variant === "error"
            ? styles.toastError
            : styles.toastInfo
      }`}
      role="status"
      aria-live="polite"
      onMouseEnter={() => {
        setHovered(true);
        clearTimer();
      }}
      onMouseLeave={() => {
        setHovered(false);
        lastTickRef.current = Date.now();
        scheduleDismiss();
      }}
    >
      <div className={styles.toastInner}>
        <span
          className={`${styles.iconWrap} ${
            variant === "success"
              ? styles.iconSuccess
              : variant === "error"
                ? styles.iconError
                : styles.iconInfo
          }`}
        >
          {variantIcon(variant)}
        </span>
        <div className={styles.body}>
          <p
            className={`${styles.title} ${
              variant === "success"
                ? styles.titleSuccess
                : variant === "error"
                  ? styles.titleError
                  : ""
            }`}
          >
            {toast.title || variantTitle(variant)}
          </p>
          <p className={styles.message}>{toast.message}</p>
        </div>
        <button
          type="button"
          className={styles.dismiss}
          aria-label="Dismiss"
          onClick={onDismiss}
        >
          ×
        </button>
        <div
          className={`${styles.progress} ${
            variant === "success"
              ? styles.progressSuccess
              : variant === "error"
                ? styles.progressError
                : styles.progressInfo
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

export function AppToastHost() {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);

  React.useEffect(() => {
    function onToast(e: Event) {
      const detail = (e as CustomEvent<AppToastPayload>).detail;
      if (!detail?.message) return;
      const key = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const item: ToastItem = {
        ...detail,
        key,
        durationMs: detail.durationMs ?? DEFAULT_MS,
      };
      setToasts((prev) => [item, ...prev].slice(0, 4));
    }
    window.addEventListener(APP_TOAST_EVENT, onToast);
    return () => window.removeEventListener(APP_TOAST_EVENT, onToast);
  }, []);

  if (!toasts.length) return null;

  return (
    <div className={styles.toastStack} aria-live="polite">
      {toasts.map((t) => (
        <ToastCard
          key={t.key}
          toast={t}
          onDismiss={() => setToasts((prev) => prev.filter((x) => x.key !== t.key))}
        />
      ))}
    </div>
  );
}
