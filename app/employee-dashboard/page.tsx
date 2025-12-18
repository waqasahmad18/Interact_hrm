"use client";
import React from "react";
import { ClockBreakPrayerWidget } from "../components/ClockBreakPrayer";

export default function EmployeeDashboardPage() {
  const [employeeId, setEmployeeId] = React.useState<string>("");
  const [employeeName, setEmployeeName] = React.useState("");

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const loginId = localStorage.getItem("loginId");
    const cachedId = localStorage.getItem("employeeId");
    const cachedName = localStorage.getItem("employeeName");

    if (cachedId) setEmployeeId(cachedId);
    if (cachedName) setEmployeeName(cachedName);

    if (!loginId) return;
    let apiUrl = "/api/employee?";
    apiUrl += loginId.includes("@") ? `email=${loginId}` : `username=${loginId}`;

    Promise.all([
      fetch(apiUrl).then(res => res.json()).catch(() => ({ success: false })),
      fetch(`/api/hrm_employees?employeeId=${loginId}`).then(res => res.json()).catch(() => ({ success: false }))
    ]).then(([data1, data2]) => {
      const data = data1.success ? data1 : data2;
      if (data.success && data.employee) {
        const empId = data.employee.id || data.employee.employee_id || loginId;
        const empName = `${data.employee.first_name || ""} ${data.employee.middle_name || ""} ${data.employee.last_name || ""}`.trim();
        setEmployeeId(String(empId));
        setEmployeeName(empName);
        localStorage.setItem("employeeId", String(empId));
        localStorage.setItem("employeeName", empName);
      }
    });
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minHeight: "80vh", width: "100%", gap: 0 }}>
      <div style={{ marginTop: 32 }}>
        <ClockBreakPrayerWidget employeeId={employeeId} employeeName={employeeName} />
      </div>
      <div style={{ display: "flex", flexDirection: "row", justifyContent: "center", gap: 24, marginTop: 24 }}>
        <div style={{ background: "#f7fafc", borderRadius: 16, boxShadow: "0 2px 8px #e2e8f0", padding: 24, minWidth: 180, display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ fontWeight: 600, fontSize: "1.1rem", color: "#2b6cb0", marginBottom: 10 }}>Apply for Leave</div>
          <button
            onClick={() => window.location.href = "/employee-dashboard/leave"}
            style={{
              background: "#2b6cb0",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "8px 18px",
              fontSize: "1rem",
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
              transition: "background 0.2s"
            }}
          >
            Apply Leave
          </button>
        </div>
      </div>
    </div>
  );
}
