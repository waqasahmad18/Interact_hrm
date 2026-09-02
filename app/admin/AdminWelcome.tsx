"use client";

import React from "react";
import { EmployeeAvatar } from "../components/EmployeeAvatar";
import { employeeInitials } from "@/lib/employee-photo-shared";
import { fetchShellBranding } from "../shell-branding-api";
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
  );
}
