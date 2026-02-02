"use client";
import React, { useEffect, useState } from "react";

import LayoutDashboard from "../../layout-dashboard";
import styles from "../../break-summary/break-summary.module.css";
import { FaUserEdit, FaTrash, FaToggleOn, FaToggleOff } from "react-icons/fa";
import Modal from "react-modal";
import AddEmployeeForm from "../../add-employee/AddEmployeeForm";

export default function EmployeeListStyledPage() {
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<any | null>(null);

  // Set app element for react-modal
  useEffect(() => {
    Modal.setAppElement('body');
  }, []);

  const handleStatusToggle = async (id: number, currentStatus: string) => {
    const newStatus = currentStatus === 'enabled' || currentStatus === 'active' ? 'inactive' : 'active';
    // Optimistically update UI
    setEmployees(prev => prev.map(e => e.id === id ? { ...e, status: newStatus } : e));
    const res = await fetch('/api/employee-list', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: newStatus })
    });
    const data = await res.json();
    if (!data.success) {
      // Revert if failed
      setEmployees(prev => prev.map(e => e.id === id ? { ...e, status: currentStatus } : e));
      alert('Status update failed: ' + (data.error || 'Unknown error'));
    }
  };

  useEffect(() => {
    fetch("/api/employee-list")
      .then(res => res.json())
      .then(async data => {
        if (data.success) {
          // Fetch attendance data to get pseudonym
          const attendanceRes = await fetch("/api/attendance?fromDate=2020-01-01&toDate=2099-12-31");
          const attendanceData = await attendanceRes.json();
          const pseudonymMap = new Map();
          if (attendanceData.success && Array.isArray(attendanceData.attendance)) {
            attendanceData.attendance.forEach((att: any) => {
              const empId = parseInt(att.employee_id);
              if (!pseudonymMap.has(empId)) {
                pseudonymMap.set(empId, att.pseudonym || '-');
              }
            });
          }
          
          // Merge pseudonym into employees
          const enrichedEmployees = data.employees.map((emp: any) => ({
            ...emp,
            pseudonym: pseudonymMap.get(emp.id) || '-'
          }));
          setEmployees(enrichedEmployees);
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

  const handleDelete = async (id: number) => {
    if (!window.confirm("Are you sure you want to delete this employee?")) return;
    const res = await fetch("/api/employee-list", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    });
    const data = await res.json();
    if (data.success) {
      setEmployees(employees.filter(e => e.id !== id));
    } else {
      alert("Delete failed: " + (data.error || "Unknown error"));
    }
  };

  const filtered = employees.filter(e => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    const empId = (e.employee_code || e.id || '').toString();
    return (
      (e.first_name || "").toLowerCase().includes(searchLower) ||
      (e.last_name || "").toLowerCase().includes(searchLower) ||
      empId.includes(searchLower)
    );
  });

  return (
    <LayoutDashboard>
      <div className={styles.breakSummaryContainer}>
        <div className={styles.breakSummaryHeader}>Employee List</div>
        <div className={styles.breakSummaryFilters}>
          <input
            type="text"
            placeholder="Search employee..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className={styles.breakSummaryInput}
            style={{ width: 180 }}
          />
        </div>
        <div className={styles.breakSummaryTableWrapper}>
          <table className={styles.breakSummaryTable}>
            <thead>
              <tr>
                <th>Id</th>
                <th>Full Name</th>
                <th>P.Name</th>
                <th>Department</th>
                <th>Gender</th>
                <th>Nationality</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8}>Loading...</td></tr>
              ) : error ? (
                <tr><td colSpan={8} style={{ color: 'red' }}>{error}</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8}>No records found.</td></tr>
              ) : (
                filtered.map((e, idx) => (
                  <tr key={e.id}>
                    <td>{e.id}</td>
                    <td>{[e.first_name, e.middle_name, e.last_name].filter(Boolean).join(" ")}</td>
                    <td>{e.pseudonym || '-'}</td>
                    <td>{e.department_name || '-'}</td>
                    <td>{e.gender ? e.gender.charAt(0).toUpperCase() + e.gender.slice(1).toLowerCase() : '-'}</td>
                    <td>{e.nationality || '-'}</td>
                    <td style={{fontWeight:600, color:e.status==='active'||e.status==='enabled'?'#38A169':'#E53E3E'}}>
                      {e.status === 'active' || e.status === 'enabled' ? 'Active' : 'Inactive'}
                    </td>
                    <td>
                      <button
                        title={e.status === 'active' || e.status === 'enabled' ? 'Set Inactive' : 'Set Active'}
                        style={{ background: 'none', border: 'none', color: e.status === 'active' || e.status === 'enabled' ? '#00b894' : '#b2bec3', cursor: 'pointer', marginRight: 8, fontSize: '1.3rem' }}
                        onClick={() => handleStatusToggle(e.id, e.status)}
                      >
                        {e.status === 'active' || e.status === 'enabled' ? <FaToggleOn /> : <FaToggleOff />}
                      </button>
                      <button
                        title="Edit"
                        style={{ background: 'none', border: 'none', color: '#0052CC', cursor: 'pointer', marginRight: 8 }}
                        onClick={() => { setModalOpen(true); setSelectedEmployee(e); }}
                      >
                        <FaUserEdit />
                      </button>
                      <button title="Delete" style={{ background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer' }} onClick={() => handleDelete(e.id)}>
                        <FaTrash />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      {/* Employee Edit Modal */}
      <Modal
        isOpen={modalOpen}
        onRequestClose={() => { setModalOpen(false); setSelectedEmployee(null); }}
        contentLabel="Edit Employee"
        style={{ overlay: { zIndex: 1000, background: "rgba(0,0,0,0.18)" }, content: { maxWidth: 900, margin: "auto", borderRadius: 16, padding: 24 } }}
      >
        {selectedEmployee ? (
          <div>
            <AddEmployeeForm
              edit={true}
              employeeId={selectedEmployee.employee_code || String(selectedEmployee.id)}
              onSaved={() => {
                setModalOpen(false);
                setSelectedEmployee(null);
                // Refresh employee list
                fetch("/api/employee-list")
                  .then(res => res.json())
                  .then(data => {
                    if (data.success) setEmployees(data.employees);
                  });
              }}
            />
            <div style={{ display: "flex", gap: 12, marginTop: 18 }}>
              <button style={{ background: "#EDF2F7", color: "#0052CC", border: "none", borderRadius: 8, padding: "8px 18px", fontWeight: 600, cursor: "pointer" }} onClick={() => { setModalOpen(false); setSelectedEmployee(null); }}>Close</button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  </LayoutDashboard>
  );
}