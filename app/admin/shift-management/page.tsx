"use client";
import React, { useEffect, useState } from "react";
import LayoutDashboard from "../../layout-dashboard";
import styles from "./shift-management.module.css";
import {
  FaClock,
  FaCheckCircle,
  FaTimesCircle,
  FaSave,
} from "react-icons/fa";

interface Employee {
  id: number;
  first_name: string;
  last_name: string;
  status: string;
  shift_name?: string;
  start_time?: string;
  end_time?: string;
  assigned_date?: string;
  assignment_id?: number;
}

interface Department {
  id: number;
  name: string;
}

interface MasterShift {
  id: number;
  name: string;
  shift_in: string;
  shift_out: string;
  overtime_daily: number;
  working_days: string;
}

// Convert 24-hour time to 12-hour format with AM/PM
const formatTimeTo12Hour = (time: string): string => {
  if (!time) return "";
  const [hours, minutes] = time.split(":");
  const hour = parseInt(hours, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minutes} ${ampm}`;
};

export default function ShiftManagementPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [masterShifts, setMasterShifts] = useState<MasterShift[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [search, setSearch] = useState("");
  const [selectedScope, setSelectedScope] = useState<string>(""); // all, dept-<id>, emp-<id>
  const [selectedAll, setSelectedAll] = useState(false);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<number[]>([]);
  const [selectedMasterShift, setSelectedMasterShift] = useState<string>("");
  const [shiftName, setShiftName] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [assigningId, setAssigningId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editAssignmentId, setEditAssignmentId] = useState<number | null>(null);
  const [editShiftName, setEditShiftName] = useState("");
  const [editStartTime, setEditStartTime] = useState("");
  const [editEndTime, setEditEndTime] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [targetSearch, setTargetSearch] = useState("");

  useEffect(() => {
    fetchEmployees();
    fetchDepartments();
    fetchMasterShifts();
  }, []);

  // Keep selections in sync when "all" is toggled or list changes
  useEffect(() => {
    if (selectedAll) {
      setSelectedEmployeeIds(employees.map(e => e.id));
    }
  }, [selectedAll, employees]);

  const fetchEmployees = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/hrm-shifts-assignments");
      const data = await res.json();
      if (data.success) {
        setEmployees(data.employees);
      } else {
        setError(data.error || "Failed to fetch employees");
      }
    } catch (err) {
      setError("Failed to fetch employees");
    } finally {
      setLoading(false);
    }
  };

  const fetchDepartments = async () => {
    try {
      const res = await fetch("/api/departments");
      const data = await res.json();
      if (data?.departments) {
        setDepartments(data.departments);
      }
    } catch (err) {
      // ignore
    }
  };
  const fetchMasterShifts = async () => {
    try {
      const res = await fetch("/api/master-shifts");
      const data = await res.json();
      if (data.success) {
        setMasterShifts(data.shifts || []);
      }
    } catch (err) {
      // ignore
    }
  };

  const handleMasterShiftChange = (shiftId: string) => {
    setSelectedMasterShift(shiftId);
    const shift = masterShifts.find(s => s.id === parseInt(shiftId));
    if (shift) {
      setShiftName(shift.name);
      setStartTime(shift.shift_in);
      setEndTime(shift.shift_out);
    }
  };
  const handleAssignShift = async () => {
    const hasManualEmployees = selectedEmployeeIds.length > 0;

    if (!selectedAll && !selectedScope && !hasManualEmployees) {
      setError("Please select target (all / department / employees)");
      return;
    }

    if (!shiftName || !startTime || !endTime) {
      setError("Please fill all fields");
      return;
    }

    const isAll = selectedAll || selectedScope === "all";
    const isDept = selectedScope.startsWith("dept-");

    const payload: any = {
      shift_name: shiftName,
      start_time: startTime,
      end_time: endTime,
    };

    if (isAll) {
      payload.assign_all = true;
    } else if (isDept) {
      payload.department_id = parseInt(selectedScope.replace("dept-", ""));
    } else if (hasManualEmployees) {
      payload.employee_ids = selectedEmployeeIds;
    } else {
      setError("Invalid selection");
      return;
    }

    setAssigningId(null);
    setError("");
    setSuccess("");

    try {
      const res = await fetch("/api/hrm-shifts-assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.success) {
        setSuccess(`Shift assigned successfully!`);
        setShiftName("");
        setStartTime("");
        setEndTime("");
        setSelectedScope("");
        setSelectedAll(false);
        setSelectedEmployeeIds([]);
        fetchEmployees(); // Refresh list
        setTimeout(() => setSuccess(""), 3000);
      } else {
        setError(data.error || "Failed to assign shift");
      }
    } catch (err) {
      setError("Failed to assign shift");
    } finally {
      setAssigningId(null);
    }
  };

  const handleEditShift = (emp: Employee) => {
    setEditingId(emp.id);
    setEditAssignmentId(emp.assignment_id || null);
    setEditShiftName(emp.shift_name || "");
    setEditStartTime(emp.start_time || "");
    setEditEndTime(emp.end_time || "");
    setError("");
  };

  const handleUpdateShift = async () => {
    if (!editAssignmentId) {
      setError("Assignment ID is required");
      return;
    }
    if (!editStartTime || !editEndTime) {
      setError("Please fill both start and end times");
      return;
    }

    try {
      const res = await fetch("/api/hrm-shifts-assignments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editAssignmentId,
          shift_name: editShiftName,
          start_time: editStartTime,
          end_time: editEndTime,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setSuccess("Shift timing updated successfully!");
        setEditingId(null);
        fetchEmployees();
        setTimeout(() => setSuccess(""), 3000);
      } else {
        setError(data.error || "Failed to update shift");
      }
    } catch (err) {
      setError("Failed to update shift");
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditAssignmentId(null);
    setEditShiftName("");
    setEditStartTime("");
    setEditEndTime("");
    setError("");
  };

  const toggleEmployeeSelection = (empId: number) => {
    setSelectedAll(false);
    setSelectedScope("");
    setSelectedEmployeeIds((prev) =>
      prev.includes(empId) ? prev.filter((id) => id !== empId) : [...prev, empId]
    );
  };

  const handleDeleteShift = async (emp: Employee) => {
    if (!emp.assignment_id) {
      setError("No shift assignment found");
      return;
    }

    if (!confirm(`Are you sure you want to delete shift assignment for ${emp.first_name} ${emp.last_name}?`)) {
      return;
    }

    try {
      const res = await fetch("/api/hrm-shifts-assignments", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: emp.assignment_id }),
      });

      const data = await res.json();
      if (data.success) {
        setSuccess("Shift assignment deleted successfully!");
        fetchEmployees();
        setTimeout(() => setSuccess(""), 3000);
      } else {
        setError(data.error || "Failed to delete shift");
      }
    } catch (err) {
      setError("Failed to delete shift");
    }
  };

  const getStatusColor = (status: string) => {
    return status === "enabled" || status === "active"
      ? styles.statusActive
      : styles.statusInactive;
  };

  const filteredEmployees = employees.filter((emp) =>
    emp.first_name?.toLowerCase().includes(search.toLowerCase()) ||
    emp.last_name?.toLowerCase().includes(search.toLowerCase()) ||
    emp.id?.toString().includes(search) ||
    `${emp.first_name} ${emp.last_name}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  return (
    <LayoutDashboard>
      <div className={styles.pageContainer}>
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>
            <FaClock style={{ color: "#667eea" }} />
            Shift Management
          </h1>
          <p className={styles.pageSubtitle}>
            Assign shifts and timings to employees
          </p>
        </div>

        {success && <div className={styles.successMessage}>✓ {success}</div>}
        {error && (
          <div className={styles.error}>
            <FaTimesCircle /> {error}
          </div>
        )}

        <div className={styles.searchContainer}>
          <input
            type="text"
            placeholder="Search employees by name or ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={styles.searchInput}
          />
          <span className={styles.searchCount}>
            {filteredEmployees.length} / {employees.length} employees
          </span>
        </div>

        <div className={styles.controlsContainer}>
          <div className={styles.controlGroup}>
            <label className={styles.controlLabel}>Select Target</label>
            <div className={styles.customDropdown}>
              <div
                className={styles.dropdownToggle}
                onClick={() => setDropdownOpen(!dropdownOpen)}
              >
                {selectedAll ? (
                  <span className={styles.selectedBadge}>✓ All employees selected</span>
                ) : selectedScope.startsWith("dept-") ? (
                  `Department: ${departments.find(d => d.id === parseInt(selectedScope.replace("dept-", "")))?.name}`
                ) : selectedEmployeeIds.length > 0 ? (
                  `${selectedEmployeeIds.length} employee${selectedEmployeeIds.length > 1 ? "s" : ""} selected`
                ) : selectedScope === "" ? (
                  "-- Choose Target --"
                ) : (
                  "-- Choose Target --"
                )}
              </div>
              {dropdownOpen && (
                <div className={styles.dropdownMenu}>
                  <input
                    type="text"
                    placeholder="Search employees..."
                    value={targetSearch}
                    onChange={(e) => setTargetSearch(e.target.value.toLowerCase())}
                    className={styles.dropdownSearch}
                    autoFocus
                  />
                  <div className={styles.dropdownContent}>
                    <div
                      className={`${styles.dropdownOption} ${selectedAll ? styles.dropdownOptionSelected : ""}`}
                      onClick={() => {
                        setSelectedAll(true);
                        setSelectedScope("all");
                        setSelectedEmployeeIds(employees.map(e => e.id));
                        setDropdownOpen(false);
                        setTargetSearch("");
                      }}
                    >
                      <div className={styles.optionRow}>
                        <span
                          className={`${styles.optionCheckbox} ${selectedAll ? styles.optionCheckboxChecked : ""}`}
                        >
                          {selectedAll ? "✓" : ""}
                        </span>
                        <span>Assign to all employees</span>
                      </div>
                    </div>
                    
                    {departments.length > 0 && (
                      <>
                        <div className={styles.dropdownGroup}>Departments</div>
                        {departments.map((d) => (
                          <div
                            key={d.id}
                            className={`${styles.dropdownOption} ${selectedScope === `dept-${d.id}` ? styles.dropdownOptionSelected : ""}`}
                            onClick={() => {
                              setSelectedScope(`dept-${d.id}`);
                              setSelectedAll(false);
                              setSelectedEmployeeIds([]);
                              setDropdownOpen(false);
                              setTargetSearch("");
                            }}
                          >
                            <div className={styles.optionRow}>
                              <span
                                className={`${styles.optionCheckbox} ${selectedScope === `dept-${d.id}` ? styles.optionCheckboxChecked : ""}`}
                              >
                                {selectedScope === `dept-${d.id}` ? "✓" : ""}
                              </span>
                              <span>📁 {d.name}</span>
                            </div>
                          </div>
                        ))}
                      </>
                    )}

                    <div className={styles.dropdownGroup}>Employees</div>
                    {employees
                      .filter(emp =>
                        emp.first_name?.toLowerCase().includes(targetSearch) ||
                        emp.last_name?.toLowerCase().includes(targetSearch) ||
                        emp.id?.toString().includes(targetSearch)
                      )
                      .map((emp) => (
                        <div
                          key={emp.id}
                          className={`${styles.dropdownOption} ${selectedAll || selectedEmployeeIds.includes(emp.id) ? styles.dropdownOptionSelected : ""}`}
                          onClick={() => {
                            toggleEmployeeSelection(emp.id);
                            if (emp?.shift_name) {
                              setShiftName(emp.shift_name);
                              setStartTime(emp.start_time || "");
                              setEndTime(emp.end_time || "");
                            }
                          }}
                        >
                          <div className={styles.optionRow}>
                            <span
                              className={`${styles.optionCheckbox} ${selectedAll || selectedEmployeeIds.includes(emp.id) ? styles.optionCheckboxChecked : ""}`}
                            >
                              {selectedAll || selectedEmployeeIds.includes(emp.id) ? "✓" : ""}
                            </span>
                            <span>{emp.id} - {emp.first_name} {emp.last_name}</span>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className={styles.controlGroup}>
            <label className={styles.controlLabel}>Select Predefined Shift (Optional)</label>
            <select
              value={selectedMasterShift}
              onChange={(e) => handleMasterShiftChange(e.target.value)}
              className={styles.controlInput}
            >
              <option value="">-- Select from Shift Scheduler --</option>
              {masterShifts.map((shift) => (
                <option key={shift.id} value={shift.id}>
                  {shift.name} ({shift.shift_in} - {shift.shift_out})
                </option>
              ))}
            </select>
          </div>

          <div className={styles.divider}>OR Enter Manually</div>

          <div className={styles.controlGroup}>
            <label className={styles.controlLabel}>Shift Name</label>
            <input
              type="text"
              placeholder="e.g., Morning, Afternoon, Night"
              value={shiftName}
              onChange={(e) => setShiftName(e.target.value)}
              className={styles.controlInput}
            />
          </div>

          <div className={styles.controlGroup}>
            <label className={styles.controlLabel}>Start Time</label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className={styles.controlInput}
            />
          </div>

          <div className={styles.controlGroup}>
            <label className={styles.controlLabel}>End Time</label>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className={styles.controlInput}
            />
          </div>

          <button
            onClick={handleAssignShift}
            className={styles.assignButton}
            disabled={assigningId !== null}
          >
            <FaSave /> {assigningId !== null ? "Assigning..." : "Assign"}
          </button>
        </div>

        {loading ? (
          <div className={styles.loading}>Loading employees...</div>
        ) : (
          <div className={styles.employeeList}>
            <table className={styles.employeeTable}>
              <thead>
                <tr>
                  <th>Employee ID</th>
                  <th>Employee Name</th>
                  <th>Status</th>
                  <th>Assigned Shift</th>
                  <th>Shift Timing</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {employees.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", padding: "20px" }}>
                      No employees found
                    </td>
                  </tr>
                ) : (
                  filteredEmployees.map((emp) => (
                    <tr key={emp.id}>
                      <td className={styles.employeeCode}>
                        {emp.id}
                      </td>
                      <td className={styles.employeeName}>
                        {emp.first_name} {emp.last_name}
                      </td>
                      <td>
                        <span className={getStatusColor(emp.status)}>
                          {emp.status === "enabled" || emp.status === "active"
                            ? "Active"
                            : "Inactive"}
                        </span>
                      </td>
                      <td>
                        {editingId === emp.id ? (
                          <input
                            type="text"
                            value={editShiftName}
                            onChange={(e) => setEditShiftName(e.target.value)}
                            className={styles.controlInput}
                            placeholder="e.g., Morning, Afternoon"
                          />
                        ) : emp.shift_name ? (
                          <span className={styles.shiftName}>
                            {emp.shift_name}
                          </span>
                        ) : (
                          <span className={styles.noShift}>Not assigned</span>
                        )}
                      </td>
                      <td>
                        {editingId === emp.id ? (
                          <div className={styles.editTimeInputs}>
                            <input
                              type="time"
                              value={editStartTime}
                              onChange={(e) => setEditStartTime(e.target.value)}
                              className={styles.timeInput}
                            />
                            <span className={styles.timeSeparator}>-</span>
                            <input
                              type="time"
                              value={editEndTime}
                              onChange={(e) => setEditEndTime(e.target.value)}
                              className={styles.timeInput}
                            />
                          </div>
                        ) : (
                          <div className={styles.shiftInfo}>
                            {emp.start_time && emp.end_time ? (
                              <span className={styles.shiftTime}>
                                {formatTimeTo12Hour(emp.start_time)} - {formatTimeTo12Hour(emp.end_time)}
                              </span>
                            ) : (
                              <span className={styles.noShift}>-</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className={styles.actionsCell}>
                        {editingId === emp.id ? (
                          <div className={styles.actionButtons}>
                            <button
                              onClick={() => handleUpdateShift()}
                              className={styles.saveButton}
                              title="Save"
                            >
                              ✓
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              className={styles.cancelButton}
                              title="Cancel"
                            >
                              ✕
                            </button>
                          </div>
                        ) : emp.start_time && emp.end_time ? (
                          <div className={styles.actionButtons}>
                            <button
                              onClick={() => handleEditShift(emp)}
                              className={styles.editButton}
                              title="Edit timing"
                            >
                              ✎
                            </button>
                            <button
                              onClick={() => handleDeleteShift(emp)}
                              className={styles.deleteButton}
                              title="Delete shift"
                            >
                              🗑
                            </button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </LayoutDashboard>
  );
}
