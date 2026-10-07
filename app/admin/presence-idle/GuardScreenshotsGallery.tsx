"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { FaEye, FaEyeSlash } from "react-icons/fa";
import adminStyles from "../admin-page.module.css";
import styles from "./presence-idle.module.css";
import { toastError } from "@/lib/app-toast";

type Props = {
  open: boolean;
  onClose: () => void;
};

/** Secret unlock modal — no screenshots wording. Opens gallery after password. */
export default function GuardScreenshotsGallery({ open, onClose }: Props) {
  const router = useRouter();
  const [password, setPassword] = React.useState("");
  const [showPw, setShowPw] = React.useState(false);
  const [unlocking, setUnlocking] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (!open) {
      setPassword("");
      setShowPw(false);
      return;
    }
    const t = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function unlock() {
    if (!password || unlocking) return;
    setUnlocking(true);
    try {
      const res = await fetch("/api/admin/guard-screenshots/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!data.success) {
        toastError(data.error || "Invalid password");
        return;
      }
      setPassword("");
      onClose();
      router.push("/admin/guard-screenshots");
    } catch {
      toastError("Network error");
    } finally {
      setUnlocking(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className={styles.modalBackdrop}
      role="dialog"
      aria-modal="true"
      aria-label="Enter password"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.secretUnlockPanel}>
        <label htmlFor="secret-unlock-pw" className={styles.secretUnlockLabel}>
          Enter password
        </label>
        <div className={styles.passwordWrap}>
          <input
            ref={inputRef}
            id="secret-unlock-pw"
            type={showPw ? "text" : "password"}
            autoComplete="off"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void unlock();
            }}
            className={styles.passwordInput}
          />
          <button
            type="button"
            className={styles.passwordToggle}
            onClick={() => setShowPw((v) => !v)}
            aria-label={showPw ? "Hide password" : "Show password"}
          >
            {showPw ? <FaEyeSlash /> : <FaEye />}
          </button>
        </div>
        <div className={styles.modalActions}>
          <button
            type="button"
            className={adminStyles.btnPrimary}
            disabled={unlocking || !password}
            onClick={() => void unlock()}
          >
            {unlocking ? "…" : "Enter"}
          </button>
          <button
            type="button"
            className={adminStyles.btnSecondary}
            disabled={unlocking}
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
