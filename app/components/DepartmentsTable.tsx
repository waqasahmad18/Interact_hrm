"use client";
import React, { useState, useEffect } from "react";
import tableStyles from "../break-summary/break-summary.module.css";
import adminStyles from "../admin/admin-page.module.css";

// Define Department type
interface Department {
  id: number;
  name: string;
}

interface Employee {
  id: number;
  first_name: string;
  last_name: string;
  employee_id: string;
}

export default function DepartmentsTable() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employeesByDept, setEmployeesByDept] = useState<Record<number, Employee[]>>({});
  const [showEmp, setShowEmp] = useState<Record<number, boolean>>({});
  const [newDept, setNewDept] = useState<string>("");
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState<string>("");
  const [showDialog, setShowDialog] = useState<boolean>(false);

  // Fetch departments
  useEffect(() => {
    fetch("/api/departments")
      .then((res) => res.json())
      .then((data) => {
        if (data?.success && Array.isArray(data.departments)) {
          setDepartments(data.departments);
        } else {
          setDepartments([]);
        }
      });
  }, []);

  // Fetch employees for all departments
  useEffect(() => {
    if (departments.length === 0) return;
    departments.forEach((dep) => {
      fetch(`/api/employee-list?department_id=${dep.id}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success && Array.isArray(data.employees)) {
            setEmployeesByDept((prev) => ({ ...prev, [dep.id]: data.employees }));
          }
        });
    });
  }, [departments]);

  // Add department
  const handleAdd = async () => {
    if (!newDept.trim()) return;
    await fetch("/api/departments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newDept }),
    });
    setNewDept("");
    setShowDialog(false);
    // Refresh
    fetch("/api/departments")
      .then((res) => res.json())
      .then((data) => {
        if (data?.success && Array.isArray(data.departments)) {
          setDepartments(data.departments);
        }
      });
  };

  // Edit department
  const handleEdit = async (id: number) => {
    await fetch(`/api/departments?id=${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName }),
    });
    setEditId(null);
    setEditName("");
    // Refresh
    fetch("/api/departments")
      .then((res) => res.json())
      .then((data) => {
        if (data?.success && Array.isArray(data.departments)) {
          setDepartments(data.departments);
        }
      });
  };

  // Delete department
  const handleDelete = async (id: number) => {
    await fetch(`/api/departments?id=${id}`, { method: "DELETE" });
    // Refresh
    fetch("/api/departments")
      .then((res) => res.json())
      .then((data) => {
        if (data?.success && Array.isArray(data.departments)) {
          setDepartments(data.departments);
        }
      });
  };

  return (
    <div className={tableStyles.breakSummaryContainer}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <h2 className={tableStyles.pageTitle} style={{ margin: 0 }}>All Departments</h2>
        <button type="button" className={tableStyles.breakSummaryXLSButton} onClick={() => setShowDialog(true)}>
          Add Department
        </button>
      </div>
      <div className={tableStyles.breakSummaryTableWrapper}>
        <table className={tableStyles.breakSummaryTable} style={{ minWidth: 720 }}>
          <thead>
            <tr>
              <th>Name</th>
              <th style={{ textAlign: "center" }}>Employees</th>
              <th style={{ textAlign: "center" }}>Edit</th>
              <th style={{ textAlign: "center" }}>Delete</th>
            </tr>
          </thead>
          <tbody>
            {departments.length === 0 ? (
              <tr>
                <td colSpan={4} className={tableStyles.breakSummaryNoRecords}>
                  No departments found.
                </td>
              </tr>
            ) : (
              departments.map((dept) => (
                <tr key={dept.id}>
                  <td style={{ verticalAlign: "top" }}>
                    {editId === dept.id ? (
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className={tableStyles.breakSummaryInput}
                        style={{ width: "100%" }}
                      />
                    ) : (
                      <span style={{ fontWeight: 600 }}>{dept.name}</span>
                    )}
                  </td>
                  <td style={{ verticalAlign: "top", textAlign: "center" }}>
                    <button
                      type="button"
                      className={tableStyles.breakSummaryXLSButtonSecondary}
                      style={{ padding: "6px 14px", fontSize: 12 }}
                      onClick={() => setShowEmp((prev) => ({ ...prev, [dept.id]: !prev[dept.id] }))}
                    >
                      {showEmp[dept.id] ? "Hide" : "Show"} Employees
                    </button>
                    {showEmp[dept.id] && employeesByDept[dept.id] && (
                      <div
                        style={{
                          marginTop: 8,
                          background: "#faf5ff",
                          borderRadius: 10,
                          padding: 8,
                          maxHeight: 180,
                          overflowY: "auto",
                          minWidth: 180,
                          textAlign: "left",
                        }}
                      >
                        {employeesByDept[dept.id].length === 0 ? (
                          <div className={tableStyles.cellMuted}>No employees</div>
                        ) : (
                          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                            {employeesByDept[dept.id].map((emp) => (
                              <li
                                key={emp.id}
                                style={{ padding: "4px 0", borderBottom: "1px solid #f1f5f9" }}
                              >
                                {emp.first_name} {emp.last_name}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </td>
                  <td style={{ verticalAlign: "top", textAlign: "center" }}>
                    {editId === dept.id ? (
                      <button
                        type="button"
                        className={adminStyles.btnGreen}
                        style={{ padding: "6px 14px", fontSize: 13 }}
                        onClick={() => handleEdit(dept.id)}
                      >
                        Save
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={adminStyles.btnPrimary}
                        style={{ padding: "6px 14px", fontSize: 13 }}
                        onClick={() => {
                          setEditId(dept.id);
                          setEditName(dept.name);
                        }}
                      >
                        Edit
                      </button>
                    )}
                  </td>
                  <td style={{ verticalAlign: "top", textAlign: "center" }}>
                    <button
                      type="button"
                      className={adminStyles.btnReject}
                      style={{ padding: "6px 14px", fontSize: 13 }}
                      onClick={() => handleDelete(dept.id)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showDialog && (
        <div className={adminStyles.modalBackdrop}>
          <div className={adminStyles.modal}>
            <h3 className={adminStyles.modalTitle}>Add Department</h3>
            <div className={adminStyles.field} style={{ marginBottom: 16 }}>
              <label>Department Name</label>
              <input
                value={newDept}
                onChange={(e) => setNewDept(e.target.value)}
                placeholder="Department Name"
                className={adminStyles.input}
              />
            </div>
            <div className={adminStyles.modalActions}>
              <button type="button" className={adminStyles.btnGreen} onClick={handleAdd}>
                Save
              </button>
              <button type="button" className={adminStyles.btnSecondary} onClick={() => setShowDialog(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
