"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { FaEye, FaEyeSlash } from "react-icons/fa";
import adminStyles from "../admin-page.module.css";
import styles from "./presence-idle.module.css";
import { toastError, toastSuccess } from "@/lib/app-toast";

/** Unlock gate on Presence/Idle — gallery data lives on /admin/guard-screenshots. */
export default function GuardScreenshotsGallery() {
  const router = useRouter();
  const [checking, setChecking] = React.useState(true);
  const [unlocked, setUnlocked] = React.useState(false);
  const [password, setPassword] = React.useState("");
  const [showPw, setShowPw] = React.useState(false);
  const [unlocking, setUnlocking] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/guard-screenshots/unlock", {
          cache: "no-store",
        });
        const data = await res.json();
        if (!cancelled) setUnlocked(!!data.unlocked);
      } catch {
        if (!cancelled) setUnlocked(false);
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function unlock() {
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
      toastSuccess("Gallery unlocked");
      setPassword("");
      router.push("/admin/guard-screenshots");
    } catch {
      toastError("Network error");
    } finally {
      setUnlocking(false);
    }
  }

  return (
    <div className={styles.block}>
      <h3 className={styles.blockTitle}>Guard Screenshots</h3>
      <p className={styles.tip} style={{ marginBottom: 8 }}>
        Enter password to open the screenshots gallery on a separate page.
        Enable <strong>Auto screenshots</strong> above and Save first — agents
        need version <strong>1.2.37+</strong> and an assigned employee.
      </p>

      {checking ? (
        <p className={styles.tip}>Checking access…</p>
      ) : unlocked ? (
        <div className={styles.durationRow}>
          <button
            type="button"
            className={adminStyles.btnPrimary}
            onClick={() => router.push("/admin/guard-screenshots")}
          >
            Open screenshots gallery
          </button>
        </div>
      ) : (
        <div className={styles.durationRow}>
          <div className={styles.field} style={{ minWidth: 280 }}>
            <label htmlFor="gallery-password">Gallery password</label>
            <div className={styles.passwordWrap}>
              <input
                id="gallery-password"
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
          </div>
          <button
            type="button"
            className={adminStyles.btnPrimary}
            disabled={unlocking || !password}
            onClick={() => void unlock()}
          >
            {unlocking ? "Opening…" : "Unlock & open gallery"}
          </button>
        </div>
      )}
    </div>
  );
}
