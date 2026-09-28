"use client";

import React from "react";
import OptionalAdminShell from "@/app/components/OptionalAdminShell";
import adminStyles from "../admin-page.module.css";
import styles from "../presence-idle/presence-idle.module.css";
import { toastError, toastSuccess } from "@/lib/app-toast";

type AgentHealth = "healthy" | "stale" | "offline";

type AgentRow = {
  id: number;
  machineId: string;
  hostname: string | null;
  windowsUser: string | null;
  localEmployeeId: string | null;
  assignedEmployeeId: string | null;
  agentVersion: string | null;
  agentProduct: string | null;
  adminEnabled: boolean;
  idleSeconds: number;
  assignmentLocked?: boolean;
  lastIp: string | null;
  lastSeenAt: string | null;
  health: AgentHealth;
  assignedEmployeeName: string | null;
  assignedEmployeeCode: string | null;
  assignedPseudonym: string | null;
};

type EmpRow = {
  id: number;
  first_name?: string;
  last_name?: string;
  employee_code?: string | null;
  pseudonym?: string | null;
};

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
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

function healthLabel(h: AgentHealth) {
  if (h === "healthy") return "Online";
  if (h === "stale") return "Stale";
  return "Offline";
}

function empLabel(e: EmpRow) {
  const name =
    `${e.first_name || ""} ${e.last_name || ""}`.trim() || `Employee ${e.id}`;
  const pseudo = e.pseudonym ? ` · ${e.pseudonym}` : "";
  const code = e.employee_code ? ` · ${e.employee_code}` : "";
  return `${name}${pseudo} (ID ${e.id})${code}`;
}

