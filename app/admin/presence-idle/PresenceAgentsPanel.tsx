"use client";

import React from "react";
import adminStyles from "../admin-page.module.css";
import styles from "./presence-idle.module.css";
import { toastError, toastSuccess } from "@/lib/app-toast";

type AgentHealth = "healthy" | "stale" | "offline";

type AgentRow = {
  id: number;
  machineId: string;
  hostname: string | null;
  windowsUser: string | null;
  hrmBaseUrl: string | null;
  localEmployeeId: string | null;
  assignedEmployeeId: string | null;
  agentVersion: string | null;
  lastIp: string | null;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  health: AgentHealth;
  assignedEmployeeName: string | null;
  assignedEmployeeCode: string | null;
  assignmentLocked?: boolean;
  adminEnabled?: boolean;
};

type AgentSummary = {
  total: number;
  healthy: number;
  stale: number;
  offline: number;
  withAssignedId: number;
  withLocalId: number;
};

type EmpRow = {
  id: number;
  first_name?: string;
  last_name?: string;
  employee_code?: string | null;
};

/** Preset HRM targets admin can lock onto a PC. */
const HRM_URL_PRESETS = [
  { value: "https://hrm.ig.com", label: "Main HRM — https://hrm.ig.com" },
  {
    value: "https://hrm.ig.com/auth",
    label: "Main HRM auth — https://hrm.ig.com/auth",
  },
  {
    value: "https://192.168.10.6:8443",
    label: "Staging — https://192.168.10.6:8443",
  },
  {
    value: "https://192.168.10.98:8443",
    label: "Production LAN — https://192.168.10.98:8443",
  },
] as const;

function formatWhen(iso: string | null) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return iso;
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function healthLabel(h: AgentHealth) {
  if (h === "healthy") return "Active";
  if (h === "stale") return "Stale";
  return "Offline";
}

function empLabel(e: EmpRow) {
  const name =
    `${e.first_name || ""} ${e.last_name || ""}`.trim() || `Employee ${e.id}`;
  const code = e.employee_code ? ` · ${e.employee_code}` : "";
  return `${name} (ID ${e.id})${code}`;
}

function normalizeUrlDraft(url: string | null | undefined) {
  return String(url ?? "").trim().replace(/\/+$/, "");
}

type Props = {
  employees: EmpRow[];
};

