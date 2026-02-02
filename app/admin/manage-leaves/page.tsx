"use client";

import React, { useState, useEffect } from "react";
import LayoutDashboard from "../../layout-dashboard";
import styles from "./manage-leaves.module.css";

interface Employee {
  id: number;
  first_name: string;
  last_name: string;
  employee_code: string;
  employment_status: string;
  annual_allowance: number;
  bereavement_allowance: number;
  annual_used: number;
  bereavement_used: number;
  annual_current_balance: number;
  bereavement_current_balance: number;
  annual_balance_adjustment: number;
  bereavement_balance_adjustment: number;
  department_name?: string;
  pseudonym?: string;
}

export default function ManageLeavesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    annual_current_balance: 20,
    bereavement_current_balance: 3
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchEmployees();
  }, []);

  async function fetchEmployees() {
    try {
      setLoading(true);
      const res = await fetch("/api/employee-leave-allowances");
      const data = await res.json();
      if (data.success) {
        // Create a map to hold pseudonym and department for each employee
        const empDetailsMap = new Map();
        
        // Fetch all attendance records to get pseudonym and department
        try {
          const attendanceRes = await fetch("/api/attendance?fromDate=2020-01-01&toDate=2099-12-31");
          const attendanceData = await attendanceRes.json();
          if (attendanceData.success && Array.isArray(attendanceData.attendance)) {
            attendanceData.attendance.forEach((att: any) => {
              const empId = parseInt(att.employee_id);
              if (!empDetailsMap.has(empId)) {
                empDetailsMap.set(empId, {
                  pseudonym: att.pseudonym || '-',
                  department_name: att.department_name || '-'
                });
              }
            });
          }
        } catch (err) {
          console.error("Error fetching attendance:", err);
        }
        
        // Merge data into employees
        const enrichedEmployees = data.employees.map((emp: Employee) => ({
          ...emp,
          department_name: empDetailsMap.get(emp.id)?.department_name || '-',
          pseudonym: empDetailsMap.get(emp.id)?.pseudonym || '-'
        }));
        setEmployees(enrichedEmployees);
      } else {
        alert("Failed to fetch employees: " + data.error);
      }
    } catch (error) {
      alert("Error fetching employees: " + String(error));
    } finally {
      setLoading(false);
    }
  }

  function handleEdit(employee: Employee) {
    setEditingEmployee(employee);
    setFormData({
      annual_current_balance: employee.annual_current_balance,
      bereavement_current_balance: employee.bereavement_current_balance
    });
    setShowModal(true);
  }

  async function handleSave() {
    if (!editingEmployee) return;

    try {
      setSaving(true);
      const res = await fetch("/api/employee-leave-allowances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee_id: editingEmployee.id,
          ...formData
        })
      });

      const data = await res.json();
      if (data.success) {
        alert("Leave balance updated successfully!");
        setShowModal(false);
        setEditingEmployee(null);
        fetchEmployees();
      } else {
        alert("Failed to update: " + data.error);
      }
    } catch (error) {
      alert("Error updating: " + String(error));
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setShowModal(false);
    setEditingEmployee(null);
  }

  if (loading) {
    return (
      <LayoutDashboard>
        <div className={styles.container}>
          <h1 className={styles.title}>Manage Leaves</h1>
          <p>Loading employees...</p>
        </div>
      </LayoutDashboard>
    );
  }

  return (
    <LayoutDashboard>
      <div className={styles.container}>
        <div style={{ background: "#fff", borderRadius: 12, padding: "14px 18px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)", marginBottom: 18 }}>
          <h1 className={styles.title} style={{ margin: 0, marginBottom: 6 }}>Manage Leaves</h1>
          <p className={styles.subtitle} style={{ margin: 0 }}>
            Update leave balances for Employees.
          </p>
        </div>

        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead>
              <tr style={{ background: "linear-gradient(135deg, #0052CC 0%, #00B8A9 100%)", color: "#fff" }}>
                <th style={{ color: "#fff", fontSize: "12px", padding: "10px 6px", whiteSpace: "nowrap" }}>Id</th>
                <th style={{ color: "#fff", fontSize: "12px", padding: "10px 6px", whiteSpace: "nowrap" }}>Full Name</th>
                <th style={{ color: "#fff", fontSize: "12px", padding: "10px 6px", whiteSpace: "nowrap" }}>P.Name</th>
                <th style={{ color: "#fff", fontSize: "12px", padding: "10px 6px", whiteSpace: "nowrap" }}>Department</th>
                <th style={{ color: "#fff", fontSize: "12px", padding: "10px 6px", whiteSpace: "nowrap" }}>Employment Status</th>
                <th style={{ color: "#fff", fontSize: "12px", padding: "10px 6px", whiteSpace: "nowrap" }}>Annual Leave Balance</th>
                <th style={{ color: "#fff", fontSize: "12px", padding: "10px 6px", whiteSpace: "nowrap" }}>Bereavement Leave Balance</th>
                <th style={{ color: "#fff", fontSize: "12px", padding: "10px 6px", whiteSpace: "nowrap" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {employees.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: "center" }}>
                    No employees found
                  </td>
                </tr>
              ) : (
                employees.map((emp) => {
                  return (
                    <tr key={emp.id}>
                      <td style={{ fontSize: "13px", padding: "8px 6px", whiteSpace: "nowrap" }}>{emp.id}</td>
                      <td style={{ fontSize: "13px", padding: "8px 6px", whiteSpace: "nowrap" }}>{emp.first_name} {emp.last_name}</td>
                      <td style={{ fontSize: "13px", padding: "8px 6px", whiteSpace: "nowrap" }}>{emp.pseudonym || '-'}</td>
                      <td style={{ fontSize: "13px", padding: "8px 6px", whiteSpace: "nowrap" }}>{emp.department_name || '-'}</td>
                      <td style={{ fontSize: "13px", padding: "8px 6px", whiteSpace: "nowrap" }}>
                        <span className={emp.employment_status === "Permanent" ? styles.statusPermanent : styles.statusProbation}>
                          {emp.employment_status || "Permanent"}
                        </span>
                      </td>
                      <td style={{ fontSize: "13px", padding: "8px 6px", whiteSpace: "nowrap" }}>
                        <span style={{ fontWeight: 600, color: '#2563eb' }}>
                          {emp.annual_current_balance} / {emp.annual_allowance}
                        </span>
                      </td>
                      <td style={{ fontSize: "13px", padding: "8px 6px", whiteSpace: "nowrap" }}>
                        <span style={{ fontWeight: 600, color: '#2563eb' }}>
                          {emp.bereavement_current_balance} / {emp.bereavement_allowance}
                        </span>
                      </td>
                      <td style={{ fontSize: "13px", padding: "8px 6px", whiteSpace: "nowrap" }}>
                        <button
                          className={styles.editBtn}
                          onClick={() => handleEdit(emp)}
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Edit Modal */}
        {showModal && editingEmployee && (
          <div className={styles.modalOverlay}>
            <div className={styles.modal}>
              <h2 className={styles.modalTitle}>
                Update Leave Allowance
              </h2>
              <p className={styles.modalSubtitle}>
                {editingEmployee.first_name} {editingEmployee.last_name} ({editingEmployee.employment_status || "Permanent"})
              </p>

              <p className={styles.infoText}>
                Total Allowance: <strong>{editingEmployee.annual_allowance}</strong> Annual, <strong>{editingEmployee.bereavement_allowance}</strong> Bereavement (Fixed)
              </p>

              <div className={styles.currentBalances}>
                <div className={styles.balanceCard}>
                  <div className={styles.balanceLabel}>Current Annual Leave</div>
                  <div className={styles.balanceValue}>
                    <span className={styles.remaining}>{editingEmployee.annual_current_balance}</span>
                    <span className={styles.separator}>/</span>
                    <span className={styles.total}>{editingEmployee.annual_allowance}</span>
                  </div>
                </div>
                
                <div className={styles.balanceCard}>
                  <div className={styles.balanceLabel}>Current Bereavement Leave</div>
                  <div className={styles.balanceValue}>
                    <span className={styles.remaining}>{editingEmployee.bereavement_current_balance}</span>
                    <span className={styles.separator}>/</span>
                    <span className={styles.total}>{editingEmployee.bereavement_allowance}</span>
                  </div>
                </div>
              </div>

              <div className={styles.formGroup}>
                <label>Update Annual Current Balance</label>
                <input
                  type="number"
                  min="0"
                  value={formData.annual_current_balance}
                  onChange={(e) => setFormData({ ...formData, annual_current_balance: parseInt(e.target.value) || 0 })}
                  className={styles.input}
                />
                <div className={styles.helpText}>
                  {formData.annual_current_balance > editingEmployee.annual_current_balance && 
                    <span style={{color: '#10b981'}}>+{formData.annual_current_balance - editingEmployee.annual_current_balance} leaves added</span>
                  }
                  {formData.annual_current_balance < editingEmployee.annual_current_balance && 
                    <span style={{color: '#ef4444'}}>{formData.annual_current_balance - editingEmployee.annual_current_balance} leaves removed</span>
                  }
                  {formData.annual_current_balance === editingEmployee.annual_current_balance && 
                    <span>No change</span>
                  }
                </div>
              </div>

              <div className={styles.formGroup}>
                <label>Update Bereavement Current Balance</label>
                <input
                  type="number"
                  min="0"
                  value={formData.bereavement_current_balance}
                  onChange={(e) => setFormData({ ...formData, bereavement_current_balance: parseInt(e.target.value) || 0 })}
                  className={styles.input}
                />
                <div className={styles.helpText}>
                  {formData.bereavement_current_balance > editingEmployee.bereavement_current_balance && 
                    <span style={{color: '#10b981'}}>+{formData.bereavement_current_balance - editingEmployee.bereavement_current_balance} leaves added</span>
                  }
                  {formData.bereavement_current_balance < editingEmployee.bereavement_current_balance && 
                    <span style={{color: '#ef4444'}}>{formData.bereavement_current_balance - editingEmployee.bereavement_current_balance} leaves removed</span>
                  }
                  {formData.bereavement_current_balance === editingEmployee.bereavement_current_balance && 
                    <span>No change</span>
                  }
                </div>
              </div>

              <div className={styles.modalActions}>
                <button
                  className={styles.cancelBtn}
                  onClick={handleCancel}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  className={styles.saveBtn}
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </LayoutDashboard>
  );
}
