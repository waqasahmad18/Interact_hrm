"use client";
import React, { useEffect, useState } from "react";
import styles from "./employee-credentials.module.css";
import { useRouter } from "next/navigation";

export default function EmployeeCredentialsPage() {
  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [credentials, setCredentials] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/employee")
      .then(res => res.json())
      .then(data => {
        if (data.success) setEmployees(data.employees);
      });
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setLoading(true);
    fetch(`/api/employee?employeeId=${selectedId}`)
      .then(res => res.json())
      .then(data => {
        setCredentials(data.employee || null);
        setLoading(false);
      });
  }, [selectedId]);

  const handleUpdatePassword = async () => {
    if (!selectedId || !newPassword) return;
    await fetch("/api/employee", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId: selectedId, password: newPassword })
    });
    setNewPassword("");
    // Re-fetch credentials
    fetch(`/api/employee?employeeId=${selectedId}`)
      .then(res => res.json())
      .then(data => setCredentials(data.employee || null));
  };

  // ...existing code...
  const LayoutDashboard = require("../layout-dashboard").default;
  return (
    <LayoutDashboard>
      <div className={styles.employeeCredentialsContainer}>
        <div className={styles.employeeCredentialsCard}>
          <div className={styles.employeeCredentialsHeader}>Employee Credentials</div>
          <div className={styles.employeeCredentialsFilters}>
            <label className={styles.employeeCredentialsLabel}>Select Employee:</label>
            <select
              value={selectedId}
              onChange={e => setSelectedId(e.target.value)}
              className={styles.employeeCredentialsSelect}
            >
              <option value="">-- Select --</option>
              {employees.map((emp, idx) => (
                <option key={emp.employee_id || idx} value={emp.employee_id}>
                  {emp.first_name} {emp.last_name} ({emp.employee_id})
                </option>
              ))}
            </select>
          </div>
          {loading ? (
            <div>Loading credentials...</div>
          ) : credentials ? (
            <div className={styles.employeeCredentialsInfo}>
              <div style={{ fontWeight: 600, fontSize: "1.1rem" }}>{credentials.first_name} {credentials.last_name}</div>
              <div className={styles.employeeCredentialsField}>Username: <b>{credentials.username || "-"}</b></div>
              <div className={styles.employeeCredentialsField}>Email: <b>{credentials.email || "-"}</b></div>
              <div className={styles.employeeCredentialsField} style={{ display: "flex", alignItems: "center" }}>
                Password: <b style={{ marginRight: 12 }}>{showPassword ? credentials.password || "-" : "********"}</b>
                <button
                  type="button"
                  className={styles.employeeCredentialsShowBtn}
                  onClick={() => setShowPassword(v => !v)}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
              <div className={styles.employeeCredentialsUpdate}>
                <h3 className={styles.employeeCredentialsUpdateTitle}>Update Password</h3>
                <input
                  type="text"
                  placeholder="Enter new password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className={styles.employeeCredentialsInput}
                />
                <button
                  onClick={handleUpdatePassword}
                  className={styles.employeeCredentialsButton}
                >
                  Update Password
                </button>
              </div>
            </div>
          ) : selectedId ? (
            <div>No credentials found.</div>
          ) : null}
        </div>
      </div>
    </LayoutDashboard>
  );
}
