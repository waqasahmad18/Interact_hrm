"use client";

import OptionalAdminShell from "@/app/components/OptionalAdminShell";
import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  getDateStringInTimeZone,
  getTimeStringInTimeZone,
  SERVER_TIMEZONE,
} from "../../lib/timezone";
import { FaFilter, FaSort, FaSortUp, FaSortDown } from "react-icons/fa";
import tableStyles from "../break-summary/break-summary.module.css";
import styles from "./leave.module.css";
import { EmployeeTableNameCell } from "../components/EmployeeTableNameCell";
import { useEmployeeDetailPopup } from "../components/use-employee-detail-popup";
import {
  canApproveStep1,
  canApproveStep2,
  leaveStatusLabel,
  normStep,
} from "@/lib/leave-approval";
import { rowAllowedByScope, useViewerDataScope } from "@/lib/access-control/use-viewer-scope";

type LeaveSortKey =
  | "employee_id"
  | "employee_name"
  | "pseudonym"
  | "department_name"
  | "leave_category"
  | "start_date"
  | "total_days"
  | "status"
  | "step1_status"
  | "step2_status"
  | "requested_at";

type SortDirection = "asc" | "desc";

function formatDate(dateString: string) {
  if (!dateString) return "";
  const dateKey = getDateStringInTimeZone(dateString, SERVER_TIMEZONE);
  const [year, month, day] = dateKey.split("-");
  return `${day}/${month}/${year}`;
}

function formatDateTime(dateTimeString: string) {
  if (!dateTimeString) return "";
  const dateKey = getDateStringInTimeZone(dateTimeString, SERVER_TIMEZONE);
  const timeStr = getTimeStringInTimeZone(dateTimeString, SERVER_TIMEZONE);
  const [year, month, day] = dateKey.split("-");
  return `${day}/${month}/${year} ${timeStr}`;
}

