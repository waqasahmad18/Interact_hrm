"use client";

import React from "react";
import LayoutDashboard from "../layout-dashboard";
import styles from "../components/admin-module-page.module.css";
import { FaUser, FaEnvelope, FaIdBadge } from "react-icons/fa";
import { fetchShellBranding } from "../shell-branding-api";
import { EmployeeAvatar } from "../components/EmployeeAvatar";
import { employeeInitials } from "@/lib/employee-photo-shared";

const ADMIN_NAME = "WAQAS-RAFIQUE";

export default function MyInfoPage() {
  const [photo, setPhoto] = React.useState<string | null>(null);

  React.useEffect(() => {
    void fetchShellBranding()
      .then((b) => setPhoto(b.adminAvatar))
      .catch(() => setPhoto(null));
  }, []);

  return (
    <LayoutDashboard>
      <div className={styles.page}>
        <div className={styles.inner}>
          <header className={styles.header}>
            <h1 className={styles.title}>
              <span className={styles.titleIcon}>
                <FaUser />
              </span>
              My Info
            </h1>
            <p className={styles.subtitle}>Your admin profile and account details.</p>
          </header>

          <div className={styles.card}>
            <div className={styles.profileRow}>
              <EmployeeAvatar
                name={ADMIN_NAME}
                initials={employeeInitials(ADMIN_NAME)}
                photo={photo}
                size="xl"
                ring="purple"
              />
              <div>
                <h2 className={styles.profileName}>{ADMIN_NAME}</h2>
                <p className={styles.profileRole}>Administrator</p>
              </div>
            </div>
          </div>

          <div className={styles.card} style={{ marginTop: 16 }}>
            <div className={styles.list}>
              <div className={styles.listItem}>
                <div className={styles.listItemLead}>
                  <FaIdBadge />
                  <span className={styles.listItemTitle}>Role</span>
                </div>
                <span className={styles.listItemMeta}>Super Admin</span>
              </div>
              <div className={styles.listItem}>
                <div className={styles.listItemLead}>
                  <FaEnvelope />
                  <span className={styles.listItemTitle}>Portal</span>
                </div>
                <span className={styles.listItemMeta}>Admin Dashboard</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </LayoutDashboard>
  );
}
