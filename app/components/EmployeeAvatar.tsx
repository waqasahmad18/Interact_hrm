"use client";

import React from "react";
import { FaUser } from "react-icons/fa";
import styles from "./employee-avatar.module.css";

type Props = {
  name: string;
  initials: string;
  photo?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  ring?: "purple" | "green" | "gold" | "none";
  statusDot?: "online" | "offline" | "late" | null;
  className?: string;
};

const sizeClass = {
  sm: styles.sizeSm,
  md: styles.sizeMd,
  lg: styles.sizeLg,
  xl: styles.sizeXl,
};

const ringClass = {
  purple: styles.ringPurple,
  green: styles.ringGreen,
  gold: styles.ringGold,
  none: "",
};

export function EmployeeAvatar({
  name,
  initials,
  photo,
  size = "md",
  ring = "none",
  statusDot = null,
  className = "",
}: Props) {
  return (
    <div
      className={`${styles.wrap} ${sizeClass[size]} ${ringClass[ring]} ${className}`}
      title={name}
      aria-label={name}
    >
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt="" className={styles.img} />
      ) : (
        <span className={styles.placeholder} aria-hidden>
          <FaUser className={styles.placeholderIcon} />
          <span className={styles.initials}>{initials}</span>
        </span>
      )}
      {statusDot ? (
        <span className={`${styles.dot} ${styles[`dot_${statusDot}`]}`} aria-hidden />
      ) : null}
    </div>
  );
}
