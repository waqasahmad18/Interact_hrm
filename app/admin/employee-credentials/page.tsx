"use client";
import React, { useEffect, useState } from "react";
import OptionalAdminShell from "@/app/components/OptionalAdminShell";
import styles from "../../break-summary/break-summary.module.css";
import leaveStyles from "../../leave/leave.module.css";
import adminStyles from "../admin-page.module.css";
import { FaSave, FaTimes, FaEdit, FaKey, FaEnvelope, FaUser } from "react-icons/fa";
import { EmployeeTableNameCell } from "../../components/EmployeeTableNameCell";
import { useEmployeeDetailPopup } from "../../components/use-employee-detail-popup";
import { toastError } from "@/lib/app-toast";

interface Employee {
  id: number;
  first_name: string;
  last_name: string;
  username: string;
  email_work: string;
  email_other: string;
  phone_mobile: string;
  password?: string;
  department_name?: string;
  pseudonym?: string;
}

export default function EmployeeCredentialsPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editData, setEditData] = useState({
    username: "",
    email: "",
    password: "",
  });
  const [saving, setSaving] = useState(false);
  const { openFromRow, popup, getPhoto } = useEmployeeDetailPopup();

  useEffect(() => {
    fetchEmployees();
  }, []);

  const fetchEmployees = async () => {
    try {
      const viewerId =
        typeof window !== "undefined"
          ? String(localStorage.getItem("employeeId") || "").trim()
          : "";
      const qs = viewerId ? `?viewerId=${encodeURIComponent(viewerId)}` : "";
      const scopeHeaders: HeadersInit = viewerId
        ? { "x-employee-id": viewerId, "x-hrm-employee-id": viewerId }
        : {};

      const res = await fetch(`/api/employee-credentials${qs}`, {
        headers: scopeHeaders,
      });
      const data = await res.json();
      if (data.success) {
        const empListRes = await fetch(`/api/employee-list${qs}`, {
          headers: scopeHeaders,
        });
        const empListData = await empListRes.json();
        const deptMap = new Map();
        if (empListData.success) {
          empListData.employees.forEach((emp: any) => {
            deptMap.set(emp.id, emp.department_name || "-");
          });
        }

        const attendanceRes = await fetch(
          "/api/attendance?fromDate=2020-01-01&toDate=2099-12-31",
        );
        const attendanceData = await attendanceRes.json();
        const pseudonymMap = new Map();
        if (attendanceData.success && Array.isArray(attendanceData.attendance)) {
          attendanceData.attendance.forEach((att: any) => {
            const empId = parseInt(att.employee_id);
            if (!pseudonymMap.has(empId)) {
              pseudonymMap.set(empId, att.pseudonym || "-");
            }
          });
        }

        const enrichedEmployees = data.employees.map((emp: Employee) => ({
          ...emp,
          department_name: emp.department_name || deptMap.get(emp.id) || "-",
          pseudonym: pseudonymMap.get(emp.id) || "-",
        }));
        setEmployees(enrichedEmployees);
      } else {
        setError(data.error || "Failed to fetch employees");
      }
    } catch {
      setError("Failed to fetch employees");
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (employee: Employee) => {
    setEditingId(employee.id);
    setEditData({
      username: employee.username || "",
      email: employee.email_work || employee.email_other || "",
      password: "",
    });
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditData({ username: "", email: "", password: "" });
  };

  const handleSave = async (id: number) => {
    setSaving(true);
    try {
      const viewerId =
        typeof window !== "undefined"
          ? String(localStorage.getItem("employeeId") || "").trim()
          : "";
      const res = await fetch("/api/employee-credentials", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(viewerId
            ? { "x-employee-id": viewerId, "x-hrm-employee-id": viewerId }
            : {}),
        },
        body: JSON.stringify({
          id,
          username: editData.username,
          email: editData.email,
          password: editData.password || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setEmployees((prev) =>
          prev.map((emp) =>
            emp.id === id
              ? {
                  ...emp,
                  username: editData.username,
                  email_work: editData.email,
                }
              : emp,
          ),
        );
        setEditingId(null);
        setEditData({ username: "", email: "", password: "" });
      } else {
        toastError("Failed to update: " + (data.error || "Unknown error"));
      }
    } catch {
      toastError("Failed to save credentials");
    } finally {
      setSaving(false);
    }
  };

  const getFullName = (emp: Employee) =>
    `${emp.first_name || ""} ${emp.last_name || ""}`.trim();

  const filteredEmployees = employees.filter(
    (emp) =>
      emp.first_name?.toLowerCase().includes(search.toLowerCase()) ||
      emp.last_name?.toLowerCase().includes(search.toLowerCase()) ||
      emp.username?.toLowerCase().includes(search.toLowerCase()) ||
      emp.email_work?.toLowerCase().includes(search.toLowerCase()) ||
      emp.email_other?.toLowerCase().includes(search.toLowerCase()) ||
      emp.id?.toString().includes(search),
  );

  return (
    <OptionalAdminShell>
      <div className={adminStyles.page}>
        <div className={styles.breakSummaryContainer}>
          <div className={adminStyles.pageHeader}>
            <div>
              <h1 className={adminStyles.pageHeaderTitle}>
                <FaKey style={{ marginRight: 10, verticalAlign: "middle" }} />
                Employee Credentials
              </h1>
              <p className={styles.mgmtAttMeta} style={{ marginTop: 4 }}>
                Manage employee login credentials — username, email, and password
              </p>
            </div>
          </div>

          <div className={leaveStyles.toolbar}>
            <div className={leaveStyles.searchWrap}>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden
              >
                <circle cx="11" cy="11" r="7" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="search"
                className={leaveStyles.toolbarSearch}
                placeholder="Search by name, username, email, or ID"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoComplete="off"
              />
            </div>
            <span className={styles.empListShowing}>
              Showing: {filteredEmployees.length}
            </span>
          </div>

          {error ? (
            <div className={styles.tungstenError} role="alert">
              {error}
            </div>
          ) : null}

          <div className={leaveStyles.reqTableShell}>
            <div className={styles.mgmtAttScroll}>
              {loading ? (
                <div className={leaveStyles.loading}>Loading credentials…</div>
              ) : (
                <table className={`${leaveStyles.reqTable} ${styles.credTableFit}`}>
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Full Name</th>
                      <th>P.Name</th>
                      <th>Department</th>
                      <th>
                        <FaUser style={{ marginRight: 4 }} /> Username
                      </th>
                      <th>
                        <FaEnvelope style={{ marginRight: 4 }} /> Email
                      </th>
                      <th>
                        <FaKey style={{ marginRight: 4 }} /> Password
                      </th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEmployees.length === 0 ? (
                      <tr>
                        <td colSpan={8} className={leaveStyles.reqEmpty}>
                          No employees found
                        </td>
                      </tr>
                    ) : (
                      filteredEmployees.map((emp) => {
                        const isEditing = editingId === emp.id;
                        const fullName = getFullName(emp);

                        return (
                          <tr key={emp.id}>
                            <td className={leaveStyles.reqId}>{emp.id}</td>
                            <td>
                              <EmployeeTableNameCell
                                name={fullName || "N/A"}
                                employeeId={emp.id}
                                photo={getPhoto(emp.id)}
                                onOpen={() =>
                                  openFromRow({
                                    employee_id: emp.id,
                                    employee_name: fullName,
                                    first_name: emp.first_name,
                                    last_name: emp.last_name,
                                    pseudonym: emp.pseudonym,
                                    department_name: emp.department_name,
                                    email: emp.email_work || emp.email_other,
                                  })
                                }
                              />
                            </td>
                            <td>{emp.pseudonym || "-"}</td>
                            <td>{emp.department_name || "-"}</td>
                            <td>
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={editData.username}
                                  onChange={(e) =>
                                    setEditData({ ...editData, username: e.target.value })
                                  }
                                  className={leaveStyles.toolbarSelect}
                                  placeholder="Username"
                                  style={{ width: "100%", minWidth: 100 }}
                                />
                              ) : (
                                <span>{emp.username || <em>Not set</em>}</span>
                              )}
                            </td>
                            <td>
                              {isEditing ? (
                                <input
                                  type="email"
                                  value={editData.email}
                                  onChange={(e) =>
                                    setEditData({ ...editData, email: e.target.value })
                                  }
                                  className={leaveStyles.toolbarSelect}
                                  placeholder="Email"
                                  style={{ width: "100%", minWidth: 140 }}
                                />
                              ) : (
                                <span>
                                  {emp.email_work || emp.email_other || <em>Not set</em>}
                                </span>
                              )}
                            </td>
                            <td>
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={editData.password}
                                  onChange={(e) =>
                                    setEditData({ ...editData, password: e.target.value })
                                  }
                                  className={leaveStyles.toolbarSelect}
                                  placeholder="New password (optional)"
                                  style={{ width: "100%", minWidth: 120 }}
                                />
                              ) : (
                                <span style={{ color: "#94a3b8" }}>
                                  {emp.password || "••••••••"}
                                </span>
                              )}
                            </td>
                            <td>
                              {isEditing ? (
                                <div className={styles.empListRowActions}>
                                  <button
                                    type="button"
                                    onClick={() => handleSave(emp.id)}
                                    disabled={saving}
                                    className={styles.breakSummaryXLSButton}
                                    style={{ padding: "6px 10px", fontSize: 12 }}
                                  >
                                    <FaSave /> {saving ? "Saving…" : "Save"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={handleCancel}
                                    disabled={saving}
                                    className={styles.mgmtAttGhostBtn}
                                    style={{ padding: "6px 10px", fontSize: 12 }}
                                  >
                                    <FaTimes /> Cancel
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleEdit(emp)}
                                  className={styles.mgmtAttGhostBtn}
                                  style={{ padding: "6px 10px", fontSize: 12, color: "#0f766e" }}
                                >
                                  <FaEdit /> Edit
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>
      {popup}
    </OptionalAdminShell>
  );
}
