"use client";
import React, { useEffect, useState } from "react";
import styles from "../add-employee/add-employee.module.css";
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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#F7FAFC" }}>
        <div className={styles.formCard} style={{ maxWidth: 480, margin: "32px auto" }}>
          <h2 className={styles.heading} style={{ textAlign: "center" }}>Employee Credentials</h2>
          <div style={{ marginBottom: 18 }}>
            <label style={{ fontWeight: 600 }}>Select Employee:</label>
            <select
              value={selectedId}
              onChange={e => setSelectedId(e.target.value)}
              style={{ width: "100%", padding: "8px 14px", borderRadius: 8, border: "1px solid #E2E8F0", marginTop: 8 }}
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
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontWeight: 600, fontSize: "1.1rem" }}>{credentials.first_name} {credentials.last_name}</div>
              <div style={{ color: "#888", marginBottom: 8 }}>Username: <b>{credentials.username || "-"}</b></div>
              <div style={{ color: "#888", marginBottom: 8 }}>Email: <b>{credentials.email || "-"}</b></div>
              <div style={{ color: "#888", marginBottom: 8, display: "flex", alignItems: "center" }}>
                Password: <b style={{ marginRight: 12 }}>{showPassword ? credentials.password || "-" : "********"}</b>
                <button
                  type="button"
                  style={{ background: "#EDF2F7", color: "#0052CC", border: "none", borderRadius: 8, padding: "4px 12px", fontWeight: 600, cursor: "pointer" }}
                  onClick={() => setShowPassword(v => !v)}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
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
            </div>
          ) : selectedId ? (
            <div>No credentials found.</div>
          ) : null}
        </div>
      </div>
    </LayoutDashboard>
  );
}
