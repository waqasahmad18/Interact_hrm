"use client";

import React from "react";
import { EmployeeAvatar } from "../components/EmployeeAvatar";
import { employeeInitials } from "@/lib/employee-photo-shared";
import { fetchShellBranding } from "../shell-branding-api";
import { HRM_ENVIRONMENTS } from "@/lib/server-environments";
import styles from "./admin-page.module.css";

const ADMIN_NAME = "WAQAS-RAFIQUE";

export function AdminWelcome() {
  const [photo, setPhoto] = React.useState<string | null>(null);

  React.useEffect(() => {
    void fetchShellBranding()
      .then((branding) => setPhoto(branding.adminAvatar))
      .catch(() => setPhoto(null));
  }, []);

  return (
    <>
      <div className={styles.card}>
        <div className={styles.welcomeCard}>
        <EmployeeAvatar
          name={ADMIN_NAME}
          initials={employeeInitials(ADMIN_NAME)}
          photo={photo}
          size="xl"
          ring="purple"
        />
        <p className={styles.welcomeKicker}>Welcome back</p>
        <h1 className={styles.welcomeName}>{ADMIN_NAME}</h1>
        <h2 className={styles.welcomeTitle}>Admin Dashboard</h2>
        <p className={styles.welcomeSubtitle}>
          Select a module from the sidebar to manage employees, attendance, payroll, and more.
        </p>
        </div>
      </div>

      <div className={styles.envCard}>
        <h3 className={styles.envCardTitle}>Server environments</h3>
        <p className={styles.envCardSub}>
          Production is <strong>10.98</strong> (MongoDB). Legacy <strong>10.40</strong> is shut down.
        </p>
        <table className={styles.envTable}>
          <thead>
            <tr>
              <th>Environment</th>
              <th>Server</th>
              <th>Database</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {HRM_ENVIRONMENTS.map((env) => (
              <tr key={env.id} className={env.status === "decommissioned" ? styles.envRowLegacy : undefined}>
                <td>{env.label}</td>
                <td>
                  <code>{env.ip}</code>
                </td>
                <td>{env.database}</td>
                <td>
                  <span
                    className={
                      env.status === "active" ? styles.envBadgeActive : styles.envBadgeLegacy
                    }
                  >
                    {env.status === "active" ? "Active" : "Decommissioned"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
