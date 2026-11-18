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
import { leaveStatusLabel, overallLeaveStatus } from "@/lib/leave-approval";
import { rowAllowedByScope, useViewerDataScope } from "@/lib/access-control/use-viewer-scope";
import { toastError } from "@/lib/app-toast";
import {
  isCeoOrgRole,
  isManagerOrgRole,
  isTeamLeadOrgRole,
} from "@/lib/org-role";

type LeaveSortKey =
  | "employee_id"
  | "employee_name"
  | "pseudonym"
  | "department_name"
  | "leave_category"
  | "start_date"
  | "total_days"
  | "status"
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

function readViewerEmployeeId(): string {
  try {
    const id = String(localStorage.getItem("employeeId") || "").trim();
    if (/^\d+$/.test(id)) return id;
  } catch {
    /* ignore */
  }
  return "";
}

export default function LeavePage() {
  const viewerScope = useViewerDataScope();
  const viewerEmployeeId = readViewerEmployeeId();
  const canApproveLeaves =
    isManagerOrgRole(viewerScope.orgRole) ||
    isTeamLeadOrgRole(viewerScope.orgRole) ||
    isCeoOrgRole(viewerScope.orgRole);
  const canActOnLeave = (leave: { employee_id?: string | number } | null) => {
    if (!canApproveLeaves || !leave) return false;
    // Nobody approves their own leave (use Leaves page for team/dept only).
    if (
      viewerEmployeeId &&
      String(leave.employee_id || "").trim() === viewerEmployeeId
    ) {
      return false;
    }
    return true;
  };
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
  const [searchText, setSearchText] = useState("");
  /** "" = all; pending | approved | rejected */
  const [statusFilter, setStatusFilter] = useState<"" | "pending" | "approved" | "rejected">("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [duplicatesOnly, setDuplicatesOnly] = useState(false);
  const { openFromRow, popup, getPhoto } = useEmployeeDetailPopup();

  const leaveDayKey = (l: any) => {
    const raw = l?.start_date || l?.requested_at || "";
    if (!raw) return "";
    try {
      return getDateStringInTimeZone(raw, SERVER_TIMEZONE) || "";
    } catch {
      return String(raw).slice(0, 10);
    }
  };

  const fetchLeaves = async (scope = viewerScope) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      params.set("ts", String(Date.now()));
      if (viewerEmployeeId) params.set("viewerId", viewerEmployeeId);
      // TL / Manager: own department / team only (never company-wide dump).
      if (scope.mode !== "all" && scope.employeeIds.length) {
        params.set("employees", scope.employeeIds.join(","));
      }
      const res = await fetch(`/api/leaves?${params.toString()}`, {
        cache: "no-store",
        headers: viewerEmployeeId
          ? {
              "x-employee-id": viewerEmployeeId,
              "x-hrm-employee-id": viewerEmployeeId,
            }
          : undefined,
      });
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
    if (!viewerScope.loaded) return;
    void fetchLeaves(viewerScope);
    // Refetch when scope finishes loading / changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    viewerScope.loaded,
    viewerScope.mode,
    viewerScope.employeeIds.join(","),
    viewerScope.orgRole,
  ]);

  const leaveDateSpanKey = (l: any) => {
    const start = leaveDayKey(l);
    const endRaw = l?.end_date || l?.start_date || "";
    let end = "";
    try {
      end = endRaw ? getDateStringInTimeZone(endRaw, SERVER_TIMEZONE) || "" : "";
    } catch {
      end = String(endRaw).slice(0, 10);
    }
    return `${start}|${end || start}`;
  };

  const leavesWithMeta = useMemo(() => {
    const seen = new Map<string, number>();
    return leaves.map((l) => {
      const key = [
        String(l?.employee_id ?? "").trim(),
        String(l?.leave_category || "").trim().toLowerCase(),
        leaveDateSpanKey(l),
      ].join("|");
      const firstId = seen.get(key);
      const id = Number(l?.id) || 0;
      if (firstId == null) {
        seen.set(key, id);
        return { ...l, is_duplicate: false };
      }
      return { ...l, is_duplicate: true, duplicate_of: firstId };
    });
  }, [leaves]);

  const stats = useMemo(() => {
    let pending = 0;
    let approved = 0;
    let rejected = 0;
    let duplicates = 0;
    leavesWithMeta.forEach((l) => {
      const s = overallLeaveStatus(l);
      if (s === "approved") approved += 1;
      else if (s === "rejected") rejected += 1;
      else pending += 1;
      if (l.is_duplicate) duplicates += 1;
    });
    return { pending, approved, rejected, total: leavesWithMeta.length, duplicates };
  }, [leavesWithMeta]);

  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    leavesWithMeta.forEach((l) => {
      const c = String(l?.leave_category || "").trim();
      if (c) set.add(c);
    });
    return [...set].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }, [leavesWithMeta]);

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
      let actor: string | undefined;
      try {
        const eid = String(localStorage.getItem("employeeId") || "").trim();
        if (/^\d+$/.test(eid)) actor = eid;
      } catch {
        /* ignore */
      }
      const res = await fetch("/api/leaves", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          action,
          actor,
          admin_remark: action === "reject" ? rejectRemark : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.success === false) {
        toastError(data?.error || "Leave action failed");
        return;
      }
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

  const leaveRecencyMs = (l: any) => {
    let best = 0;
    for (const c of [l?.updated_at, l?.step2_at, l?.step1_at, l?.requested_at]) {
      const raw = String(c || "").trim();
      if (!raw) continue;
      const ms = Date.parse(raw.includes("T") ? raw : raw.replace(" ", "T"));
      if (Number.isFinite(ms) && ms > best) best = ms;
    }
    return best || Number(l?.id) || 0;
  };

  const sortedLeaves = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    const scoped = leavesWithMeta.filter((l) => {
      if (statusFilter) {
        if (overallLeaveStatus(l) !== statusFilter) return false;
      }
      if (categoryFilter) {
        if (String(l.leave_category || "").trim().toLowerCase() !== categoryFilter.toLowerCase()) {
          return false;
        }
      }
      if (duplicatesOnly && !l.is_duplicate) return false;
      if (q) {
        const name = String(l.employee_name || "").toLowerCase();
        const pseudo = String(l.pseudonym || "").toLowerCase();
        const id = String(l.employee_id || "").toLowerCase();
        if (!name.includes(q) && !pseudo.includes(q) && !id.includes(q)) return false;
      }
      return true;
    });

    // Default: most recent activity / approval on top.
    if (!sortConfig) {
      return [...scoped].sort((a, b) => {
        const diff = leaveRecencyMs(b) - leaveRecencyMs(a);
        return diff !== 0 ? diff : (Number(b.id) || 0) - (Number(a.id) || 0);
      });
    }
    const { key, direction } = sortConfig;
    const getText = (v: unknown) => String(v || "").toLowerCase();

    return [...scoped].sort((a, b) => {
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
          cmp = getText(overallLeaveStatus(a)).localeCompare(getText(overallLeaveStatus(b)), undefined, {
            sensitivity: "base",
          });
          break;
        case "start_date":
          cmp = new Date(a.start_date || 0).getTime() - new Date(b.start_date || 0).getTime();
          break;
        case "requested_at":
          cmp = leaveRecencyMs(a) - leaveRecencyMs(b);
          break;
        default:
          cmp = 0;
      }
      return direction === "asc" ? cmp : -cmp;
    });
  }, [leavesWithMeta, sortConfig, searchText, statusFilter, categoryFilter, duplicatesOnly]);

  const hasActiveFilters = Boolean(
    searchText.trim() || statusFilter || categoryFilter || duplicatesOnly,
  );

  const toggleStatusFilter = (next: "pending" | "approved" | "rejected" | "") => {
    setStatusFilter((prev) => (prev === next ? "" : next));
  };

  const actionTimestamp = (l: any) => {
    const raw =
      l?.updated_at || l?.step2_at || l?.step1_at || l?.requested_at || "";
    return raw ? formatDateTime(String(raw)) : "—";
  };

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
  const selectedPending =
    Boolean(selectedLeave) &&
    canActOnLeave(selectedLeave) &&
    overallLeaveStatus(selectedLeave || {}) === "pending";

  return (
    <OptionalAdminShell>
      <div className={styles.page}>
        <div className={styles.inner}>
          <h1 className={styles.title}>Leave requests</h1>
          <p className={styles.subtitle}>Review and approve employee leave applications.</p>

          <div className={styles.statRow}>
            <button
              type="button"
              className={`${styles.statCard} ${styles.statCardGold}${
                statusFilter === "pending" ? ` ${styles.statCardActive}` : ""
              }`}
              onClick={() => toggleStatusFilter("pending")}
              aria-pressed={statusFilter === "pending"}
            >
              <p className={styles.statLabel}>Pending</p>
              <p className={styles.statValue}>{stats.pending}</p>
              <p className={styles.statSub}>Awaiting a decision</p>
            </button>
            <button
              type="button"
              className={`${styles.statCard} ${styles.statCardGreen}${
                statusFilter === "approved" ? ` ${styles.statCardActive}` : ""
              }`}
              onClick={() => toggleStatusFilter("approved")}
              aria-pressed={statusFilter === "approved"}
            >
              <p className={styles.statLabel}>Approved</p>
              <p className={styles.statValue}>{stats.approved}</p>
              <p className={styles.statSub}>This leave year</p>
            </button>
            <button
              type="button"
              className={`${styles.statCard} ${styles.statCardRed}${
                statusFilter === "rejected" ? ` ${styles.statCardActive}` : ""
              }`}
              onClick={() => toggleStatusFilter("rejected")}
              aria-pressed={statusFilter === "rejected"}
            >
              <p className={styles.statLabel}>Rejected</p>
              <p className={styles.statValue}>{stats.rejected}</p>
              <p className={styles.statSub}>This leave year</p>
            </button>
            <button
              type="button"
              className={`${styles.statCard} ${styles.statCardPurple}${
                statusFilter === "" ? ` ${styles.statCardActive}` : ""
              }`}
              onClick={() => setStatusFilter("")}
              aria-pressed={statusFilter === ""}
            >
              <p className={styles.statLabel}>Total requests</p>
              <p className={styles.statValue}>{stats.total}</p>
              <p className={styles.statSub}>
                {stats.duplicates} flagged as duplicate
              </p>
            </button>
          </div>

          <div className={styles.toolbar}>
            <div className={styles.searchWrap}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <circle cx="11" cy="11" r="7" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="search"
                className={styles.toolbarSearch}
                placeholder="Search by name or ID"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                autoComplete="off"
              />
            </div>
            <select
              className={styles.toolbarSelect}
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as "" | "pending" | "approved" | "rejected")
              }
              aria-label="Filter by status"
            >
              <option value="">All statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
            <select
              className={styles.toolbarSelect}
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              aria-label="Filter by category"
            >
              <option value="">All categories</option>
              {categoryOptions.map((c) => (
                <option key={c} value={c}>
                  {c.charAt(0).toUpperCase() + c.slice(1)}
                </option>
              ))}
            </select>
            <label
              className={`${styles.toggleChip}${duplicatesOnly ? ` ${styles.toggleChipOn}` : ""}`}
            >
              <input
                type="checkbox"
                checked={duplicatesOnly}
                onChange={(e) => setDuplicatesOnly(e.target.checked)}
              />
              Duplicates only
            </label>
            {hasActiveFilters ? (
              <button
                type="button"
                className={styles.clearFilters}
                onClick={() => {
                  setSearchText("");
                  setStatusFilter("");
                  setCategoryFilter("");
                  setDuplicatesOnly(false);
                }}
              >
                Clear filters
              </button>
            ) : null}
          </div>

          {!loading && leavesWithMeta.length > 0 && hasActiveFilters ? (
            <p className={styles.searchMeta}>
              Showing {sortedLeaves.length} of {leavesWithMeta.length} request
              {sortedLeaves.length === 1 ? "" : "s"}
            </p>
          ) : null}

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
                      <th>{renderSortableHeader("ID", "employee_id")}</th>
                      <th>{renderSortableHeader("Employee", "employee_name")}</th>
                      <th>{renderSortableHeader("Department", "department_name")}</th>
                      <th>{renderSortableHeader("Category", "leave_category")}</th>
                      <th>{renderSortableHeader("Dates", "start_date")}</th>
                      <th>{renderSortableHeader("Days", "total_days")}</th>
                      <th>{renderSortableHeader("Status", "status")}</th>
                      <th>Reason</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedLeaves.length === 0 ? (
                      <tr>
                        <td colSpan={9} className={tableStyles.breakSummaryNoRecords}>
                          {hasActiveFilters
                            ? "No requests match these filters."
                            : "No leave requests yet."}
                        </td>
                      </tr>
                    ) : (
                      sortedLeaves.map((l, idx) => {
                        const status = overallLeaveStatus(l);
                        const pending =
                          canActOnLeave(l) && status === "pending";
                        const category = String(l.leave_category || "—");
                        return (
                          <tr
                            key={
                              l?.id ??
                              `${l?.employee_id || "emp"}-${l?.start_date || "start"}-${l?.end_date || "end"}-${idx}`
                            }
                            className={l.is_duplicate ? styles.rowDim : undefined}
                          >
                            <td className={tableStyles.cellMuted}>{l.employee_id}</td>
                            <td>
                              <div className={styles.personCell}>
                                <EmployeeTableNameCell
                                  name={l.employee_name || ""}
                                  employeeId={l.employee_id}
                                  photo={getPhoto(l.employee_id)}
                                  onOpen={() => openFromRow(l)}
                                />
                                {l.pseudonym && l.pseudonym !== "-" ? (
                                  <div className={styles.pseudoLine}>{l.pseudonym}</div>
                                ) : null}
                              </div>
                            </td>
                            <td>{l.department_name || "—"}</td>
                            <td>
                              <span className={`${styles.badge} ${styles.badgeType}`}>
                                {category.charAt(0).toUpperCase() + category.slice(1)}
                              </span>
                            </td>
                            <td className={styles.monoCell}>
                              {formatDate(l.start_date)} – {formatDate(l.end_date)}
                            </td>
                            <td className={styles.monoCell}>{l.total_days}</td>
                            <td>
                              <span className={`${styles.badge} ${statusBadgeClass(status)}`}>
                                {status.charAt(0).toUpperCase() + status.slice(1)}
                              </span>
                              {l.is_duplicate ? (
                                <div style={{ marginTop: 4 }}>
                                  <span className={`${styles.badge} ${styles.badgeDup}`}>
                                    Duplicate
                                  </span>
                                </div>
                              ) : null}
                            </td>
                            <td className={styles.reasonCell}>
                              <button
                                type="button"
                                className={styles.reasonBtn}
                                onClick={() => openModal(l)}
                                title={String(l.reason || "")}
                              >
                                {l.reason || "—"}
                              </button>
                            </td>
                            <td>
                              {pending ? (
                                <div className={styles.actions}>
                                  <button
                                    type="button"
                                    className={styles.btnApproveOutline}
                                    onClick={() => handleAction(l.id, "approve")}
                                  >
                                    Approve
                                  </button>
                                  <button
                                    type="button"
                                    className={styles.btnRejectOutline}
                                    onClick={() => openModal(l)}
                                  >
                                    Reject
                                  </button>
                                </div>
                              ) : (
                                <span className={styles.actionStamp}>{actionTimestamp(l)}</span>
                              )}
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
                  <b>Status:</b>{" "}
                  <span className={`${styles.badge} ${statusBadgeClass(selectedStatus)}`}>
                    {selectedStatus}
                  </span>
                </div>
                {selectedLeave.decided_by_label || selectedLeave.approved_by_name ? (
                  <div className={styles.modalRow}>
                    <b>
                      {String(selectedStatus).toLowerCase() === "rejected"
                        ? "Rejected by:"
                        : "Approved by:"}
                    </b>{" "}
                    {selectedLeave.approved_by_name || selectedLeave.decided_by_label}
                  </div>
                ) : null}
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
                    <b>Current leave balance (before this action)</b>
                    <div>
                      {balanceInfo.employment_status === "Probation"
                        ? "Leave balance"
                        : "Annual leave balance"}
                      : {balanceInfo.annualBalance} / {balanceInfo.annualAllowance}
                    </div>
                    <div>
                      Bereavement: {balanceInfo.bereavementBalance} / 3
                    </div>
                    {selectedPending ? (
                      <div style={{ marginTop: 8, fontSize: 13, color: "#334155" }}>
                        Approve → balance minus {selectedLeave.total_days || 1} day(s). Reject →
                        balance unchanged.
                      </div>
                    ) : null}
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
                      <button
                        type="button"
                        className={styles.btnApprove}
                        onClick={() => handleAction(selectedLeave.id, "approve")}
                      >
                        Approve
                      </button>
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
