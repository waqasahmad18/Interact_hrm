"use client";

import React from "react";
import { createPortal } from "react-dom";
import {
  APP_CONFIRM_EVENT,
  settleAppConfirm,
  type AppConfirmRequest,
} from "@/lib/app-confirm";
import styles from "./app-confirm-host.module.css";

export function AppConfirmHost() {
  const [request, setRequest] = React.useState<AppConfirmRequest | null>(null);

  React.useEffect(() => {
    function onConfirm(e: Event) {
      const detail = (e as CustomEvent<AppConfirmRequest>).detail;
      if (!detail?.id) return;
      setRequest(detail);
    }
    window.addEventListener(APP_CONFIRM_EVENT, onConfirm);
    return () => window.removeEventListener(APP_CONFIRM_EVENT, onConfirm);
  }, []);

  React.useEffect(() => {
    if (!request) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [request]);

  function close(value: boolean) {
    if (!request) return;
    const id = request.id;
    setRequest(null);
    settleAppConfirm(id, value);
  }

  if (!request || typeof document === "undefined") return null;

  const variant = request.variant ?? "default";
  const isDanger = variant === "danger";

  return createPortal(
    <div
      className={styles.backdrop}
      data-hrm-modal-overlay
      onClick={() => close(false)}
      role="presentation"
    >
      <div
        className={`${styles.card} ${isDanger ? styles.cardDanger : ""}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="app-confirm-title"
        aria-describedby="app-confirm-message"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="app-confirm-title"
          className={`${styles.title} ${isDanger ? styles.titleDanger : ""}`}
        >
          {request.title || (isDanger ? "Confirm delete" : "Please confirm")}
        </h2>
        <p id="app-confirm-message" className={styles.message}>
          {request.message}
        </p>
        <div className={styles.actions}>
          <button type="button" className={styles.btn} onClick={() => close(false)}>
            {request.cancelLabel || "Cancel"}
          </button>
          <button
            type="button"
            className={`${styles.btn} ${isDanger ? styles.btnDanger : styles.btnPrimary}`}
            onClick={() => close(true)}
          >
            {request.confirmLabel || (isDanger ? "Delete" : "OK")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