function parseDocs(document_paths?: string | string[]) {
  if (!document_paths) return [];
  if (typeof document_paths === "string") {
    try {
      const parsed = JSON.parse(document_paths || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return Array.isArray(document_paths) ? document_paths : [];
}

function statusBadgeClass(status: string) {
  const s = status.toLowerCase();
  if (s === "approved" || s.startsWith("approved")) return styles.badgeApproved;
  if (s === "rejected" || s.includes("rejected")) return styles.badgeRejected;
  return styles.badgePending;
}

function stepBadgeClass(step: string) {
  const s = normStep(step);
  if (s === "approved") return styles.badgeApproved;
  if (s === "rejected") return styles.badgeRejected;
  return styles.badgePending;
}

export default function LeavePage() {
  const viewerScope = useViewerDataScope();
  const [leaves, setLeaves] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedLeave, setSelectedLeave] = useState<any | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [rejectRemark, setRejectRemark] = useState("");
  const [balanceInfo, setBalanceInfo] = useState<any | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: LeaveSortKey; direction: SortDirection } | null>(
    null
  );
  const { openFromRow, popup, getPhoto } = useEmployeeDetailPopup();

  const fetchLeaves = async (scope = viewerScope) => {
    setLoading(true);
    setError("");
    try {
      const leaveUrl =
        scope.mode !== "all" && scope.employeeIds.length
          ? `/api/leaves?employees=${encodeURIComponent(scope.employeeIds.join(","))}`
          : "/api/leaves";
      const res = await fetch(leaveUrl, { cache: "no-store" });
      const data = await res.json();
      if (data.success) {
        const empRes = await fetch("/api/employee-list", { cache: "no-store" });
        const empData = await empRes.json();
        const empMap = new Map<string, { employee_name: string; pseudonym: string; department_name: string }>();
        if (empData.success && Array.isArray(empData.employees)) {
          empData.employees.forEach((emp: any) => {
            const fullName = `${emp?.first_name || ""} ${emp?.last_name || ""}`.trim();
            const profile = {
              employee_name: fullName || "-",
              pseudonym: emp.pseudonym || "-",
              department_name: emp.department_name || "-",
            };
            if (emp?.id !== undefined && emp?.id !== null) {
              empMap.set(String(emp.id).trim(), profile);
            }
            if (emp?.employee_code) {
              empMap.set(String(emp.employee_code).trim(), profile);
            }
          });
        }
        const enrichedLeaves = (data.leaves || [])
          .map((l: any) => {
            const employeeKey = String(l?.employee_id ?? "").trim();
            const emp = empMap.get(employeeKey);
            return {
              ...l,
              employee_name: l?.employee_name || emp?.employee_name || "-",
              pseudonym: emp?.pseudonym || "-",
              department_name: emp?.department_name || "-",
            };
          })
          .filter((l: any) =>
            rowAllowedByScope(scope, l.employee_id, l.department_name),
          );
        setLeaves(enrichedLeaves);
      } else {
        setError(data.error || "Failed to fetch leaves");
      }
    } catch {
      setError("Failed to fetch leaves");
    }
    setLoading(false);
  };

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_ENABLE_WS !== "true") return;

    let ws: WebSocket | null = null;

    const setupRealtime = async () => {
      try {
        const protocol = window.location.protocol === "https:" ? "wss" : "ws";
        ws = new WebSocket(`${protocol}://${window.location.host}/api/ws`);
        ws.onmessage = () => {
          void fetchLeaves();
        };
      } catch {
        /* optional realtime */
      }
    };

    void setupRealtime();
    return () => ws?.close();
  }, []);

  useEffect(() => {
    void fetchLeaves(viewerScope);
    // Refetch when scope finishes loading / changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerScope.mode, viewerScope.employeeIds.join(",")]);

  const stats = useMemo(() => {
    let pending = 0;
    let approved = 0;
    let rejected = 0;
    leaves.forEach((l) => {
      const s = String(l?.status || "pending").toLowerCase();
      if (s === "approved") approved += 1;
      else if (s === "rejected") rejected += 1;
      else pending += 1;
    });
    return { pending, approved, rejected, total: leaves.length };
  }, [leaves]);

  const handleDocumentDownload = (docPath: string) => {
    const filename = docPath.split("/").pop() || docPath;
    const link = document.createElement("a");
    link.href = `/api/attachments/download?filename=${encodeURIComponent(filename)}`;
    link.download = filename;
    link.click();
  };

  const handleAction = async (
    id: number,
    action: "approve_step1" | "approve_step2" | "approve" | "reject",
  ) => {
    try {
      await fetch("/api/leaves", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          action,
          admin_remark: action === "reject" ? rejectRemark : undefined,
        }),
      });
      void fetchLeaves();
      setModalOpen(false);
      setSelectedLeave(null);
      setRejectRemark("");
      setBalanceInfo(null);
    } catch {
      /* keep state */
    }
  };

  const openModal = async (leave: any) => {
    setSelectedLeave(leave);
    setModalOpen(true);
    setRejectRemark("");
    try {
      if (leave?.employee_id) {
        const res = await fetch(`/api/leave-balance?employee_id=${leave.employee_id}`);
        const data = await res.json();
        setBalanceInfo(data.success ? data : null);
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

  const handleFilterClick = (key: LeaveSortKey) => {
    setSortConfig((prev) => {
      if (prev?.key === key) return null;
      return { key, direction: "asc" };
    });
  };

  const handleSortToggle = (key: LeaveSortKey) => {
    setSortConfig((prev) => {
      if (!prev || prev.key !== key) return { key, direction: "asc" };
      return { key, direction: prev.direction === "asc" ? "desc" : "asc" };
    });
  };

  const getSortIcon = (key: LeaveSortKey) => {
    if (!sortConfig || sortConfig.key !== key) return <FaSort style={{ opacity: 0.75 }} />;
    return sortConfig.direction === "asc" ? <FaSortUp /> : <FaSortDown />;
  };

  const sortedLeaves = useMemo(() => {
    if (!sortConfig) return leaves;
    const { key, direction } = sortConfig;
    const getText = (v: unknown) => String(v || "").toLowerCase();

    return [...leaves].sort((a, b) => {
      let cmp = 0;
      switch (key) {
        case "employee_id":
        case "total_days":
          cmp = Number(a[key] || 0) - Number(b[key] || 0);
          break;
        case "employee_name":
        case "pseudonym":
        case "department_name":
        case "leave_category":
          cmp = getText(a[key]).localeCompare(getText(b[key]), undefined, { sensitivity: "base" });
          break;
        case "status":
        case "step1_status":
        case "step2_status":
          cmp = getText(a[key] || a.status).localeCompare(getText(b[key] || b.status), undefined, {
            sensitivity: "base",
          });
          break;
        case "start_date":
          cmp = new Date(a.start_date || 0).getTime() - new Date(b.start_date || 0).getTime();
          break;
        case "requested_at":
          cmp = new Date(a.requested_at || 0).getTime() - new Date(b.requested_at || 0).getTime();
          break;
        default:
          cmp = 0;
      }
      return direction === "asc" ? cmp : -cmp;
    });
  }, [leaves, sortConfig]);

  const sortButtonStyle: React.CSSProperties = {
    border: "none",
    background: "transparent",
    color: "#fff",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    fontSize: "0.8rem",
  };

  const renderSortableHeader = (label: string, key: LeaveSortKey) => {
    const isActive = sortConfig?.key === key;
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <button
            type="button"
            onClick={() => handleFilterClick(key)}
            style={{ ...sortButtonStyle, opacity: isActive ? 1 : 0.78 }}
            title={isActive ? `Clear ${label} sort` : `Apply ${label} sort`}
            aria-label={isActive ? `Clear ${label} sort` : `Apply ${label} sort`}
          >
            <FaFilter />
          </button>
          <button
            type="button"
            onClick={() => handleSortToggle(key)}
            style={sortButtonStyle}
            title={`Toggle sort direction for ${label}`}
            aria-label={`Toggle sort direction for ${label}`}
          >
            {getSortIcon(key)}
          </button>
        </div>
        <span>{label}</span>
      </div>
    );
  };

  const selectedStatus = leaveStatusLabel(selectedLeave || {});
  const selectedCanStep1 = selectedLeave ? canApproveStep1(selectedLeave) : false;
  const selectedCanStep2 = selectedLeave ? canApproveStep2(selectedLeave) : false;
  const selectedPending = selectedCanStep1 || selectedCanStep2;

  return (
    <OptionalAdminShell>
      <div className={styles.page}>
        <div className={styles.inner}>
          <h1 className={styles.title}>Leave requests</h1>
          <p className={styles.subtitle}>
            Two-step approval: 1st step, then 2nd (final).
          </p>

          <div className={styles.statRow}>
            <div className={`${styles.statCard} ${styles.statCardGold}`}>
              <p className={styles.statLabel}>Pending</p>
              <p className={styles.statValue}>{stats.pending}</p>
            </div>
            <div className={`${styles.statCard} ${styles.statCardGreen}`}>
              <p className={styles.statLabel}>Approved</p>
              <p className={styles.statValue}>{stats.approved}</p>
            </div>
            <div className={`${styles.statCard} ${styles.statCardPurple}`}>
              <p className={styles.statLabel}>Total requests</p>
              <p className={styles.statValue}>{stats.total}</p>
            </div>
          </div>

          {loading ? (
            <div className={styles.loading}>Loading leave requests…</div>
          ) : error ? (
            <div className={styles.alertError}>{error}</div>
          ) : (
            <div className={styles.tableCard}>
              <div className={tableStyles.breakSummaryTableWrapper}>
                <table className={tableStyles.breakSummaryTable}>
                  <thead>
                    <tr>
                      <th>{renderSortableHeader("Id", "employee_id")}</th>
                      <th>{renderSortableHeader("Full Name", "employee_name")}</th>
                      <th>{renderSortableHeader("P.Name", "pseudonym")}</th>
                      <th>{renderSortableHeader("Department", "department_name")}</th>
                      <th>{renderSortableHeader("Category", "leave_category")}</th>
                      <th>{renderSortableHeader("Dates", "start_date")}</th>
                      <th>{renderSortableHeader("Days", "total_days")}</th>
                      <th>{renderSortableHeader("1st step", "step1_status")}</th>
                      <th>{renderSortableHeader("2nd step", "step2_status")}</th>
                      <th>{renderSortableHeader("Status", "status")}</th>
                      <th>{renderSortableHeader("Requested", "requested_at")}</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedLeaves.length === 0 ? (
                      <tr>
                        <td colSpan={12} className={tableStyles.breakSummaryNoRecords}>
                          No leave requests yet.
                        </td>
                      </tr>
                    ) : (
                      sortedLeaves.map((l, idx) => {
                        const statusLabel = leaveStatusLabel(l);
                        const s1 = normStep(l.step1_status);
                        const s2 = normStep(l.step2_status);
                        const showStep1 = canApproveStep1(l);
                        const showStep2 = canApproveStep2(l);
                        const pending = showStep1 || showStep2;
                        return (
                          <tr
                            key={
                              l?.id ??
                              `${l?.employee_id || "emp"}-${l?.start_date || "start"}-${l?.end_date || "end"}-${idx}`
                            }
                          >
                            <td className={tableStyles.cellMuted}>{l.employee_id}</td>
                            <td>
                              <EmployeeTableNameCell
                                name={l.employee_name || ""}
                                employeeId={l.employee_id}
                                photo={getPhoto(l.employee_id)}
                                onOpen={() => openFromRow(l)}
                              />
                            </td>
                            <td>{l.pseudonym || "—"}</td>
                            <td>{l.department_name || "—"}</td>
                            <td style={{ textTransform: "capitalize" }}>{l.leave_category}</td>
                            <td>
                              {formatDate(l.start_date)} – {formatDate(l.end_date)}
                            </td>
                            <td>{l.total_days}</td>
                            <td>
                              <span className={`${styles.badge} ${stepBadgeClass(s1)}`}>{s1}</span>
                            </td>
                            <td>
                              <span className={`${styles.badge} ${stepBadgeClass(s2)}`}>{s2}</span>
                            </td>
                            <td>
                              <span className={`${styles.badge} ${statusBadgeClass(statusLabel)}`}>
                                {statusLabel}
                              </span>
                            </td>
                            <td>{l.requested_at ? formatDateTime(l.requested_at) : "—"}</td>
                            <td>
                              <div className={styles.actions}>
                                <button type="button" className={styles.btnView} onClick={() => openModal(l)}>
                                  View
                                </button>
                                {showStep1 && (
                                  <button
                                    type="button"
                                    className={styles.btnApprove}
                                    onClick={() => handleAction(l.id, "approve_step1")}
                                  >
                                    Approve 1st
                                  </button>
                                )}
                                {showStep2 && (
                                  <button
                                    type="button"
                                    className={styles.btnApprove}
                                    onClick={() => handleAction(l.id, "approve_step2")}
                                  >
                                    Approve 2nd
                                  </button>
                                )}
                                {pending && (
                                  <button
                                    type="button"
                                    className={styles.btnReject}
                                    onClick={() => openModal(l)}
                                  >
                                    Reject
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {modalOpen && selectedLeave && typeof document !== "undefined"
        ? createPortal(
            <div className={styles.modalBackdrop} onClick={closeModal} role="presentation">
              <div
                className={styles.modal}
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label="Leave details"
              >
                <h2 className={styles.modalTitle}>Leave details</h2>
                <div className={styles.modalRow}>
                  <b>Employee ID:</b> {selectedLeave.employee_id}
                </div>
                <div className={styles.modalRow}>
                  <b>Category:</b> {selectedLeave.leave_category}
                </div>
                <div className={styles.modalRow}>
                  <b>Dates:</b> {formatDate(selectedLeave.start_date)} –{" "}
                  {formatDate(selectedLeave.end_date)} ({selectedLeave.total_days} days)
                </div>
                <div className={styles.modalRow}>
                  <b>1st step:</b>{" "}
                  <span className={`${styles.badge} ${stepBadgeClass(selectedLeave.step1_status)}`}>
                    {normStep(selectedLeave.step1_status)}
                  </span>
                </div>
                <div className={styles.modalRow}>
                  <b>2nd step:</b>{" "}
                  <span className={`${styles.badge} ${stepBadgeClass(selectedLeave.step2_status)}`}>
                    {normStep(selectedLeave.step2_status)}
                  </span>
                </div>
                <div className={styles.modalRow}>
                  <b>Status:</b>{" "}
                  <span className={`${styles.badge} ${statusBadgeClass(selectedStatus)}`}>
                    {selectedStatus}
                  </span>
                </div>
                <div className={styles.modalRow}>
                  <b>Reason:</b> {selectedLeave.reason}
                </div>
                {selectedLeave.admin_remark ? (
                  <div className={styles.modalRow}>
                    <b>Admin remarks:</b> {selectedLeave.admin_remark}
                  </div>
                ) : null}
                {balanceInfo ? (
                  <div className={styles.balanceBox}>
                    <b>Current balances</b>
                    <div>
                      {balanceInfo.employment_status === "Probation"
                        ? "Leave balance"
                        : "Annual leave balance"}
                      : {balanceInfo.annualBalance} / {balanceInfo.annualAllowance}
                    </div>
                    <div>
                      Bereavement: {balanceInfo.bereavementBalance} / 3
                    </div>
                  </div>
                ) : null}
                <div className={styles.modalRow}>
                  <b>Documents:</b>{" "}
                  {parseDocs(selectedLeave.document_paths).length > 0 ? (
                    parseDocs(selectedLeave.document_paths).map((d: string) => (
                      <button
                        key={d}
                        type="button"
                        className={styles.docBtn}
                        onClick={() => handleDocumentDownload(d)}
                      >
                        📄 {d.split("/").pop()}
                      </button>
                    ))
                  ) : (
                    <span style={{ color: "#94a3b8" }}>No documents</span>
                  )}
                </div>
                <div className={styles.modalRow}>
                  <b>Requested:</b>{" "}
                  {selectedLeave.requested_at ? formatDateTime(selectedLeave.requested_at) : "—"}
                </div>
                {selectedPending ? (
                  <div style={{ marginTop: 14 }}>
                    <label className={styles.modalRow}>
                      <b>Remarks (for rejection)</b>
                      <textarea
                        className={styles.textarea}
                        value={rejectRemark}
                        onChange={(e) => setRejectRemark(e.target.value)}
                        placeholder="Optional reason for rejection…"
                      />
                    </label>
                    <div className={styles.modalActions}>
                      {selectedCanStep1 ? (
                        <button
                          type="button"
                          className={styles.btnApprove}
                          onClick={() => handleAction(selectedLeave.id, "approve_step1")}
                        >
                          Approve 1st step
                        </button>
                      ) : null}
                      {selectedCanStep2 ? (
                        <button
                          type="button"
                          className={styles.btnApprove}
                          onClick={() => handleAction(selectedLeave.id, "approve_step2")}
                        >
                          Approve 2nd (final)
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className={styles.btnReject}
                        onClick={() => handleAction(selectedLeave.id, "reject")}
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ) : null}
                <button type="button" className={styles.modalClose} onClick={closeModal}>
                  Close
                </button>
              </div>
            </div>,
            document.body
          )
        : null}

      {popup}
    </OptionalAdminShell>
  );
}