export default function InteractGuardAdminPage() {
  const [agents, setAgents] = React.useState<AgentRow[]>([]);
  const [employees, setEmployees] = React.useState<EmpRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});
  const [deletingAll, setDeletingAll] = React.useState(false);

  const load = React.useCallback(async (opts?: { silent?: boolean }) => {
    const silent = !!opts?.silent;
    if (!silent) setLoading(true);
    try {
      const [aRes, eRes] = await Promise.all([
        fetch("/api/admin/presence-agents", { cache: "no-store" }),
        fetch("/api/employee-list", { cache: "no-store" }),
      ]);
      const aData = await aRes.json();
      const eData = await eRes.json();
      if (!aData.success) {
        if (!silent) toastError(aData.error || "Could not load agents");
        return;
      }
      const list = (Array.isArray(aData.agents) ? aData.agents : []) as AgentRow[];
      setAgents(list);
      setDrafts((prev) => {
        const next: Record<string, string> = {};
        for (const a of list) {
          next[a.machineId] =
            a.machineId in prev ? prev[a.machineId] : (a.assignedEmployeeId ?? "");
        }
        return next;
      });
      if (eData.success && Array.isArray(eData.employees)) {
        setEmployees(eData.employees);
      }
    } catch {
      if (!silent) toastError("Network error");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
    const t = window.setInterval(() => void load({ silent: true }), 30000);
    return () => window.clearInterval(t);
  }, [load]);

  const deleteAll = async () => {
    if (
      !window.confirm(
        "Delete ALL agent registrations from HRM?\n\n" +
          "Clears this list only — does not uninstall Guard on PCs.\n\nContinue?"
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
      toastSuccess(data.message || "All entries deleted");
      setAgents([]);
      setDrafts({});
    } catch {
      toastError("Network error");
    } finally {
      setDeletingAll(false);
    }
  };

  const patch = async (machineId: string, body: Record<string, unknown>) => {
    setBusy(machineId);
    try {
      const res = await fetch("/api/admin/presence-agents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ machine_id: machineId, ...body }),
      });
      const data = await res.json();
      if (!data.success) {
        toastError(data.error || "Update failed");
        return;
      }
      toastSuccess(
        body.unlock
          ? "Unlocked"
          : body.assigned_employee_id
            ? "Saved & locked"
            : "Saved",
      );
      await load();
    } catch {
      toastError("Network error");
    } finally {
      setBusy(null);
    }
  };

  const online = agents.filter((a) => a.health === "healthy").length;
  const onCount = agents.filter((a) => a.adminEnabled).length;

  return (
    <OptionalAdminShell>
      <div className={adminStyles.page}>
        <div className={adminStyles.inner}>
          <h1 className={adminStyles.title}>Interact Guard</h1>
          <p className={adminStyles.subtitle}>
            Installed PCs show here after Setup.exe. Assign employee, turn ON to start
            background monitoring. Idle / recheck timings come from{" "}
            <strong>Presence / Idle</strong> settings.
          </p>

        <div className={styles.statsRow}>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Registered PCs</span>
            <span className={styles.statValue}>{agents.length}</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Online now</span>
            <span className={styles.statValue}>{online}</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Monitoring ON</span>
            <span className={styles.statValue}>{onCount}</span>
          </div>
          <button type="button" className={styles.refreshBtn} onClick={() => void load()}>
            Refresh
          </button>
          <button
            type="button"
            className={styles.refreshBtn}
            disabled={deletingAll || agents.length === 0}
            onClick={() => void deleteAll()}
            style={{ borderColor: "#c62828", color: "#c62828" }}
          >
            {deletingAll ? "Deleting…" : "Delete all"}
          </button>
        </div>

        {loading && agents.length === 0 ? (
          <p>Loading…</p>
        ) : agents.length === 0 ? (
          <div className={styles.emptyBox}>
            <p>
              No PCs yet. Install <strong>Interact Guard</strong> (Setup.exe) on employee
              machines — they appear here after the first heartbeat (~20s).
            </p>
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.agentsTable}>
              <thead>
                <tr>
                  <th>Status</th>
                  <th>PC / User</th>
                  <th>Employee (name · pseudo · ID)</th>
                  <th>Monitor</th>
                  <th>Last seen</th>
                  <th>Version</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((a) => (
                  <tr key={a.machineId}>
                    <td>
                      <span
                        className={
                          a.health === "healthy"
                            ? styles.healthOk
                            : a.health === "stale"
                              ? styles.healthWarn
                              : styles.healthBad
                        }
                      >
                        {healthLabel(a.health)}
                      </span>
                    </td>
                    <td>
                      <div>
                        <strong>{a.hostname || "—"}</strong>
                      </div>
                      <div className={styles.muted}>
                        {a.windowsUser || "—"} · {a.lastIp || "no IP"}
                      </div>
                      <div className={styles.muted} style={{ fontSize: 11 }}>
                        {a.machineId.slice(0, 12)}…
                      </div>
                    </td>
                    <td>
                      {a.assignmentLocked ? (
                        <div>
                          <div>
                            <strong>
                              {a.assignedEmployeeName ||
                                (a.assignedEmployeeId
                                  ? `Employee ${a.assignedEmployeeId}`
                                  : "—")}
                            </strong>
                            {a.assignedPseudonym ? ` · ${a.assignedPseudonym}` : ""}
                            {a.assignedEmployeeId ? ` · ID ${a.assignedEmployeeId}` : ""}
                          </div>
                          <span className={styles.lockedBadge}>Locked</span>
                          <button
                            type="button"
                            className={styles.smallBtn}
                            disabled={busy === a.machineId}
                            onClick={() =>
                              void patch(a.machineId, { unlock: true })
                            }
                            style={{ marginLeft: 8 }}
                          >
                            Unlock
                          </button>
                        </div>
                      ) : (
                        <>
                          <select
                            value={drafts[a.machineId] ?? ""}
                            disabled={busy === a.machineId}
                            onChange={(e) =>
                              setDrafts((d) => ({
                                ...d,
                                [a.machineId]: e.target.value,
                              }))
                            }
                            style={{ maxWidth: 260 }}
                          >
                            <option value="">— Unassigned —</option>
                            {employees.map((e) => (
                              <option key={e.id} value={String(e.id)}>
                                {empLabel(e)}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className={styles.smallBtn}
                            disabled={busy === a.machineId || !(drafts[a.machineId] || "").trim()}
                            onClick={() =>
                              void patch(a.machineId, {
                                assigned_employee_id: drafts[a.machineId] || null,
                              })
                            }
                          >
                            Save
                          </button>
                        </>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className={
                          a.adminEnabled ? styles.toggleOn : styles.toggleOff
                        }
                        disabled={busy === a.machineId}
                        onClick={() =>
                          void patch(a.machineId, {
                            admin_enabled: !a.adminEnabled,
                          })
                        }
                      >
                        {a.adminEnabled ? "ON" : "OFF"}
                      </button>
                    </td>
                    <td>{formatWhen(a.lastSeenAt)}</td>
                    <td>
                      <div>{a.agentVersion || "—"}</div>
                      <div className={styles.muted}>{a.agentProduct || "—"}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        </div>
      </div>
    </OptionalAdminShell>
  );
}
