"use client";

import LayoutDashboard from "../../layout-dashboard";
import React from "react";
import adminStyles from "../admin-page.module.css";
import TicketThread from "../../components/TicketThread";
import { categoryLabel, ticketTypeLabel, type TicketCategory } from "../../../lib/ticket-catalog";
import { isTicketClosed } from "../../../lib/ticket-status";
import { previewTicketToastOnPage } from "../../../lib/ticket-toast-demo";
import type { TicketThreadMessage } from "../../../lib/ticket-thread";

type Ticket = {
  id: number;
  ticket_number: string;
  employee_id: string;
  employee_name: string;
  category: TicketCategory;
  ticket_type: string;
  subject: string | null;
  description: string | null;
  form_data: Record<string, unknown> | null;
  priority: string;
  status: string;
  admin_remark: string | null;
  messages?: TicketThreadMessage[];
  requested_at: string;
};

export default function AdminTicketsPage() {
  const [tickets, setTickets] = React.useState<Ticket[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState<"pending" | "all">("pending");
  const [selected, setSelected] = React.useState<Ticket | null>(null);
  const [reply, setReply] = React.useState("");
  const [processing, setProcessing] = React.useState(false);

  const fetchTickets = React.useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const params = new URLSearchParams({ ts: String(Date.now()) });
      if (filter === "pending") params.set("status", "open");
      const res = await fetch(`/api/employee-tickets?${params}`, { cache: "no-store" });
      const data = await res.json();
      if (data.success) setTickets(data.tickets || []);
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [filter]);

  React.useEffect(() => {
    void fetchTickets();
  }, [fetchTickets]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${protocol}://${window.location.host}/api/ws`);
    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data.toString());
        if (msg?.type === "ticket_update" || msg?.type === "ticket_created") {
          void fetchTickets({ silent: true });
          if (msg.ticket?.id && selected?.id === msg.ticket.id) {
            setSelected(msg.ticket);
          }
        }
      } catch {
        /* ignore */
      }
    };
    return () => ws.close();
  }, [fetchTickets, selected?.id]);

  const patchTicket = async (id: number, status?: string) => {
    setProcessing(true);
    try {
      const res = await fetch("/api/employee-tickets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          status,
          reply: reply.trim() || undefined,
          author_name: "Admin",
        }),
      });
      const data = await res.json();
      if (data.success) {
        setReply("");
        if (data.ticket) {
          setSelected(data.ticket);
        } else if (!status) {
          setSelected(null);
        }
        void fetchTickets();
      } else {
        window.alert(data.error || "Action failed");
      }
    } catch {
      window.alert("Action failed");
    } finally {
      setProcessing(false);
    }
  };

  const handleStatus = (id: number, status: string) => {
    void patchTicket(id, status);
  };

  const handleSendReply = (id: number) => {
    if (selected && isTicketClosed(selected.status)) return;
    if (!reply.trim()) {
      window.alert("Please type a reply first.");
      return;
    }
    void patchTicket(id);
  };

  const openTicket = async (t: Ticket) => {
    setReply("");
    try {
      const res = await fetch(`/api/employee-tickets?id=${t.id}&ts=${Date.now()}`, {
        cache: "no-store",
      });
      const data = await res.json();
      setSelected(data.success && data.tickets?.[0] ? data.tickets[0] : t);
    } catch {
      setSelected(t);
    }
  };

  const statusBadge = (status: string) => {
    if (status === "pending") return adminStyles.badgePending;
    if (status === "in_progress") return adminStyles.badgeInProgress;
    if (status === "rejected") return adminStyles.badgeRejected;
    return adminStyles.badgeApproved;
  };

  const threadMessages = selected?.messages ?? [];
  const ticketClosed = selected ? isTicketClosed(selected.status) : false;

  return (
    <LayoutDashboard>
      <div className={adminStyles.page}>
        <div className={adminStyles.inner}>
          <h1 className={adminStyles.title}>Ticket inbox</h1>
          <p className={adminStyles.subtitle}>
            All employee tickets from Generate Ticket — review and update status.
          </p>

          <div className={adminStyles.ticketToolbar}>
            <div className={adminStyles.tabRow}>
              <button
                type="button"
                onClick={() => setFilter("pending")}
                className={`${adminStyles.tabBtn} ${filter === "pending" ? adminStyles.tabBtnActive : ""}`}
              >
                Pending
              </button>
              <button
                type="button"
                onClick={() => setFilter("all")}
                className={`${adminStyles.tabBtn} ${filter === "all" ? adminStyles.tabBtnActive : ""}`}
              >
                All tickets
              </button>
            </div>
            <button
              type="button"
              className={adminStyles.previewToastBtn}
              onClick={() => previewTicketToastOnPage()}
            >
              Preview notification
            </button>
          </div>

          {loading ? (
            <p className={adminStyles.muted}>Loading…</p>
          ) : tickets.length === 0 ? (
            <div className={adminStyles.empty}>
              No {filter === "pending" ? "open " : ""}tickets.
            </div>
          ) : (
            <div className={adminStyles.requestList}>
              {tickets.map((t) => (
                <div
                  key={t.id}
                  className={`${adminStyles.requestCard} ${adminStyles.requestCardClickable}`}
                  onClick={() => void openTicket(t)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      void openTicket(t);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <div className={adminStyles.requestBody}>
                    <div className={adminStyles.requestMeta}>
                      <span className={`${adminStyles.badge} ${adminStyles.badgeType}`}>
                        {t.ticket_number}
                      </span>
                      <span className={`${adminStyles.badge} ${statusBadge(t.status)}`}>
                        {t.status.replace("_", " ")}
                      </span>
                      <span className={`${adminStyles.badge} ${adminStyles.badgeType}`}>
                        {t.priority}
                      </span>
                    </div>
                    <div className={adminStyles.amount} style={{ fontSize: 16 }}>
                      {t.subject}
                    </div>
                    <div className={adminStyles.muted}>
                      {t.employee_name} · {categoryLabel(t.category)} ·{" "}
                      {ticketTypeLabel(t.category, t.ticket_type)}
                    </div>
                    {t.description ? (
                      <div className={adminStyles.muted} style={{ marginTop: 8, color: "#475569" }}>
                        {t.description}
                      </div>
                    ) : null}
                    <div
                      className={adminStyles.muted}
                      style={{ marginTop: 6, fontSize: 12, color: "#94a3b8" }}
                    >
                      {new Date(t.requested_at).toLocaleString()}
                    </div>
                  </div>
                  <div className={adminStyles.actions}>
                    <button
                      type="button"
                      className={
                        isTicketClosed(t.status) ? adminStyles.btnClosed : adminStyles.btnApprove
                      }
                      onClick={(e) => {
                        e.stopPropagation();
                        void openTicket(t);
                      }}
                    >
                      {isTicketClosed(t.status) ? "Closed" : "Manage"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {selected ? (
        <div className={adminStyles.modalBackdrop} onClick={() => setSelected(null)}>
          <div
            className={`${adminStyles.modal} ${adminStyles.modalWide}`}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className={adminStyles.modalTitle}>{selected.ticket_number}</h2>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
              <p className={adminStyles.muted} style={{ margin: 0 }}>
                {selected.employee_name} · {categoryLabel(selected.category)} ·{" "}
                {ticketTypeLabel(selected.category, selected.ticket_type)}
              </p>
              <span className={`${adminStyles.badge} ${statusBadge(selected.status)}`}>
                {selected.status.replace("_", " ")}
              </span>
            </div>
            <p style={{ fontWeight: 600, margin: "0 0 12px" }}>{selected.subject}</p>
            {selected.form_data && Object.keys(selected.form_data).length > 0 ? (
              <pre
                style={{
                  background: "#f8fafc",
                  padding: 12,
                  borderRadius: 8,
                  fontSize: 12,
                  overflow: "auto",
                  marginBottom: 12,
                }}
              >
                {JSON.stringify(selected.form_data, null, 2)}
              </pre>
            ) : null}

            <div className={adminStyles.chatSection}>
              <span className={adminStyles.chatSectionLabel}>Conversation</span>
              {threadMessages.length > 0 ? (
                <TicketThread messages={threadMessages} />
              ) : (
                <p className={adminStyles.muted} style={{ margin: 0 }}>
                  No messages yet.
                </p>
              )}
            </div>

            <button
              type="button"
              className={adminStyles.modalCloseBtn}
              onClick={() => setSelected(null)}
            >
              Close
            </button>

            <div
              className={`${adminStyles.chatComposer} ${ticketClosed ? adminStyles.chatComposerDisabled : ""}`}
            >
              {ticketClosed ? (
                <div className={adminStyles.ticketClosedNotice}>
                  This ticket is {selected.status.replace("_", " ")}. Replies are disabled.
                </div>
              ) : null}
              <label className={adminStyles.chatSectionLabel} htmlFor="ticket-reply">
                New reply
              </label>
              <textarea
                id="ticket-reply"
                className={adminStyles.textareaField}
                rows={3}
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder={
                  ticketClosed
                    ? "This ticket is closed — no new replies"
                    : "Type your reply… (previous messages stay above)"
                }
                disabled={ticketClosed}
                readOnly={ticketClosed}
                style={{ width: "100%" }}
              />
              <div className={adminStyles.chatSendRow}>
                <button
                  type="button"
                  className={adminStyles.btnSecondary}
                  disabled={ticketClosed || processing || !reply.trim()}
                  onClick={() => handleSendReply(selected.id)}
                >
                  Send reply
                </button>
              </div>
            </div>

            {!ticketClosed ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                className={adminStyles.btnPrimary}
                disabled={processing}
                onClick={() => handleStatus(selected.id, "in_progress")}
              >
                In progress
              </button>
              <button
                type="button"
                className={adminStyles.btnGreen}
                disabled={processing}
                onClick={() => handleStatus(selected.id, "resolved")}
              >
                Resolve
              </button>
              <button
                type="button"
                className={adminStyles.btnReject}
                disabled={processing}
                onClick={() => handleStatus(selected.id, "rejected")}
              >
                Reject
              </button>
            </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </LayoutDashboard>
  );
}
