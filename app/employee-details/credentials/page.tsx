"use client";
import React, { useEffect, useState } from "react";
import { useSearchParams, usePathname } from "next/navigation";
import styles from "../../add-employee/add-employee.module.css";
import { useRouter } from "next/navigation";

const employeeTabs = [
  { name: "Employee List", path: "/employee-list" },
  { name: "Personal Details", path: "/employee-details/personal" },
  { name: "Contact Details", path: "/employee-details/contact" },
  { name: "Emergency Contacts", path: "/employee-details/emergency" },
  { name: "Dependents", path: "/employee-details/dependents" },
  { name: "Job", path: "/employee-details/job" },
  { name: "Salary", path: "/employee-details/salary" }
];

export default function EmployeeCredentialsPage() {
  const searchParams = useSearchParams();
  const employeeId = searchParams?.get("employeeId") || "";
  const router = useRouter();
  const pathname = usePathname();
  const [credentials, setCredentials] = useState<any>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [isAdmin, setIsAdmin] = useState(true);
  const [loading, setLoading] = useState(true);

  const fetchCredentials = () => {
    if (!employeeId) return;
    setLoading(true);
    // API endpoint removed
    setCredentials(null);
    setLoading(false);
  };

  useEffect(() => {
    fetchCredentials();
  }, [employeeId]);

  const handleUpdatePassword = async () => {
    if (!employeeId || !newPassword) return;
    // API endpoint removed
    setNewPassword("");
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#F7FAFC" }}>
      <aside className={styles.sidebar}>
        <div style={{ width: "100%", display: "flex", justifyContent: "center", alignItems: "center", margin: "18px 0 12px 0" }}>
          <button
            aria-label="Back to Dashboard"
            onClick={() => router.push("/dashboard")}
            style={{ background: "#fff", border: "none", borderRadius: "50%", boxShadow: "0 2px 8px rgba(0,82,204,0.10)", width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
          >
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="14" cy="14" r="14" fill="#0052CC" />
              <path d="M16.5 9L12.5 14L16.5 19" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
        <nav className={styles.nav}>
          {employeeTabs.map(tab => {
            const isActive = pathname?.startsWith(tab.path) ?? false;
            return (
              <div
                key={tab.name}
                onClick={() => router.push(tab.path + (tab.name === "Employee Credentials" ? `?employeeId=${employeeId}` : ""))}
                className={isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem}
              >
                <span>{tab.name}</span>
              </div>
            );
          })}
        </nav>
      </aside>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className={styles.formCard} style={{ maxWidth: 480, margin: "32px auto" }}>
          <h2 className={styles.heading} style={{ textAlign: "center" }}>Employee Credentials</h2>
          {loading ? (
            <div>Loading credentials...</div>
          ) : credentials ? (
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontWeight: 600, fontSize: "1.1rem" }}>{credentials.first_name} {credentials.last_name}</div>
              <div style={{ color: "#888", marginBottom: 8 }}>Username: <b>{credentials.username || "-"}</b></div>
              <div style={{ color: "#888", marginBottom: 8 }}>Email: <b>{credentials.email || "-"}</b></div>
              <div style={{ color: "#888", marginBottom: 8 }}>
                Password: <b>{showPassword ? credentials.password || "-" : "********"}</b>
                <button
                  style={{ marginLeft: 12, background: "#EDF2F7", color: "#0052CC", border: "none", borderRadius: 8, padding: "4px 12px", fontWeight: 600, cursor: "pointer" }}
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>
          ) : (
            <div>No credentials found.</div>
          )}
          {isAdmin && credentials && (
            <div style={{ marginTop: 18 }}>
              <h3 style={{ fontSize: "1rem", color: "#0052CC", marginBottom: 8 }}>Update Password</h3>
              <input
                type="text"
                placeholder="Enter new password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #E2E8F0", width: "100%", marginBottom: 8 }}
              />
              <button
                onClick={handleUpdatePassword}
                style={{ background: "linear-gradient(90deg, #0052CC 0%, #2B6CB0 100%)", color: "#fff", border: "none", borderRadius: 8, padding: "10px 22px", fontWeight: 600, fontSize: "1rem", boxShadow: "0 2px 8px rgba(0,82,204,0.10)", cursor: "pointer", transition: "background 0.2s" }}
              >
                Update Password
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
