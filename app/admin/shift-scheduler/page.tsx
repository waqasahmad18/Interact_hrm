"use client";
import React, { useEffect, useState } from "react";
import LayoutDashboard from "../../layout-dashboard";
import styles from "./shift-scheduler.module.css";
import { FaClock, FaPlus, FaTrash, FaEdit, FaSave, FaTimes } from "react-icons/fa";

interface Shift {
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

export default function ShiftSchedulerPage() {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  
  // New shift form state
  const [newShift, setNewShift] = useState({
    shift_name: "",
    clock_in_time: "",
    clock_out_time: "",
    overtime: false,
    work_days: "Mon-Fri"
  });

  // Edit mode state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editShift, setEditShift] = useState({
    shift_name: "",
    clock_in_time: "",
    clock_out_time: "",
    overtime: false,
    work_days: ""
  });

  useEffect(() => {
    fetchShifts();
  }, []);

  const fetchShifts = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/master-shifts");
      const data = await res.json();
      if (data.success) {
        setShifts(data.shifts || []);
      } else {
        setError(data.error || "Failed to fetch shifts");
      }
    } catch (err) {
      setError("Failed to fetch shifts");
    } finally {
      setLoading(false);
    }
  };

  const calculateTotalHours = (clockIn: string, clockOut: string): number => {
    if (!clockIn || !clockOut) return 0;
    const [inHour, inMin] = clockIn.split(":").map(Number);
    const [outHour, outMin] = clockOut.split(":").map(Number);
    const inMinutes = inHour * 60 + inMin;
    const outMinutes = outHour * 60 + outMin;
    let diff = outMinutes - inMinutes;
    if (diff < 0) diff += 24 * 60; // Handle overnight shifts
    return Math.round((diff / 60) * 10) / 10;
  };

  const handleCreateShift = async () => {
    if (!newShift.shift_name || !newShift.clock_in_time || !newShift.clock_out_time) {
      setError("Please fill all required fields");
      return;
    }

    const totalHours = calculateTotalHours(newShift.clock_in_time, newShift.clock_out_time);

    try {
      const res = await fetch("/api/master-shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newShift,
          total_hours: totalHours
        })
      });
      const data = await res.json();
      if (data.success) {
        setSuccess("Shift created successfully!");
        setNewShift({
          shift_name: "",
          clock_in_time: "",
          clock_out_time: "",
          overtime: false,
          work_days: "Mon-Fri"
        });
        fetchShifts();
        setTimeout(() => setSuccess(""), 3000);
      } else {
        setError(data.error || "Failed to create shift");
      }
    } catch (err) {
      setError("Failed to create shift");
    }
  };

  const handleEdit = (shift: Shift) => {
    setEditingId(shift.id);
    setEditShift({
      shift_name: shift.name,
      clock_in_time: shift.shift_in,
      clock_out_time: shift.shift_out,
      overtime: !!shift.overtime_daily,
      work_days: shift.working_days
    });
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;

    const totalHours = calculateTotalHours(editShift.clock_in_time, editShift.clock_out_time);

    try {
      const res = await fetch("/api/master-shifts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId,
          ...editShift,
          total_hours: totalHours
        })
      });
      const data = await res.json();
      if (data.success) {
        setSuccess("Shift updated successfully!");
        setEditingId(null);
        fetchShifts();
        setTimeout(() => setSuccess(""), 3000);
      } else {
        setError(data.error || "Failed to update shift");
      }
    } catch (err) {
      setError("Failed to update shift");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this shift?")) return;

    try {
      const res = await fetch(`/api/master-shifts?id=${id}`, {
        method: "DELETE"
      });
      const data = await res.json();
      if (data.success) {
        setSuccess("Shift deleted successfully!");
        fetchShifts();
        setTimeout(() => setSuccess(""), 3000);
      } else {
        setError(data.error || "Failed to delete shift");
      }
    } catch (err) {
      setError("Failed to delete shift");
    }
  };

  return (
    <LayoutDashboard>
      <div className={styles.page}>
        <div className={styles.header} style={{ background: "#fff", borderRadius: 12, padding: "14px 18px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)", marginBottom: 18 }}>
          <div>
            <h1 className={styles.title} style={{ margin: 0, marginBottom: 6 }}>
              <FaClock className={styles.titleIcon} />
              Shift Scheduler
            </h1>
            <p className={styles.subtitle} style={{ margin: 0 }}>Create and manage predefined shift schedules</p>
          </div>
        </div>

        {error && (
          <div className={styles.alert} style={{ background: "#fff1f0", color: "#b91c1c", border: "1px solid #f4c7c2" }}>
            {error}
          </div>
        )}

        {success && (
          <div className={styles.alert} style={{ background: "#ecfdf3", color: "#166534", border: "1px solid #b7e4c7" }}>
            {success}
          </div>
        )}

        {/* Create New Shift Form */}
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Create New Shift</h2>
          <div className={styles.form}>
            <div className={styles.row}>
              <div className={styles.field}>
                <label className={styles.label}>Shift Name *</label>
                <input
                  type="text"
                  className={styles.input}
                  placeholder="e.g., Morning, Afternoon, Night"
                  value={newShift.shift_name}
                  onChange={e => setNewShift({ ...newShift, shift_name: e.target.value })}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Clock IN Time *</label>
                <input
                  type="time"
                  className={styles.input}
                  value={newShift.clock_in_time}
                  onChange={e => setNewShift({ ...newShift, clock_in_time: e.target.value })}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Clock OUT Time *</label>
                <input
                  type="time"
                  className={styles.input}
                  value={newShift.clock_out_time}
                  onChange={e => setNewShift({ ...newShift, clock_out_time: e.target.value })}
                />
              </div>
            </div>

            <div className={styles.row}>
              <div className={styles.field}>
                <label className={styles.label}>Work Days</label>
                <input
                  type="text"
                  className={styles.input}
                  placeholder="e.g., Mon-Fri, Mon-Sat"
                  value={newShift.work_days}
                  onChange={e => setNewShift({ ...newShift, work_days: e.target.value })}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>
                  <input
                    type="checkbox"
                    checked={newShift.overtime}
                    onChange={e => setNewShift({ ...newShift, overtime: e.target.checked })}
                    style={{ marginRight: 8 }}
                  />
                  Overtime Applicable
                </label>
              </div>
            </div>

            <button className={styles.primaryButton} onClick={handleCreateShift}>
              <FaPlus /> Create Shift
            </button>
          </div>
        </div>

        {/* Predefined Shifts Table */}
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Predefined Shifts</h2>
          
          {loading ? (
            <div className={styles.loading}>Loading shifts...</div>
          ) : shifts.length === 0 ? (
            <div className={styles.empty}>No shifts created yet. Create your first shift above.</div>
          ) : (
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Shift Name</th>
                    <th>Clock IN Time</th>
                    <th>Clock OUT Time</th>
                    <th>Total Hours</th>
                    <th>Overtime</th>
                    <th>Work Days</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {shifts.map(shift => (
                    <tr key={shift.id}>
                      {editingId === shift.id ? (
                        <>
                          <td>
                            <input
                              type="text"
                              className={styles.input}
                              value={editShift.shift_name}
                              onChange={e => setEditShift({ ...editShift, shift_name: e.target.value })}
                            />
                          </td>
                          <td>
                            <input
                              type="time"
                              className={styles.input}
                              value={editShift.clock_in_time}
                              onChange={e => setEditShift({ ...editShift, clock_in_time: e.target.value })}
                            />
                          </td>
                          <td>
                            <input
                              type="time"
                              className={styles.input}
                              value={editShift.clock_out_time}
                              onChange={e => setEditShift({ ...editShift, clock_out_time: e.target.value })}
                            />
                          </td>
                          <td>{calculateTotalHours(editShift.clock_in_time, editShift.clock_out_time)}h</td>
                          <td>
                            <input
                              type="checkbox"
                              checked={editShift.overtime}
                              onChange={e => setEditShift({ ...editShift, overtime: e.target.checked })}
                            />
                          </td>
                          <td>
                            <input
                              type="text"
                              className={styles.input}
                              value={editShift.work_days}
                              onChange={e => setEditShift({ ...editShift, work_days: e.target.value })}
                            />
                          </td>
                          <td>
                            <div className={styles.actions}>
                              <button className={styles.saveButton} onClick={handleSaveEdit}>
                                <FaSave />
                              </button>
                              <button className={styles.cancelButton} onClick={() => setEditingId(null)}>
                                <FaTimes />
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className={styles.shiftName}>{shift.name}</td>
                          <td>{formatTimeTo12Hour(shift.shift_in)}</td>
                          <td>{formatTimeTo12Hour(shift.shift_out)}</td>
                          <td>{calculateTotalHours(shift.shift_in, shift.shift_out)}h</td>
                          <td>
                            <span className={shift.overtime_daily ? styles.yes : styles.no}>
                              {shift.overtime_daily ? "Yes" : "No"}
                            </span>
                          </td>
                          <td>{shift.working_days}</td>
                          <td>
                            <div className={styles.actions}>
                              <button className={styles.editButton} onClick={() => handleEdit(shift)}>
                                <FaEdit />
                              </button>
                              <button className={styles.deleteButton} onClick={() => handleDelete(shift.id)}>
                                <FaTrash />
                              </button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </LayoutDashboard>
  );
}
