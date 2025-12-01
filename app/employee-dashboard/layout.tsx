"use client";
import React from "react";
import { useRouter, usePathname } from "next/navigation";
import styles from "../layout-dashboard.module.css";

const employeeTabs = [
  { name: "Dashboard", path: "/employee-dashboard" },
  { name: "My Attendance", path: "/employee-dashboard/my-attendance" },
  { name: "Leave", path: "/employee-dashboard/leave" },
  { name: "Break Summary", path: "/employee-dashboard/break-summary" }
];

export default function EmployeeDashboardLayout({ children }: { children: React.ReactNode }) {
    // ...existing code...
  const router = useRouter();
  const pathname = usePathname();
  // Get employee name from API using loginId
  const [employeeName, setEmployeeName] = React.useState<string>("");
  React.useEffect(() => {
    if (typeof window !== "undefined") {
      const loginId = localStorage.getItem("loginId");
      if (loginId) {
        let apiUrl = "/api/employee?";
        if (loginId.includes("@")) {
          apiUrl += `email=${loginId}`;
        } else {
          apiUrl += `username=${loginId}`;
        }
        fetch(apiUrl)
          .then(res => res.json())
          .then(data => {
            if (data.success && data.employee) {
              setEmployeeName(data.employee.first_name + (data.employee.last_name ? " " + data.employee.last_name : ""));
            } else {
              setEmployeeName("Employee");
            }
          })
          .catch(() => setEmployeeName("Employee"));
      } else {
        setEmployeeName("Employee");
      }
    }
  }, []);
  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <div style={{ width: "100%", display: "flex", justifyContent: "center", alignItems: "center", margin: "18px 0 12px 0" }}>
          <img src="/logo.png" alt="Logo" width={60} height={60} style={{ borderRadius: 16 }} />
        </div>
        <div style={{ fontSize: "1.15rem", fontWeight: 700, color: "#0052CC", textAlign: "center", marginBottom: 8 }}>{employeeName}</div>
        <nav className={styles.nav}>
          {employeeTabs.map((tab, idx) => {
            const isActive = pathname === tab.path;
            return (
              <div
                key={tab.path || idx}
                onClick={() => router.push(tab.path)}
                className={isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem}
              >
                <span>{tab.name}</span>
              </div>
            );
          })}
        </nav>
        {/* ...existing code... */}
      </aside>
      <main className={styles.main}>
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", width: "100%", marginBottom: 18 }}>
          <button
            onClick={() => router.push("/auth")}
            style={{
              background: "#E53E3E",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "8px 22px",
              fontWeight: 600,
              fontSize: "1rem",
              boxShadow: "0 2px 8px rgba(229,62,62,0.10)",
              cursor: "pointer",
              transition: "background 0.2s"
            }}
          >
            Logout
          </button>
        </div>
        {children}
      </main>
    </div>
  );
}