export default function PresenceAgentsPanel({ employees }: Props) {
  const [agents, setAgents] = React.useState<AgentRow[]>([]);
  const [summary, setSummary] = React.useState<AgentSummary | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [savingId, setSavingId] = React.useState<string | null>(null);
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});
  const [urlDrafts, setUrlDrafts] = React.useState<Record<string, string>>({});
  const [retiring, setRetiring] = React.useState(false);
  const [starting, setStarting] = React.useState(false);
  const [deletingAll, setDeletingAll] = React.useState(false);

  const load = React.useCallback(async (opts?: { silent?: boolean }) => {
    const silent = !!opts?.silent;
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/admin/presence-agents", { cache: "no-store" });
      const data = await res.json();
      if (!data.success) {
        if (!silent) toastError(data.error || "Could not load agents");
        return;
      }
      const list = (Array.isArray(data.agents) ? data.agents : []) as AgentRow[];
      setAgents(list);
      setSummary(data.summary ?? null);
      setDrafts((prev) => {
        const next: Record<string, string> = {};
        for (const a of list) {
          next[a.machineId] =
            a.machineId in prev ? prev[a.machineId] : (a.assignedEmployeeId ?? "");
        }
        return next;
      });
      setUrlDrafts((prev) => {
        const next: Record<string, string> = {};
        for (const a of list) {
          const current = normalizeUrlDraft(a.hrmBaseUrl);
          next[a.machineId] =
            a.machineId in prev
              ? prev[a.machineId]
              : current || "https://hrm.ig.com/auth";
        }
        return next;
      });
    } catch {
      if (!silent) toastError("Network error loading agents");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
    const t = setInterval(() => void load({ silent: true }), 30000);
    return () => clearInterval(t);
  }, [load]);

  async function startAllAgents() {
    setStarting(true);
    try {
      const res = await fetch("/api/admin/presence-agents/start-all", {
        method: "POST",
      });
      const data = await res.json();
      if (!data.success) {
        toastError(data.error || "Start all failed");
        return;
      }
      toastSuccess(data.message || "All agents re-activated");
      await load();
    } catch {
      toastError("Network error during start all");
    } finally {
      setStarting(false);
    }
  }

  async function retireAllAgents() {
    if (
      !window.confirm(
        "Permanently shut down InteractPresence on ALL employee PCs?\n\n" +
          "• Running agents will exit within ~15 seconds\n" +
          "• Auto-start on Windows login will be removed (v0.5.2+)\n" +
          "• Publish agent 0.5.2 below so older installs update first\n\n" +
          "Continue?"
      )
    ) {
      return;
    }
    setRetiring(true);
    try {
      const res = await fetch("/api/admin/presence-agents/retire-all", {
        method: "POST",
      });
      const data = await res.json();
      if (!data.success) {
        toastError(data.error || "Permanent shutdown failed");
        return;
      }
      toastSuccess(data.message || "Permanent shutdown enabled for all agents");
      await load();
    } catch {
      toastError("Network error during permanent shutdown");
    } finally {
      setRetiring(false);
    }
  }

  async function queueCommand(
    command: "restart" | "exit" | "start" | "pause",
    opts?: { machineId?: string; all?: boolean }
  ) {
    try {
      const res = await fetch("/api/admin/presence-agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command,
          all: opts?.all ?? false,
          machine_id: opts?.machineId,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        toastError(data.error || "Command failed");
        return;
      }
      toastSuccess(
        command === "start"
          ? "Started — monitoring armed."
          : command === "pause"
            ? "Stopped — face checks paused."
            : data.message || "Command queued",
      );
      if (opts?.machineId && (command === "start" || command === "pause")) {
        const on = command === "start";
        setAgents((prev) =>
          prev.map((a) =>
            a.machineId === opts.machineId ? { ...a, adminEnabled: on } : a,
          ),
        );
      }
      await load({ silent: true });
      if (command === "start" || command === "pause") {
        for (const ms of [5000, 12000, 20000]) {
          window.setTimeout(() => void load({ silent: true }), ms);
        }
      }
    } catch {
      toastError("Network error sending command");
    }
  }

  async function setMonitoring(machineId: string, enabled: boolean) {
    setAgents((prev) =>
      prev.map((a) =>
        a.machineId === machineId ? { ...a, adminEnabled: enabled } : a,
      ),
    );
    try {
      const res = await fetch("/api/admin/presence-agents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          machine_id: machineId,
          admin_enabled: enabled,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        toastError(data.error || "Could not update Start/Stop");
        await load({ silent: true });
        return;
      }
      toastSuccess(
        enabled
          ? "Started — idle face checks armed"
          : "Stopped — idle face checks paused",
      );
    } catch {
      toastError("Network error updating Start/Stop");
      await load({ silent: true });
    }
  }

  async function deleteAllAgents() {
    if (
      !window.confirm(
        "Delete ALL agent registrations from HRM?\n\n" +
          "This only clears the list here (DB rows). It does not uninstall software on PCs.\n" +
          "Stale/ghost entries after uninstall will disappear.\n\n" +
          "Continue?"
      )
    ) {
      return;
    }
    setDeletingAll(true);
    try {
      const res = await fetch("/api/admin/presence-agents?all=1", {
        method: "DELETE",
      });
      const data = await res.json();
      if (!data.success) {
        toastError(data.error || "Delete all failed");
        return;
      }
      toastSuccess(data.message || "All agent entries deleted");
      setAgents([]);
      setSummary({
        total: 0,
        healthy: 0,
        stale: 0,
        offline: 0,
        withAssignedId: 0,
        withLocalId: 0,
      });
      setDrafts({});
      setUrlDrafts({});
    } catch {
      toastError("Network error deleting agents");
    } finally {
      setDeletingAll(false);
    }
  }

  async function saveAssignment(machineId: string) {
    setSavingId(machineId);
    try {
      const draft = drafts[machineId] ?? "";
      const url = normalizeUrlDraft(urlDrafts[machineId]);
      if (!draft.trim()) {
        toastError("Select an employee before Save — Save locks the profile.");
        return;
      }
      if (!url) {
        toastError("Select an HRM URL before Save.");
        return;
      }
      const res = await fetch("/api/admin/presence-agents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          machine_id: machineId,
          assigned_employee_id: draft.trim(),
          hrm_base_url: url,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        toastError(data.error || "Save failed");
        return;
      }
      toastSuccess("Saved & locked — employee, name, IP and HRM URL are fixed.");
      await load();
    } catch {
      toastError("Network error saving assignment");
    } finally {
      setSavingId(null);
    }
  }

  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  async function deleteOneAgent(machineId: string, label: string) {
    if (
      !window.confirm(
        `Remove this agent from HRM?\n\n${label}\n\n` +
          "Clears this registration only — does not uninstall software on the PC."
      )
    ) {
      return;
    }
    setDeletingId(machineId);
    try {
      const res = await fetch(
        `/api/admin/presence-agents?machine_id=${encodeURIComponent(machineId)}`,
        { method: "DELETE" },
      );
      const data = await res.json();
      if (!data.success) {
        toastError(data.error || "Delete failed");
        return;
      }
      toastSuccess("Agent removed from list");
      await load();
    } catch {
      toastError("Network error deleting agent");
    } finally {
      setDeletingId(null);
    }
  }

  async function editAssignment(machineId: string) {
    setSavingId(machineId);
    try {
      const res = await fetch("/api/admin/presence-agents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ machine_id: machineId, unlock: true }),
      });
      const data = await res.json();
      if (!data.success) {
        toastError(data.error || "Could not open for edit");
        return;
      }
      toastSuccess("Edit mode — change employee / HRM URL, then Save to lock again.");
      await load();
    } catch {
      toastError("Network error opening edit");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className={adminStyles.card}>
      <div className={styles.agentsHeader}>
        <div>
          <h2 className={styles.agentsTitle}>Installed agents</h2>
          <p className={styles.tip} style={{ marginTop: 4 }}>
            Pick employee + HRM URL (e.g. <strong>https://hrm.ig.com/auth</strong>), then{" "}
            <strong>Save</strong> to lock all details. Use <strong>Edit</strong> only if you
            need changes. Interact Guard page is unchanged.
          </p>
        </div>
        <div className={styles.agentsHeaderActions}>
          <button type="button" className={styles.chip} onClick={() => void load()}>
            Refresh
          </button>
          <button
            type="button"
            className={`${styles.chip} ${styles.chipSuccess}`}
            disabled={starting}
            onClick={() => void startAllAgents()}
          >
            {starting ? "Starting…" : "Start all (activate)"}
          </button>
          <button
            type="button"
            className={`${styles.chip} ${styles.chipDanger}`}
            disabled={!summary?.total}
            onClick={() => {
              setAgents((prev) => prev.map((a) => ({ ...a, adminEnabled: false })));
              void queueCommand("pause", { all: true });
            }}
          >
            Stop all
          </button>
          <button
            type="button"
            className={`${styles.chip} ${styles.chipDanger}`}
            disabled={retiring}
            onClick={() => void retireAllAgents()}
          >
            {retiring ? "Shutting down…" : "Permanent shutdown"}
          </button>
          <button
            type="button"
            className={styles.chip}
            disabled={!summary?.total}
            onClick={() => void queueCommand("restart", { all: true })}
          >
            Restart all
          </button>
          <button
            type="button"
            className={`${styles.chip} ${styles.chipDanger}`}
            disabled={deletingAll || !summary?.total}
            onClick={() => void deleteAllAgents()}
          >
            {deletingAll ? "Deleting…" : "Delete all"}
          </button>
        </div>
      </div>

      {summary ? (
        <div className={styles.statsRow}>
          <span className={styles.stat}>
            Total <strong>{summary.total}</strong>
          </span>
          <span className={`${styles.stat} ${styles.statHealthy}`}>
            Active <strong>{summary.healthy}</strong>
          </span>
          <span className={`${styles.stat} ${styles.statStale}`}>
            Stale <strong>{summary.stale}</strong>
          </span>
          <span className={`${styles.stat} ${styles.statOffline}`}>
            Offline <strong>{summary.offline}</strong>
          </span>
          <span className={styles.stat}>
            Admin ID set <strong>{summary.withAssignedId}</strong>
          </span>
          <span className={styles.stat}>
            Local ID <strong>{summary.withLocalId}</strong>
          </span>
        </div>
      ) : null}

      {loading && agents.length === 0 ? (
        <p className={styles.loading}>Loading agents…</p>
      ) : agents.length === 0 ? (
        <p className={styles.tip}>
          No agents registered yet. Publish agent <strong>0.5.0</strong> below — existing
          installs auto-update within ~30 seconds, then appear here.
        </p>
      ) : (
        <div className={styles.agentsTableWrap}>
          <table className={styles.agentsTable}>
            <thead>
              <tr>
                <th>Status</th>
                <th>PC</th>
                <th>HRM URL</th>
                <th>Local ID</th>
                <th>Assign employee</th>
                <th>Version</th>
                <th>Last seen</th>
                <th>IP</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {agents.map((a) => {
                const locked = !!a.assignmentLocked;
                const lockedEmp =
                  a.assignedEmployeeName ||
                  (a.assignedEmployeeId ? `Employee ${a.assignedEmployeeId}` : null);
                const urlValue = urlDrafts[a.machineId] ?? "";
                const urlInPresets = HRM_URL_PRESETS.some((p) => p.value === urlValue);
                return (
                  <tr
                    key={a.machineId}
                    className={locked ? styles.rowLocked : undefined}
                  >
                    <td>
                      <span
                        className={`${styles.healthBadge} ${styles[`health_${a.health}`]}`}
                      >
                        {healthLabel(a.health)}
                      </span>
                      {locked ? (
                        <span
                          className={styles.lockedBadge}
                          title="Saved profile is locked"
                        >
                          Locked
                        </span>
                      ) : null}
                    </td>
                    <td>
                      <div className={styles.pcCell}>
                        <strong>{a.hostname || "Unknown PC"}</strong>
                        <span className={styles.empMeta}>{a.windowsUser || "—"}</span>
                      </div>
                    </td>
                    <td className={styles.urlCell}>
                      {locked ? (
                        <span title={a.hrmBaseUrl || ""}>{a.hrmBaseUrl || "—"}</span>
                      ) : (
                        <select
                          className={styles.select}
                          value={urlInPresets ? urlValue : "__custom__"}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v === "__custom__") return;
                            setUrlDrafts((d) => ({ ...d, [a.machineId]: v }));
                          }}
                        >
                          {!urlInPresets && urlValue ? (
                            <option value="__custom__">{urlValue}</option>
                          ) : null}
                          {HRM_URL_PRESETS.map((p) => (
                            <option key={p.value} value={p.value}>
                              {p.label}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td>{a.localEmployeeId || "—"}</td>
                    <td>
                      {locked ? (
                        <div className={styles.lockedEmp}>
                          <strong>{lockedEmp || "—"}</strong>
                          {a.assignedEmployeeId ? (
                            <span className={styles.empMeta}>
                              ID {a.assignedEmployeeId}
                            </span>
                          ) : null}
                        </div>
                      ) : (
                        <select
                          className={styles.select}
                          value={drafts[a.machineId] ?? ""}
                          onChange={(e) =>
                            setDrafts((d) => ({
                              ...d,
                              [a.machineId]: e.target.value,
                            }))
                          }
                        >
                          <option value="">— Not assigned —</option>
                          {employees.map((e) => (
                            <option key={e.id} value={String(e.id)}>
                              {empLabel(e)}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td>{a.agentVersion || "—"}</td>
                    <td>{formatWhen(a.lastSeenAt)}</td>
                    <td>{a.lastIp || "—"}</td>
                    <td>
                      <div className={styles.rowActions}>
                        {locked ? (
                          <button
                            type="button"
                            className={styles.chip}
                            disabled={savingId === a.machineId}
                            onClick={() => void editAssignment(a.machineId)}
                          >
                            {savingId === a.machineId ? "…" : "Edit"}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className={styles.chip}
                            disabled={savingId === a.machineId}
                            onClick={() => void saveAssignment(a.machineId)}
                          >
                            {savingId === a.machineId ? "Saving…" : "Save"}
                          </button>
                        )}
                        {a.adminEnabled ? (
                          <button
                            type="button"
                            className={`${styles.chip} ${styles.chipDanger}`}
                            onClick={() => void setMonitoring(a.machineId, false)}
                          >
                            Stop
                          </button>
                        ) : (
                          <button
                            type="button"
                            className={`${styles.chip} ${styles.chipSuccess}`}
                            onClick={() => void setMonitoring(a.machineId, true)}
                          >
                            Start
                          </button>
                        )}
                        <button
                          type="button"
                          className={styles.chip}
                          onClick={() =>
                            void queueCommand("restart", { machineId: a.machineId })
                          }
                        >
                          Restart
                        </button>
                        <button
                          type="button"
                          className={`${styles.chip} ${styles.chipDanger}`}
                          disabled={deletingId === a.machineId}
                          onClick={() =>
                            void deleteOneAgent(
                              a.machineId,
                              `${a.hostname || "PC"} · ${a.assignedEmployeeName || a.assignedEmployeeId || a.localEmployeeId || a.machineId}`,
                            )
                          }
                        >
                          {deletingId === a.machineId ? "…" : "Delete"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
