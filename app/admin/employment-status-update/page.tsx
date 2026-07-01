"use client";

import React from "react";
import LayoutDashboard from "../../layout-dashboard";
import styles from "../admin-page.module.css";

export default function EmploymentStatusUpdatePage() {
  return (
    <LayoutDashboard>
      <div className={styles.page}>
        <div className={styles.inner}>
          <h1 className={styles.title}>Employment Status (Manual Only)</h1>
          <p className={styles.subtitle}>Automatic probation-to-permanent updates are disabled.</p>

          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Current Behavior</h2>
            <ul className={styles.muted} style={{ lineHeight: 1.8, paddingLeft: 20, margin: "0 0 20px" }}>
              <li>Employment status is updated manually from Add Employee or Edit Employee form.</li>
              <li>Date of joining no longer auto-changes status to Permanent.</li>
              <li>Leave balance and employee dashboard read the latest saved manual status.</li>
            </ul>

            <h2 className={styles.cardTitle}>Manual Update Steps</h2>
            <ol className={styles.muted} style={{ lineHeight: 1.8, paddingLeft: 20, margin: 0 }}>
              <li>Open employee form (Add/Edit).</li>
              <li>Set Employment Status to Probation or Permanent.</li>
              <li>Save Personal Details and then save Job Details.</li>
              <li>Open Leave and Employee Dashboard pages to see updated status/balance.</li>
            </ol>
          </div>

          <div
            className={styles.card}
            style={{
              background: "#fff7ed",
              borderColor: "#fed7aa",
              color: "#c2410c",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            Auto-update endpoint is intentionally disabled to keep status changes manual.
          </div>
        </div>
      </div>
    </LayoutDashboard>
  );
}
