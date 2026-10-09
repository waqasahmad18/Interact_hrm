"use client";

import React from "react";
import adminStyles from "../admin-page.module.css";
import styles from "../presence-idle/presence-idle.module.css";
import { toastError, toastSuccess } from "@/lib/app-toast";

type PolicyTicket = {
  id: number;
  ticket_number: string;
  employee_id: string;
  employee_name: string;
  subject: string | null;
  description: string | null;
  form_data: Record<string, unknown> | null;
  priority: string;
  status: string;
  requested_at: string;
};

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function HighlightEvidence({
  text,
  matched,
}: {
  text: string;
  matched: string[];
}) {
  const source = String(text || "").trim() || "(no clear text)";
  const terms = matched
    .map((m) => String(m || "").trim())
    .filter((m) => m.length >= 2);
  if (!terms.length) {
    return <pre className={styles.policyEvidence}>{source}</pre>;
  }
  const re = new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "gi");
  const parts = source.split(re);
  return (
    <pre className={styles.policyEvidence}>
      {parts.map((part, i) => {
        const hit = terms.some((t) => t.toLowerCase() === part.toLowerCase());
        return hit ? (
          <mark key={i} className={styles.policyHit}>
            {part}
          </mark>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        );
      })}
    </pre>
  );
}

export default function GuardPolicyInbox() {
  const [tickets, setTickets] = React.useState<PolicyTicket[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState<"open" | "all">("open");
  const [selected, setSelected] = React.useState<PolicyTicket | null>(null);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ limit: "200" });
      if (filter === "open") q.set("status", "open");
      const res = await fetch(`/api/admin/guard-policy-tickets?${q}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!data.success) {
        toastError(data.error || "Could not load policy inbox");
        return;
      }
      setTickets(data.tickets || []);
    } catch {
      toastError("Network error loading policy inbox");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    const id = window.setInterval(() => void load(), 12000);
    return () => window.clearInterval(id);
  }, [load]);

  async function setStatus(id: number, status: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/guard-policy-tickets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      const data = await res.json();
      if (!data.success) {
        toastError(data.error || "Update failed");
        return;
      }
      toastSuccess("Updated");
      setSelected(data.ticket || null);
      await load();
    } catch {
      toastError("Network error");
    } finally {
      setBusy(false);
    }
  }

  async function removeTicket(id: number) {
    if (!window.confirm("Delete this policy alert?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/guard-policy-tickets?id=${id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!data.success) {
        toastError(data.error || "Delete failed");
        return;
      }
      toastSuccess("Deleted");
      setSelected(null);
      await load();
    } catch {
      toastError("Network error");
    } finally {
      setBusy(false);
    }
  }

  const form = selected?.form_data || {};
  const matched = Array.isArray(form.matched)
    ? (form.matched as unknown[]).map((m) => String(m))
    : String(form.matched || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
  const evidence =
    String(form.evidence || "").trim() ||
    extractEvidenceFromDescription(selected?.description || "");
  const pseudonym = String(form.pseudonym || "").trim();

  return (
    <div className={styles.policyInbox}>
      <div className={styles.durationRow} style={{ marginBottom: 10 }}>
        <button
          type="button"
          className={`${styles.chip}${filter === "open" ? ` ${styles.chipActive}` : ""}`}
          onClick={() => setFilter("open")}
        >
          Open
        </button>
        <button
          type="button"
          className={`${styles.chip}${filter === "all" ? ` ${styles.chipActive}` : ""}`}
          onClick={() => setFilter("all")}
        >
          All
        </button>
        <button
          type="button"
          className={adminStyles.btnSecondary}
          disabled={loading || busy}
          onClick={() => void load()}
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
        <span className={styles.tip}>{tickets.length} alert(s)</span>
      </div>

      <div className={styles.policyInboxGrid}>
        <div className={styles.policyList}>
          {loading && tickets.length === 0 ? (
            <p className={styles.tip}>Loading…</p>
          ) : tickets.length === 0 ? (
            <p className={styles.tip}>No policy alerts yet.</p>
          ) : (
            tickets.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`${styles.policyListItem}${
                  selected?.id === t.id ? ` ${styles.policyListItemActive}` : ""
                }`}
                onClick={() => setSelected(t)}
              >
                <strong>{t.ticket_number}</strong>
                <span>
                  {t.employee_name}
                  {pseudonymFrom(t) ? ` (${pseudonymFrom(t)})` : ""}
                </span>
                <span className={styles.tip}>
                  {t.status} · {formatWhen(t.requested_at)}
                </span>
              </button>
            ))
          )}
        </div>

        <div className={styles.policyDetail}>
          {!selected ? (
            <p className={styles.tip}>Select an alert to review evidence.</p>
          ) : (
            <>
              <div className={styles.durationRow}>
                <span className={styles.chipActive}>{selected.ticket_number}</span>
                <span className={styles.chip}>{selected.status}</span>
                <span className={styles.chip}>{selected.priority}</span>
              </div>
              <h3 className={styles.detailTitle}>
                {selected.subject || "Policy alert"}
              </h3>
              <p className={styles.detailSub}>
                {selected.employee_name}
                {pseudonym ? ` · ${pseudonym}` : ""} · ID {selected.employee_id}
              </p>

              <div className={styles.block} style={{ marginTop: 10 }}>
                <h3 className={styles.blockTitle}>Matched</h3>
                <div className={styles.chips}>
                  {matched.length ? (
                    matched.map((m) => (
                      <span key={m} className={styles.policyMatchChip}>
                        {m}
                      </span>
                    ))
                  ) : (
                    <span className={styles.tip}>—</span>
                  )}
                </div>
              </div>

              <div className={styles.block}>
                <h3 className={styles.blockTitle}>Evidence (cleared OCR)</h3>
                <HighlightEvidence text={evidence} matched={matched} />
              </div>

              {form.screenshot_path ? (
                <p className={styles.tip}>Screenshot: {String(form.screenshot_path)}</p>
              ) : null}

              <div className={styles.actions} style={{ marginTop: 12 }}>
                <button
                  type="button"
                  className={adminStyles.btnPrimary}
                  disabled={busy}
                  onClick={() => void setStatus(selected.id, "resolved")}
                >
                  Mark resolved
                </button>
                <button
                  type="button"
                  className={adminStyles.btnSecondary}
                  disabled={busy}
                  onClick={() => void setStatus(selected.id, "in_progress")}
                >
                  In progress
                </button>
                <button
                  type="button"
                  className={adminStyles.btnSecondary}
                  disabled={busy}
                  onClick={() => void removeTicket(selected.id)}
                >
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function pseudonymFrom(t: PolicyTicket) {
  const p = t.form_data?.pseudonym;
  return p ? String(p) : "";
}

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function extractEvidenceFromDescription(desc: string) {
  const m = String(desc || "").match(/Evidence:\s*([\s\S]*?)(?:\nSilent alert|\n*$)/i);
  return m?.[1]?.trim() || "";
}
