"use client";
import React, { useEffect, useState } from "react";
import { useEffect as useLayoutEffect } from "react";
// @ts-ignore
import Modal from "react-modal";
import styles from "../add-employee/add-employee.module.css";
import { useRouter, usePathname } from "next/navigation";

export default function EmployeeListPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<any | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const employeeTabs = [
    { name: "Employee List", path: "/employee-list" },
    { name: "Personal Details", path: "/employee-details/personal" },
    { name: "Contact Details", path: "/employee-details/contact" },
    { name: "Emergency Contacts", path: "/employee-details/emergency" },
    { name: "Dependents", path: "/employee-details/dependents" },
    { name: "Job", path: "/employee-details/job" },
    { name: "Salary", path: "/employee-details/salary" }
  ];

  // Set app element for react-modal accessibility
  if (typeof window !== "undefined") {
    // @ts-ignore
    import("react-modal").then(modal => {
      if (modal && modal.default && modal.default.setAppElement) {
        modal.default.setAppElement("body");
      }
    });
  }

  useEffect(() => {
    fetch("/api/employee")
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          // Filter out empty records (no name, no employee_id)
          setEmployees(data.employees.filter((e: any) => e.first_name || e.last_name || e.employee_id));
        } else {
          setError(data.error || "Failed to fetch employees");
        }
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to fetch employees");
        setLoading(false);
      });
  }, []);

  return (
    <>
      <div style={{ display: "flex", minHeight: "100vh", background: "#F7FAFC" }}>
        <aside className={styles.sidebar}>
          <div style={{ width: "100%", display: "flex", justifyContent: "center", alignItems: "center", margin: "18px 0 12px 0" }}>
            <button
              aria-label="Back to Dashboard"
              onClick={() => router.push("/dashboard")}
              style={{
                background: "#fff",
                border: "none",
                borderRadius: "50%",
                boxShadow: "0 2px 8px rgba(0,82,204,0.10)",
                width: 44,
                height: 44,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer"
              }}
            >
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="14" cy="14" r="14" fill="#0052CC" />
                <path d="M16.5 9L12.5 14L16.5 19" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
          <nav className={styles.nav}>
            {employeeTabs.map(tab => {
              const isActive = pathname === tab.path;
              return (
                <div
                  key={tab.name}
                  onClick={() => router.push(tab.path)}
                  className={isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem}
                >
                  <span>{tab.name}</span>
                </div>
              );
            })}
          </nav>
        </aside>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div className={styles.formCard}>
            <h2>Employee List</h2>
            {loading ? (
              <div>Loading...</div>
            ) : error ? (
              <div style={{ color: "red" }}>{error}</div>
            ) : employees.length === 0 ? (
              <div>No employees found.</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 18 }}>
                <thead>
                  <tr style={{ background: "#F7FAFC", color: "#0052CC", fontWeight: 600 }}>
                    <th style={{ padding: "8px", borderBottom: "1px solid #E2E8F0" }}>#</th>
                    <th style={{ padding: "8px", borderBottom: "1px solid #E2E8F0" }}>Name</th>
                    <th style={{ padding: "8px", borderBottom: "1px solid #E2E8F0" }}>Employee ID</th>
                    <th style={{ padding: "8px", borderBottom: "1px solid #E2E8F0" }}>Gender</th>
                    <th style={{ padding: "8px", borderBottom: "1px solid #E2E8F0" }}>Nationality</th>
                    <th style={{ padding: "8px", borderBottom: "1px solid #E2E8F0" }}>Profile</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((emp, idx) => (
                    <tr key={emp.id} style={{ borderBottom: "1px solid #E2E8F0" }} onClick={() => setSelectedEmployeeId(emp.employee_id)}>
                      <td style={{ padding: "8px" }}>{idx + 1}</td>
                      <td style={{ padding: "8px" }}>{emp.first_name} {emp.middle_name} {emp.last_name}</td>
                      <td style={{ padding: "8px" }}>{emp.employee_id}</td>
                      <td style={{ padding: "8px" }}>{emp.gender}</td>
                      <td style={{ padding: "8px" }}>{emp.nationality}</td>
                      <td style={{ padding: "8px" }}>
                        <button
                          style={{ background: "none", border: "none", cursor: "pointer" }}
                          onClick={() => {
                            setSelectedEmployee(emp);
                            setModalOpen(true);
                          }}
                          title="View Details"
                        >
                          {emp.profile_img ? (
                            <img src={emp.profile_img} alt="Profile" style={{ width: 38, height: 38, borderRadius: "50%", objectFit: "cover", border: "1px solid #E2E8F0" }} />
                          ) : (
                            <img src="/avatar.svg" alt="Profile" style={{ width: 38, height: 38, borderRadius: "50%", objectFit: "cover", border: "1px solid #E2E8F0" }} />
                          )}
                        </button>
                        {selectedEmployee && (
                          <button
                            style={{ background: "none", border: "none", cursor: "pointer", marginLeft: 8 }}
                            onClick={() => router.push(`/employee-details/credentials?employeeId=${emp.employee_id}`)}
                            title="View Credentials"
                          >
                            🔑 Credentials
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {/* Employee Details Modal */}
            <Modal
              isOpen={modalOpen}
              onRequestClose={() => { setModalOpen(false); setSelectedEmployee(null); setModalError(""); }}
              contentLabel="Employee Details"
              style={{ overlay: { zIndex: 1000, background: "rgba(0,0,0,0.18)" }, content: { maxWidth: 480, margin: "auto", borderRadius: 16, padding: 24 } }}
            >
              {selectedEmployee ? (
                <div>
                  <h3 style={{ color: "#0052CC", marginBottom: 12 }}>Employee Details</h3>
                  <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 18 }}>
                    <img src={selectedEmployee.profile_img || "/avatar.svg"} alt="Profile" style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover", border: "1px solid #E2E8F0" }} />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: "1.1rem" }}>{selectedEmployee.first_name} {selectedEmployee.middle_name} {selectedEmployee.last_name}</div>
                      <div style={{ color: "#888" }}>ID: {selectedEmployee.employee_id}</div>
                    </div>
                  </div>
                  <div style={{ marginBottom: 8 }}>Gender: <b>{selectedEmployee.gender}</b></div>
                  <div style={{ marginBottom: 8 }}>Nationality: <b>{selectedEmployee.nationality}</b></div>
                  {/* Add more details as needed */}
                  <div style={{ display: "flex", gap: 12, marginTop: 18 }}>
                    <button style={{ background: "#0052CC", color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontWeight: 600, cursor: "pointer" }} onClick={() => router.push(`/employee-details/personal?employeeId=${selectedEmployee.employee_id}`)}>Update</button>
                    <button style={{ background: "#E53E3E", color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontWeight: 600, cursor: "pointer" }} onClick={async () => {
                      setModalLoading(true);
                      setModalError("");
                      try {
                        const res = await fetch(`/api/employee?employeeId=${selectedEmployee.employee_id}`, { method: "DELETE" });
                        const data = await res.json();
                        if (data.success) {
                          setEmployees(employees.filter(e => e.employee_id !== selectedEmployee.employee_id));
                          setModalOpen(false);
                          setSelectedEmployee(null);
                        } else {
                          setModalError(data.error || "Delete failed");
                        }
                      } catch (err) {
                        setModalError("Delete failed: " + String(err));
                      }
                      setModalLoading(false);
                    }}>Delete</button>
                    <button style={{ background: "#EDF2F7", color: "#0052CC", border: "none", borderRadius: 8, padding: "8px 18px", fontWeight: 600, cursor: "pointer" }} onClick={() => { setModalOpen(false); setSelectedEmployee(null); }}>Close</button>
                  </div>
                  {modalError && <div style={{ color: "#E53E3E", marginTop: 10 }}>{modalError}</div>}
                </div>
              ) : null}
            </Modal>
          </div>
        </div>
      </div>
    </>
  );
}
