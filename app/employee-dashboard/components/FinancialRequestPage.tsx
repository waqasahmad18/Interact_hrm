"use client";

import React from "react";
import { EmployeeAvatar } from "../../components/EmployeeAvatar";
import { employeeInitials } from "../../../lib/employee-photo-shared";
import styles from "../financial-request.module.css";

type RequestType = "advance" | "loan";

type RequestRow = {
  id: number;
  amount: number;
  installments?: number | null;
  start_month?: string | null;
  reason?: string | null;
  status: string;
  requested_at: string;
  admin_remark?: string | null;
};

export function FinancialRequestPage({
  requestType,
  title,
  subtitle,
  submitLabel,
}: {
  requestType: RequestType;
  title: string;
  subtitle: string;
  submitLabel: string;
}) {
  const [employeeId, setEmployeeId] = React.useState("");
  const [employeeName, setEmployeeName] = React.useState("Employee");
  const [photo, setPhoto] = React.useState<string | null>(null);
  const [amount, setAmount] = React.useState("");
  const [installments, setInstallments] = React.useState("6");
  const [startMonth, setStartMonth] = React.useState(() => new Date().toISOString().slice(0, 7));
  const [reason, setReason] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [success, setSuccess] = React.useState("");
  const [error, setError] = React.useState("");
  const [history, setHistory] = React.useState<RequestRow[]>([]);

  const fetchHistory = React.useCallback(async (id: string) => {
    const res = await fetch(
      `/api/financial-requests?employeeId=${encodeURIComponent(id)}&requestType=${requestType}&ts=${Date.now()}`,
      { cache: "no-store" }
    );
    const data = await res.json();
    if (data.success) setHistory(data.requests || []);
  }, [requestType]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const id =
      localStorage.getItem("employeeId") || localStorage.getItem("loginId") || "";
    const name = localStorage.getItem("employeeName") || "Employee";
    setEmployeeId(id);
    setEmployeeName(name);
    if (id) void fetchHistory(id);
    if (id) {
      void fetch(`/api/employee-profile?employeeId=${encodeURIComponent(id)}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.success) {
            if (data.name) setEmployeeName(data.name);
            if (data.photo) setPhoto(data.photo);
          }
        })
        .catch(() => undefined);
    }
  }, [fetchHistory]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/financial-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee_id: employeeId,
          employee_name: employeeName,
          request_type: requestType,
          amount: parseFloat(amount),
          installments: requestType === "loan" ? parseInt(installments, 10) : undefined,
          start_month: requestType === "loan" ? startMonth : undefined,
          reason,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess("Request submitted! Admin will review it shortly.");
        setAmount("");
        setReason("");
        void fetchHistory(employeeId);
      } else {
        setError(data.error || "Could not submit request");
      }
    } catch {
      setError("Could not submit request");
    } finally {
      setSubmitting(false);
    }
  };

  const statusClass = (status: string) => {
    if (status === "approved") return styles.badgeApproved;
    if (status === "rejected") return styles.badgeRejected;
    return styles.badgePending;
  };

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <div className={styles.profileRow}>
          <EmployeeAvatar
            name={employeeName}
            initials={employeeInitials(employeeName)}
            photo={photo}
            size="md"
            ring="purple"
          />
          <div className={styles.profileMeta}>
            <div className={styles.profileName}>{employeeName}</div>
            <div className={styles.profileSub}>
              {requestType === "advance" ? "Salary advance request" : "Loan request"}
            </div>
          </div>
        </div>

        <h1 className={styles.title}>{title}</h1>
        <p className={styles.sub}>{subtitle}</p>

        <div className={styles.card}>
          {success ? <div className={styles.alertOk}>{success}</div> : null}
          {error ? <div className={styles.alertErr}>{error}</div> : null}
          <form onSubmit={handleSubmit} className={styles.formGrid}>
            <div>
              <label className={styles.label} htmlFor="amount">
                Amount (PKR)
              </label>
              <input
                id="amount"
                className={styles.input}
                type="number"
                min="1"
                step="1"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 50000"
              />
            </div>
            {requestType === "loan" ? (
              <>
                <div>
                  <label className={styles.label} htmlFor="installments">
                    Number of installments
                  </label>
                  <input
                    id="installments"
                    className={styles.input}
                    type="number"
                    min="1"
                    max="60"
                    required
                    value={installments}
                    onChange={(e) => setInstallments(e.target.value)}
                  />
                </div>
                <div>
                  <label className={styles.label} htmlFor="startMonth">
                    Deduction starts (month)
                  </label>
                  <input
                    id="startMonth"
                    className={styles.input}
                    type="month"
                    required
                    value={startMonth}
                    onChange={(e) => setStartMonth(e.target.value)}
                  />
                </div>
              </>
            ) : null}
            <div>
              <label className={styles.label} htmlFor="reason">
                Reason
              </label>
              <textarea
                id="reason"
                className={styles.textarea}
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Briefly explain why you need this…"
              />
            </div>
            <button
              type="submit"
              disabled={submitting || !employeeId}
              className={`${styles.submit} ${requestType === "advance" ? styles.submitAdvance : styles.submitLoan}`}
            >
              {submitting ? "Submitting…" : submitLabel}
            </button>
          </form>
        </div>

        <div className={styles.card}>
          <h2 className={styles.historyTitle}>Your requests</h2>
          {history.length === 0 ? (
            <p style={{ color: "#94a3b8", margin: 0 }}>No requests yet.</p>
          ) : (
            <ul className={styles.historyList}>
              {history.map((row) => (
                <li key={row.id} className={styles.historyItem}>
                  <div className={styles.historyTop}>
                    <span className={styles.historyAmount}>
                      PKR {Number(row.amount).toLocaleString()}
                    </span>
                    <span className={`${styles.badgePending} ${statusClass(row.status)}`}>
                      {row.status}
                    </span>
                  </div>
                  <div className={styles.historyMeta}>
                    {new Date(row.requested_at).toLocaleString()}
                    {requestType === "loan" && row.installments
                      ? ` · ${row.installments} installments`
                      : ""}
                    {row.admin_remark ? ` · Note: ${row.admin_remark}` : ""}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
