"use client";

import React from "react";
import { createPortal } from "react-dom";
import { EmployeeAvatar } from "./EmployeeAvatar";
import { employeeInitials } from "@/lib/employee-photo-shared";
import styles from "./employee-detail-popup.module.css";

export type EmployeeDetailPayload = {
  employeeId: string | number;
  name: string;
  pseudonym?: string | null;
  department?: string | null;
  email?: string | null;
  phone?: string | null;
  photo?: string | null;
  shiftName?: string | null;
  shiftStart?: string | null;
  shiftEnd?: string | null;
};

function display(value: string | null | undefined, fallback = "—") {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

function formatShiftTime(value: string | null | undefined) {
  if (!value) return "—";
  const match = /^(\d{1,2}):(\d{2})/.exec(value);
  if (!match) return value;
  let hour = Number(match[1]);
  const minute = match[2];
  const suffix = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${hour}:${minute} ${suffix}`;
}

export function EmployeeDetailPopup({
  data,
  onClose,
}: {
  data: EmployeeDetailPayload;
  onClose: () => void;
}) {
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  const initials = employeeInitials(data.name);
  const shiftStart = formatShiftTime(data.shiftStart);
  const shiftEnd = formatShiftTime(data.shiftEnd);
  const shiftLabel =
    shiftStart !== "—" && shiftEnd !== "—"
      ? `${shiftStart} – ${shiftEnd}`
      : shiftStart !== "—"
        ? shiftStart
        : shiftEnd !== "—"
          ? shiftEnd
          : "—";

  return createPortal(
    <div className={styles.backdrop} onClick={onClose} role="presentation">
      <div
        className={styles.dialog}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${data.name} profile`}
      >
        <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
          ×
        </button>

        <div className={styles.hero}>
          <div className={styles.avatarBtn}>
            <EmployeeAvatar
              name={data.name}
              initials={initials}
              photo={data.photo}
              size="xl"
              ring="purple"
            />
          </div>
          <h2 className={styles.name}>{data.name}</h2>
          {data.pseudonym ? <span className={styles.pseudoBadge}>{data.pseudonym}</span> : null}
        </div>

        <div className={styles.detailsCard}>
          <div className={styles.detailsCardTitle}>Employee details</div>
          <div className={styles.detailsList}>
            <div className={styles.detailRow}>
              <span className={styles.label}>Employee ID</span>
              <span className={styles.value}>{display(String(data.employeeId))}</span>
            </div>
            <div className={styles.detailRow}>
              <span className={styles.label}>Department</span>
              <span className={styles.value}>{display(data.department)}</span>
            </div>
            <div className={styles.detailRow}>
              <span className={styles.label}>Email</span>
              <span className={`${styles.value} ${styles.valueEmail}`}>{display(data.email)}</span>
            </div>
            <div className={styles.detailRow}>
              <span className={styles.label}>Contact</span>
              <span className={styles.value}>
                {data.phone?.trim() ? (
                  <a href={`tel:${data.phone.trim()}`} className={styles.valueEmail}>
                    {data.phone.trim()}
                  </a>
                ) : (
                  "—"
                )}
              </span>
            </div>
            <div className={styles.detailRow}>
              <span className={styles.label}>Shift</span>
              <span className={`${styles.value} ${styles.valueShift}`}>{shiftLabel}</span>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
