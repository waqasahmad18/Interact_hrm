"use client";

import React from "react";
import { createPortal } from "react-dom";
import { FaKey } from "react-icons/fa";
import styles from "./employee-profile-menu.module.css";

type Props = {
  open: boolean;
  employeeId: string;
  onClose: () => void;
};

export function UpdatePasswordModal({ open, employeeId, onClose }: Props) {
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setError("");
    setSuccess("");
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!employeeId) {
      setError("Employee ID not found. Please sign in again.");
      return;
    }
    if (!currentPassword.trim()) {
      setError("Please enter your current password.");
      return;
    }
    if (!newPassword.trim()) {
      setError("Please enter a new password.");
      return;
    }
    if (newPassword.length < 4) {
      setError("New password must be at least 4 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }
    if (newPassword === currentPassword) {
      setError("New password must be different from your current password.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/employee-credentials", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: Number(employeeId),
          password: newPassword,
          currentPassword,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess("Password updated successfully.");
        setTimeout(() => onClose(), 1200);
      } else {
        setError(data.error || "Unable to update password.");
      }
    } catch {
      setError("Unable to update password. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className={styles.modalBackdrop}
      onClick={onClose}
      role="presentation"
    >
      <div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-password-title"
      >
        <button
          type="button"
          className={styles.modalClose}
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>
        <div className={styles.modalHead}>
          <span className={styles.modalIcon}>
            <FaKey />
          </span>
          <div>
            <h2 id="update-password-title" className={styles.modalTitle}>
              Update password
            </h2>
            <p className={styles.modalSub}>
              Enter your current password, then choose a new one and confirm it.
            </p>
          </div>
        </div>

        <form className={styles.form} onSubmit={handleSubmit}>
          {error ? <div className={styles.alertError}>{error}</div> : null}
          {success ? <div className={styles.alertSuccess}>{success}</div> : null}

          <div className={styles.field}>
            <label className={styles.label} htmlFor="emp-current-password">
              Current password
            </label>
            <input
              id="emp-current-password"
              type="password"
              className={styles.input}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              disabled={saving}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="emp-new-password">
              New password
            </label>
            <input
              id="emp-new-password"
              type="password"
              className={styles.input}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              disabled={saving}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="emp-confirm-password">
              Confirm new password
            </label>
            <input
              id="emp-confirm-password"
              type="password"
              className={styles.input}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              disabled={saving}
            />
          </div>

          <div className={styles.modalActions}>
            <button
              type="button"
              className={styles.btnGhost}
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button type="submit" className={styles.btnPrimary} disabled={saving}>
              {saving ? "Saving…" : "Update password"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
