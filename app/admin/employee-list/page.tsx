"use client";

import React, { useEffect, useMemo, useState } from "react";
import LayoutDashboard from "../../layout-dashboard";
import styles from "../../break-summary/break-summary.module.css";
import {
  FaUserEdit,
  FaTrash,
  FaToggleOn,
  FaToggleOff,
  FaFilter,
  FaSort,
  FaSortUp,
  FaSortDown,
} from "react-icons/fa";
import Modal from "react-modal";
import AddEmployeeForm from "../../add-employee/AddEmployeeForm";

type SortKey =
  | "id"
  | "fullName"
  | "pseudonym"
  | "department"
  | "gender"
  | "nationality"
  | "status";

type SortDirection = "asc" | "desc";

export default function EmployeeListStyledPage() {
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection } | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<any | null>(null);

  useEffect(() => {
    Modal.setAppElement("body");
  }, []);

  const refreshEmployees = () => {
    fetch("/api/employee-list")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setEmployees(data.employees);
          setError("");
        } else {
          setError(data.error || "Failed to fetch employees");
        }
      })
      .catch(() => {
        setError("Failed to fetch employees");
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    refreshEmployees();
  }, []);

  const handleStatusToggle = async (id: number, currentStatus: string) => {
    const newStatus = currentStatus === "enabled" || currentStatus === "active" ? "inactive" : "active";

    // Optimistic UI update
    setEmployees((prev) =>
      prev.map((employee) =>
        employee.id === id ? { ...employee, status: newStatus } : employee
      )
    );

    const res = await fetch("/api/employee-list", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: newStatus }),
    });

    const data = await res.json();

    if (!data.success) {
      // Revert on API failure
      setEmployees((prev) =>
        prev.map((employee) =>
          employee.id === id ? { ...employee, status: currentStatus } : employee
        )
      );
      alert("Status update failed: " + (data.error || "Unknown error"));
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("Are you sure you want to delete this employee?")) return;

    const res = await fetch("/api/employee-list", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });

    const data = await res.json();

    if (data.success) {
      setEmployees((prev) => prev.filter((employee) => employee.id !== id));
    } else {
      alert("Delete failed: " + (data.error || "Unknown error"));
    }
  };

  const getNormalizedStatus = (status: string) => {
    return status === "active" || status === "enabled" ? "active" : "inactive";
  };

  const getEmployeeFullName = (employee: any) => {
    return [employee.first_name, employee.middle_name, employee.last_name]
      .filter(Boolean)
      .join(" ")
      .trim();
  };

  const handleSort = (key: SortKey) => {
    setSortConfig((prev) => {
      if (!prev || prev.key !== key) {
        return { key, direction: "asc" };
      }

      if (prev.direction === "asc") {
        return { key, direction: "desc" };
      }

      return null;
    });
  };

  const getSortIcon = (key: SortKey) => {
    if (!sortConfig || sortConfig.key !== key) {
      return <FaSort style={{ opacity: 0.75 }} />;
    }

    if (sortConfig.direction === "asc") {
      return <FaSortUp />;
    }

    return <FaSortDown />;
  };

  const getText = (value: unknown) => String(value || "").toLowerCase();

  const uniqueDepartments = useMemo(() => {
    const depts = employees
      .map((e) => e.department_name)
      .filter((d): d is string => Boolean(d));
    return Array.from(new Set(depts)).sort();
  }, [employees]);

  const filtered = useMemo(() => {
    const searchLower = search.toLowerCase();

    const searchFiltered = employees.filter((employee) => {
      if (!search) return true;
      const empId = (employee.employee_code || employee.id || "").toString();
      const fullName = getEmployeeFullName(employee).toLowerCase();
      const pseudo = (employee.pseudonym || "").toLowerCase();

      return fullName.includes(searchLower) || empId.includes(searchLower) || pseudo.includes(searchLower);
    });

    const statusFiltered = searchFiltered.filter((employee) => {
      if (statusFilter === "all") return true;
      return getNormalizedStatus(employee.status) === statusFilter;
    });

    const deptFiltered = statusFiltered.filter((employee) => {
      if (!departmentFilter) return true;
      return (employee.department_name || "") === departmentFilter;
    });

    if (!sortConfig) return deptFiltered;

    const sorted = [...deptFiltered].sort((a, b) => {
      let comparison = 0;

      switch (sortConfig.key) {
        case "id": {
          const aId = Number(a.id || 0);
          const bId = Number(b.id || 0);
          comparison = aId - bId;
          break;
        }
        case "fullName": {
          comparison = getEmployeeFullName(a).localeCompare(getEmployeeFullName(b), undefined, {
            sensitivity: "base",
          });
          break;
        }
        case "pseudonym": {
          comparison = getText(a.pseudonym).localeCompare(getText(b.pseudonym), undefined, {
            sensitivity: "base",
          });
          break;
        }
        case "department": {
          comparison = getText(a.department_name).localeCompare(getText(b.department_name), undefined, {
            sensitivity: "base",
          });
          break;
        }
        case "gender": {
          comparison = getText(a.gender).localeCompare(getText(b.gender), undefined, {
            sensitivity: "base",
          });
          break;
        }
        case "nationality": {
          comparison = getText(a.nationality).localeCompare(getText(b.nationality), undefined, {
            sensitivity: "base",
          });
          break;
        }
        case "status": {
          comparison = getNormalizedStatus(a.status).localeCompare(getNormalizedStatus(b.status), undefined, {
            sensitivity: "base",
          });
          break;
        }
        default:
          comparison = 0;
      }

      return sortConfig.direction === "asc" ? comparison : -comparison;
    });

    return sorted;
  }, [employees, search, statusFilter, departmentFilter, sortConfig]);

  const sortButtonStyle: React.CSSProperties = {
    border: "none",
    background: "transparent",
    color: "#fff",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0",
    fontSize: "0.8rem",
  };

  const renderSortableHeader = (label: string, key: SortKey) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <button
          type="button"
          onClick={() => handleSort(key)}
          style={sortButtonStyle}
          title={`Sort ${label}`}
          aria-label={`Sort ${label}`}
        >
          <FaFilter />
        </button>
        <span>{label}</span>
      </div>
      <button
        type="button"
        onClick={() => handleSort(key)}
        style={sortButtonStyle}
        title={`Toggle sort direction for ${label}`}
        aria-label={`Toggle sort direction for ${label}`}
      >
        {getSortIcon(key)}
      </button>
    </div>
  );

  return (
    <LayoutDashboard>
      <div className={styles.breakSummaryContainer}>
        <div className={styles.breakSummaryHeader}>Employee List</div>

        <div className={styles.breakSummaryFilters}>
          <input
            type="text"
            placeholder="Search by name, ID or P.Name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={styles.breakSummaryInput}
            style={{ width: 220 }}
          />
          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className={styles.breakSummaryInput}
            style={{ width: 180 }}
          >
            <option value="">All Departments</option>
            {uniqueDepartments.map((dept) => (
              <option key={dept} value={dept}>{dept}</option>
            ))}
          </select>
        </div>

        <div className={styles.breakSummaryTableWrapper}>
          <table className={styles.breakSummaryTable}>
            <thead>
              <tr>
                <th>{renderSortableHeader("Id", "id")}</th>
                <th>{renderSortableHeader("Full Name", "fullName")}</th>
                <th>{renderSortableHeader("P.Name", "pseudonym")}</th>
                <th>{renderSortableHeader("Department", "department")}</th>
                <th>{renderSortableHeader("Gender", "gender")}</th>
                <th>{renderSortableHeader("Nationality", "nationality")}</th>
                <th>{renderSortableHeader("Status", "status")}</th>
                <th>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                    <span>Actions</span>
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value as "all" | "active" | "inactive")}
                      style={{
                        fontSize: "0.72rem",
                        borderRadius: 4,
                        border: "1px solid rgba(255,255,255,0.45)",
                        background: "rgba(255,255,255,0.18)",
                        color: "#fff",
                        padding: "2px 4px",
                      }}
                      title="Filter by status"
                    >
                      <option value="all" style={{ color: "#0f1d40" }}>All</option>
                      <option value="active" style={{ color: "#0f1d40" }}>Active</option>
                      <option value="inactive" style={{ color: "#0f1d40" }}>Inactive</option>
                    </select>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8}>Loading...</td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={8} style={{ color: "red" }}>{error}</td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8}>No records found.</td>
                </tr>
              ) : (
                filtered.map((employee) => (
                  <tr key={employee.id}>
                    <td>{employee.id}</td>
                    <td>{getEmployeeFullName(employee)}</td>
                    <td>{employee.pseudonym || "-"}</td>
                    <td>{employee.department_name || "-"}</td>
                    <td>
                      {employee.gender
                        ? employee.gender.charAt(0).toUpperCase() + employee.gender.slice(1).toLowerCase()
                        : "-"}
                    </td>
                    <td>{employee.nationality || "-"}</td>
                    <td
                      style={{
                        fontWeight: 600,
                        color:
                          employee.status === "active" || employee.status === "enabled"
                            ? "#38A169"
                            : "#E53E3E",
                      }}
                    >
                      {employee.status === "active" || employee.status === "enabled"
                        ? "Active"
                        : "Inactive"}
                    </td>
                    <td>
                      <button
                        title={
                          employee.status === "active" || employee.status === "enabled"
                            ? "Set Inactive"
                            : "Set Active"
                        }
                        style={{
                          background: "none",
                          border: "none",
                          color:
                            employee.status === "active" || employee.status === "enabled"
                              ? "#00b894"
                              : "#b2bec3",
                          cursor: "pointer",
                          marginRight: 8,
                          fontSize: "1.3rem",
                        }}
                        onClick={() => handleStatusToggle(employee.id, employee.status)}
                      >
                        {employee.status === "active" || employee.status === "enabled" ? (
                          <FaToggleOn />
                        ) : (
                          <FaToggleOff />
                        )}
                      </button>

                      <button
                        title="Edit"
                        style={{
                          background: "none",
                          border: "none",
                          color: "#0052CC",
                          cursor: "pointer",
                          marginRight: 8,
                        }}
                        onClick={() => {
                          setModalOpen(true);
                          setSelectedEmployee(employee);
                        }}
                      >
                        <FaUserEdit />
                      </button>

                      <button
                        title="Delete"
                        style={{ background: "none", border: "none", color: "#e74c3c", cursor: "pointer" }}
                        onClick={() => handleDelete(employee.id)}
                      >
                        <FaTrash />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <Modal
          isOpen={modalOpen}
          onRequestClose={() => {
            setModalOpen(false);
            setSelectedEmployee(null);
          }}
          contentLabel="Edit Employee"
          style={{
            overlay: { zIndex: 1000, background: "rgba(0,0,0,0.18)" },
            content: { maxWidth: 900, margin: "auto", borderRadius: 16, padding: 24 },
          }}
        >
          {selectedEmployee ? (
            <div>
              <AddEmployeeForm
                edit={true}
                employeeId={String(selectedEmployee.id)}
                onSaved={() => {
                  setModalOpen(false);
                  setSelectedEmployee(null);
                  refreshEmployees();
                }}
              />

              <div style={{ display: "flex", gap: 12, marginTop: 18 }}>
                <button
                  style={{
                    background: "#EDF2F7",
                    color: "#0052CC",
                    border: "none",
                    borderRadius: 8,
                    padding: "8px 18px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                  onClick={() => {
                    setModalOpen(false);
                    setSelectedEmployee(null);
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          ) : null}
        </Modal>
      </div>
    </LayoutDashboard>
  );
}
