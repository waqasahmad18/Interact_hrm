"use client";
import LayoutDashboard from "../layout-dashboard";
import React, { useEffect, useState } from "react";

export default function LeavePage() {
  const [leaves, setLeaves] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedLeave, setSelectedLeave] = useState<any | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [rejectRemark, setRejectRemark] = useState("");
  const [balanceInfo, setBalanceInfo] = useState<any | null>(null);

  // WebSocket for real-time updates
  useEffect(() => {
    const ws = new WebSocket("ws://localhost:3000/api/ws");
    ws.onmessage = (event) => {
      fetchLeaves();
    };
    return () => ws.close();
  }, []);

  // Fetch all leave requests
  const fetchLeaves = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/leaves");
      const data = await res.json();
      if (data.success) {
        setLeaves(data.leaves);
      } else {
        setError(data.error || "Failed to fetch leaves");
      }
    } catch (e) {
      setError("Failed to fetch leaves");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchLeaves();
  }, []);

  const handleDocumentDownload = (docPath: string) => {
    // docPath is like /uploads/uuid.pdf
    const filename = docPath.split('/').pop() || docPath;
    const link = document.createElement('a');
    link.href = `/api/attachments/download?filename=${encodeURIComponent(filename)}`;
    link.download = filename;
    link.click();
  };

  // Approve/Reject handlers
  const handleAction = async (id: number, status: "approved" | "rejected") => {
    try {
      await fetch("/api/leaves", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status, admin_remark: status === "rejected" ? rejectRemark : undefined }),
      });
      fetchLeaves();
      setModalOpen(false);
    } catch {
      // Optionally show error
    }
  };

  // Modal for leave details
  const openModal = async (leave: any) => {
    setSelectedLeave(leave);
    setModalOpen(true);
    setRejectRemark("");
    try {
      if (leave?.employee_id) {
        const res = await fetch(`/api/leave-balance?employee_id=${leave.employee_id}`);
        const data = await res.json();
        if (data.success) {
          setBalanceInfo(data);
        } else {
          setBalanceInfo(null);
        }
      } else {
        setBalanceInfo(null);
      }
    } catch {
      setBalanceInfo(null);
    }
  };
  const closeModal = () => {
    setModalOpen(false);
    setSelectedLeave(null);
    setRejectRemark("");
    setBalanceInfo(null);
  };

  return (
    <LayoutDashboard>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
        <h1 style={{ color: "#2b6cb0", fontWeight: 700, fontSize: "1.5rem", marginBottom: 18 }}>Leave Requests</h1>
        {loading ? (
          <div>Loading...</div>
        ) : error ? (
          <div style={{ color: "#e74c3c" }}>{error}</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", background: "#fff", borderRadius: 8, boxShadow: "0 2px 8px #e2e8f0" }}>
            <thead>
              <tr style={{ background: "#f7fafc" }}>
                <th style={thStyle}>Employee ID</th>
                <th style={thStyle}>Employee Name</th>
                <th style={thStyle}>Category</th>
                <th style={thStyle}>Dates</th>
                <th style={thStyle}>Days</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Requested At</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {leaves.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: "center", color: "#888", padding: 16 }}>No leave requests yet.</td></tr>
              )}
              {leaves.map(l => (
                <tr key={l.id}>
                  <td style={tdStyle}>{l.employee_id}</td>
                  <td style={tdStyle}>{l.employee_name || ""}</td>
                  <td style={tdStyle}>{l.leave_category}</td>
                    <td style={tdStyle}>{formatDate(l.start_date)} - {formatDate(l.end_date)}</td>
                  <td style={tdStyle}>{l.total_days}</td>
                  <td style={{ ...tdStyle, color: l.status === "approved" ? "#27ae60" : l.status === "rejected" ? "#e74c3c" : "#e67e22", fontWeight: 600 }}>{l.status}</td>
                  <td style={tdStyle}>{l.requested_at ? new Date(l.requested_at).toLocaleString() : ""}</td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => openModal(l)} style={btnView}>View</button>
                      {l.status === "pending" && (
                        <>
                          <button onClick={() => handleAction(l.id, "approved")} style={btnApprove}>Approve</button>
                          <button onClick={() => handleAction(l.id, "rejected")} style={btnReject}>Reject</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Modal for leave details */}
        {modalOpen && selectedLeave && (
          <div style={modalOverlay} onClick={closeModal}>
            <div style={modalContent} onClick={e => e.stopPropagation()}>
              <h2 style={{ color: "#2b6cb0", fontWeight: 700, fontSize: "1.3rem", marginBottom: 10 }}>Leave Details</h2>
              <div><b>Employee ID:</b> {selectedLeave.employee_id}</div>
              <div><b>Category:</b> {selectedLeave.leave_category}</div>
                <div><b>Dates:</b> {formatDate(selectedLeave.start_date)} - {formatDate(selectedLeave.end_date)} ({selectedLeave.total_days} days)</div>
              <div><b>Status:</b> <span style={{ color: selectedLeave.status === "approved" ? "#27ae60" : selectedLeave.status === "rejected" ? "#e74c3c" : "#e67e22", fontWeight: 600 }}>{selectedLeave.status}</span></div>
              <div><b>Reason (Employee):</b> <span style={{ color: "#333" }}>{selectedLeave.reason}</span></div>
              {selectedLeave.admin_remark && (
                <div><b>Admin Remarks:</b> <span style={{ color: "#333" }}>{selectedLeave.admin_remark}</span></div>
              )}
              {balanceInfo && (
                <div style={{ marginTop: 10 }}>
                  <b>Current Balances:</b>
                  <div>{(balanceInfo.employment_status === 'Probation' ? 'Leave Balance' : 'Annual Leave Balance')}: {balanceInfo.annualBalance} / {balanceInfo.annualAllowance}</div>
                  <div>Bereavement Balance: {balanceInfo.bereavementBalance} / 3</div>
                </div>
              )}
              <div><b>Documents:</b> {(() => { const docs = typeof selectedLeave.document_paths === 'string' ? JSON.parse(selectedLeave.document_paths || '[]') : selectedLeave.document_paths; return Array.isArray(docs) && docs.length > 0 ? docs.map((d: string) => <span key={d} style={{marginRight: 8}}><button style={{background: '#3478f6', color: '#fff', border: 'none', borderRadius: 4, padding: '2px 8px', cursor: 'pointer'}} onClick={() => handleDocumentDownload(d)}>📄 {d}</button></span>) : <span style={{color: '#999'}}>No documents</span>; })()}</div>
              <div><b>Requested At:</b> {selectedLeave.requested_at ? new Date(selectedLeave.requested_at).toLocaleString() : ""}</div>
              {selectedLeave.status === "pending" && (
                <div style={{ marginTop: 18 }}>
                  <div style={{ marginBottom: 10 }}>
                    <label style={{ fontWeight: 600 }}>Admin Remarks (for rejection)</label>
                    <textarea value={rejectRemark} onChange={e => setRejectRemark(e.target.value)} rows={2} style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #ccc" }} placeholder="Reason for rejection (optional but recommended)" />
                  </div>
                  <button onClick={() => handleAction(selectedLeave.id, "approved")} style={btnApprove}>Approve</button>
                  <button onClick={() => handleAction(selectedLeave.id, "rejected")} style={btnReject}>Reject</button>
                </div>
              )}
              <button onClick={closeModal} style={btnClose}>Close</button>
            </div>
          </div>
        )}
      </div>
    </LayoutDashboard>
  );
}
// Format date as dd/mm/yyyy
function formatDate(dateString: string) {
  if (!dateString) return "";
  const d = new Date(dateString);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

const thStyle = { padding: "10px 8px", fontWeight: 700, color: "#2b6cb0", borderBottom: "1px solid #e2e8f0", textAlign: "left" };
const tdStyle = { padding: "8px 8px", borderBottom: "1px solid #f0f0f0" };
const btnApprove = { background: "#27ae60", color: "#fff", border: "none", borderRadius: 6, padding: "4px 12px", marginRight: 6, cursor: "pointer" };
const btnReject = { background: "#e74c3c", color: "#fff", border: "none", borderRadius: 6, padding: "4px 12px", cursor: "pointer" };
const btnView = { background: "#3478f6", color: "#fff", border: "none", borderRadius: 6, padding: "4px 12px", marginRight: 6, cursor: "pointer" };
const btnClose = { background: "#888", color: "#fff", border: "none", borderRadius: 6, padding: "4px 18px", marginTop: 18, cursor: "pointer" };
const modalOverlay = { position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", background: "rgba(0,0,0,0.25)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 };
const modalContent = { background: "#fff", borderRadius: 12, padding: 32, minWidth: 350, maxWidth: 500, boxShadow: "0 2px 16px #888" };