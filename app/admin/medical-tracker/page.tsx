"use client";

import React from "react";
import OptionalAdminShell from "@/app/components/OptionalAdminShell";
import styles from "../employee-files/employee-files.module.css";

type Col = { key: string; label: string };

type Balance = {
  employeeId: number;
  employeeName: string;
  status: string;
  medicalStartMonth: string | null;
  opdTier: string | null;
  annualOpdLimit: number | null;
  opdApproved: number;
  opdRemaining: number | null;
  ipdApproved: number;
  ipdRemaining: number | null;
  budgetExceeded: boolean;
};

type Row = Record<string, unknown> & {
  assignmentId: number;
  employeeId: number;
  employeeName: string;
  submittedAt: string | null;
  budgetExceeded?: boolean;
};

type Tab = "balances" | "subscriptions" | "claims";

function money(n: number | null | undefined) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return Number(n).toLocaleString();
}

function cell(v: unknown) {
  if (v == null || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}

export default function MedicalTrackerPage() {
  const [tab, setTab] = React.useState<Tab>("balances");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [q, setQ] = React.useState("");
  const [policyLabel, setPolicyLabel] = React.useState("");
  const [balances, setBalances] = React.useState<Balance[]>([]);
  const [subscriptions, setSubscriptions] = React.useState<Row[]>([]);
  const [claims, setClaims] = React.useState<Row[]>([]);
  const [subscriptionColumns, setSubscriptionColumns] = React.useState<Col[]>([]);
  const [claimColumns, setClaimColumns] = React.useState<Col[]>([]);
  const [detail, setDetail] = React.useState<Row | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/medical-tracker", { cache: "no-store" });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Load failed");
      setPolicyLabel(data.policyYear?.label || "");
      setBalances(data.balances || []);
      setSubscriptions(data.subscriptions || []);
      setClaims(data.claims || []);
      setSubscriptionColumns(data.subscriptionColumns || []);
      setClaimColumns(data.claimColumns || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const qq = q.trim().toLowerCase();

  const filteredBalances = balances.filter((b) => {
    if (!qq) return true;
    return (
      b.employeeName.toLowerCase().includes(qq) ||
      String(b.employeeId).includes(qq) ||
      String(b.opdTier || "").toLowerCase().includes(qq)
    );
  });

  const filteredSubs = subscriptions.filter((r) => {
    if (!qq) return true;
    return (
      String(r.employeeName || "").toLowerCase().includes(qq) ||
      String(r.employeeId || "").includes(qq) ||
      Object.values(r).some((v) => String(v ?? "").toLowerCase().includes(qq))
    );
  });

  const filteredClaims = claims.filter((r) => {
    if (!qq) return true;
    return (
      String(r.employeeName || "").toLowerCase().includes(qq) ||
      String(r.employeeId || "").includes(qq) ||
      Object.values(r).some((v) => String(v ?? "").toLowerCase().includes(qq))
    );
  });

  return (
    <OptionalAdminShell>
      <div className={styles.page}>
        <div className={styles.inner} style={{ maxWidth: 1600 }}>
          <header className={styles.header}>
            <h1 className={styles.title}>Medical Tracker</h1>
            <p className={styles.subtitle}>
              Subscription + claim submissions (complete field data). OPD/IPD balances vs plan
              limits
              {policyLabel ? ` · Policy year ${policyLabel}` : ""}. Exceeding remaining budget
              marks the row red and opens an HR ticket.
            </p>
          </header>

          <div className={styles.tabs}>
            {(
              [
                ["balances", "OPD/IPD by Employees"],
                ["subscriptions", "Subscriptions"],
                ["claims", "Claim Responses"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`${styles.tab} ${tab === id ? styles.tabActive : ""}`}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
            <button type="button" className={styles.btn} onClick={() => void load()} disabled={loading}>
              {loading ? "Loading…" : "Refresh"}
            </button>
          </div>

          <div className={styles.toolbar}>
            <input
              className={styles.search}
              placeholder="Search employee, ID, plan, field…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          {error ? (
            <div className={`${styles.alert} ${styles.alertError}`}>{error}</div>
          ) : null}

          {loading ? (
            <div className={styles.empty}>Loading medical data…</div>
          ) : tab === "balances" ? (
            <div className={styles.panel}>
              <div className={styles.tableWrap} style={{ overflowX: "auto" }}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>Start</th>
                      <th>Emp ID</th>
                      <th>Employee</th>
                      <th>OPD plan tier</th>
                      <th>Annual OPD limit</th>
                      <th>OPD approved</th>
                      <th>OPD remaining</th>
                      <th>IPD approved</th>
                      <th>IPD remaining</th>
                      <th>Flag</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBalances.length === 0 ? (
                      <tr>
                        <td colSpan={11} className={styles.empty}>
                          No subscribed employees yet. Seed medical forms, send subscription, then
                          refresh.
                        </td>
                      </tr>
                    ) : (
                      filteredBalances.map((b) => {
                        const over =
                          b.budgetExceeded ||
                          (b.opdRemaining != null && b.opdRemaining < 0) ||
                          (b.ipdRemaining != null && b.ipdRemaining < 0);
                        return (
                          <tr
                            key={b.employeeId}
                            style={
                              over
                                ? { background: "#fee2e2", color: "#991b1b", fontWeight: 600 }
                                : undefined
                            }
                          >
                            <td>{b.status}</td>
                            <td>{b.medicalStartMonth || "—"}</td>
                            <td>{b.employeeId}</td>
                            <td>{b.employeeName}</td>
                            <td>{b.opdTier || "—"}</td>
                            <td>{money(b.annualOpdLimit)}</td>
                            <td>{money(b.opdApproved)}</td>
                            <td>{money(b.opdRemaining)}</td>
                            <td>{money(b.ipdApproved)}</td>
                            <td>{money(b.ipdRemaining)}</td>
                            <td>{over ? "BUDGET EXCEED" : "OK"}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : tab === "subscriptions" ? (
            <DataTable
              rows={filteredSubs}
              columns={subscriptionColumns}
              empty="No subscription submissions yet."
              onOpen={setDetail}
            />
          ) : (
            <DataTable
              rows={filteredClaims}
              columns={claimColumns}
              empty="No claim submissions yet."
              onOpen={setDetail}
              highlightExceed
            />
          )}
        </div>
      </div>

      {detail ? (
        <div
          className={styles.modalBackdrop}
          onClick={() => setDetail(null)}
          role="presentation"
        >
          <div
            className={styles.modal}
            style={{ maxWidth: 720, maxHeight: "85vh", overflow: "auto" }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
          >
            <h2 className={styles.modalTitle}>
              {detail.employeeName} · #{detail.assignmentId}
            </h2>
            <p style={{ margin: "0 0 12px", fontSize: 13, color: "#64748b" }}>
              Submitted{" "}
              {detail.submittedAt ? new Date(String(detail.submittedAt)).toLocaleString() : "—"}
              {detail.budgetExceeded ? " · BUDGET EXCEED" : ""}
            </p>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <tbody>
                  {Object.entries(detail)
                    .filter(([k]) => !["assignmentId"].includes(k))
                    .map(([k, v]) => (
                      <tr key={k}>
                        <td style={{ fontWeight: 600, width: "40%" }}>{k}</td>
                        <td>{cell(v)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <div className={styles.modalActions}>
              <button type="button" className={styles.btn} onClick={() => setDetail(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </OptionalAdminShell>
  );
}

function DataTable({
  rows,
  columns,
  empty,
  onOpen,
  highlightExceed,
}: {
  rows: Row[];
  columns: Col[];
  empty: string;
  onOpen: (r: Row) => void;
  highlightExceed?: boolean;
}) {
  return (
    <div className={styles.panel}>
      <div className={styles.tableWrap} style={{ overflowX: "auto" }}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Submitted</th>
              <th>Emp ID</th>
              <th>Employee</th>
              {columns.map((c) => (
                <th key={c.key}>{c.label}</th>
              ))}
              {highlightExceed ? <th>Budget</th> : null}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 5} className={styles.empty}>
                  {empty}
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const over = Boolean(r.budgetExceeded);
                return (
                  <tr
                    key={r.assignmentId}
                    style={
                      highlightExceed && over
                        ? { background: "#fee2e2", color: "#991b1b" }
                        : undefined
                    }
                  >
                    <td>
                      {r.submittedAt
                        ? new Date(String(r.submittedAt)).toLocaleString()
                        : "—"}
                    </td>
                    <td>{r.employeeId}</td>
                    <td>{r.employeeName}</td>
                    {columns.map((c) => (
                      <td key={c.key}>{cell(r[c.key])}</td>
                    ))}
                    {highlightExceed ? (
                      <td>
                        {over
                          ? `EXCEED${r.budgetExceedTicket ? ` · ${r.budgetExceedTicket}` : ""}`
                          : "OK"}
                      </td>
                    ) : null}
                    <td>
                      <button type="button" className={styles.btn} onClick={() => onOpen(r)}>
                        View
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <p style={{ margin: "8px 0 0", fontSize: 12, color: "#94a3b8" }}>
        {rows.length} row(s) · scroll horizontally for all fields
      </p>
    </div>
  );
}