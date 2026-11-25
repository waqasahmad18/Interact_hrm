"use client";

import React from "react";
import adminStyles from "../admin-page.module.css";
import styles from "../presence-idle/presence-idle.module.css";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { formatDateTimeInServerTz } from "@/lib/timezone";

type TabId = "inbox" | "clips" | "live" | "settings";

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

type AudioClipRow = {
  id: number;
  employee_id: string;
  employee_name: string | null;
  pseudonym: string | null;
  audio_path: string;
  transcript: string | null;
  language: string | null;
  matched_json: string | null;
  ticket_number: string | null;
  byte_size: number | null;
  created_at: string;
};

type AgentRow = {
  machineId: string;
  hostname: string | null;
  assignedEmployeeId: string | null;
  assignedEmployeeName: string | null;
  assignedPseudonym?: string | null;
  health: "healthy" | "stale" | "offline";
  audioRecording?: boolean;
  lastSeenAt: string | null;
  agentVersion: string | null;
};

type Props = {
  onBack: () => void;
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
  const source = String(text || "").trim() || "(no transcript)";
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

export default function GuardAudioPanel({ onBack }: Props) {
  const [tab, setTab] = React.useState<TabId>("live");
  const [tickets, setTickets] = React.useState<PolicyTicket[]>([]);
  const [clips, setClips] = React.useState<AudioClipRow[]>([]);
  const [agents, setAgents] = React.useState<AgentRow[]>([]);
  const [audioWatchEnabled, setAudioWatchEnabled] = React.useState(true);
  const [audioClipSeconds, setAudioClipSeconds] = React.useState(20);
  const [audioGapSeconds, setAudioGapSeconds] = React.useState(120);
  const [policyEnabled, setPolicyEnabled] = React.useState(true);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [filter, setFilter] = React.useState<"open" | "all">("open");
  const [selected, setSelected] = React.useState<PolicyTicket | null>(null);
  const [selectedClip, setSelectedClip] = React.useState<AudioClipRow | null>(
    null
  );
  const [clipText, setClipText] = React.useState<string | null>(null);
  const [clipAudioReady, setClipAudioReady] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const loadSettings = React.useCallback(async () => {
    try {
      const res = await fetch("/api/admin/guard-keyword-watch", {
        cache: "no-store",
      });
      const data = await res.json();
      if (!data.success || !data.settings) {
        toastError(data.error || "Could not load audio settings");
        return;
      }
      setPolicyEnabled(!!data.settings.enabled);
      setAudioWatchEnabled(data.settings.audioWatchEnabled !== false);
      setAudioClipSeconds(
        Math.min(60, Math.max(10, Number(data.settings.audioClipSeconds) || 20))
      );
      setAudioGapSeconds(
        Math.min(3600, Math.max(0, Number(data.settings.audioGapSeconds) || 120))
      );
    } catch {
      toastError("Network error loading audio settings");
    }
  }, []);

  const loadInbox = React.useCallback(async () => {
    try {
      const q = new URLSearchParams({ limit: "200", source: "audio" });
      if (filter === "open") q.set("status", "open");
      const res = await fetch(`/api/admin/guard-policy-tickets?${q}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!data.success) {
        toastError(data.error || "Could not load audio inbox");
        return;
      }
      setTickets(data.tickets || []);
    } catch {
      toastError("Network error loading audio inbox");
    }
  }, [filter]);

  const loadClips = React.useCallback(async () => {
    try {
      const res = await fetch("/api/admin/guard-audio-clips?limit=100", {
        cache: "no-store",
      });
      const data = await res.json();
      if (!data.success) {
        if (data.locked) return;
        toastError(data.error || "Could not load clips");
        return;
      }
      const rows = Array.isArray(data.clips) ? (data.clips as AudioClipRow[]) : [];
      setClips(rows);
      setSelectedClip((prev) => {
        if (!prev) return prev;
        return rows.find((c) => c.id === prev.id) || prev;
      });
    } catch {
      toastError("Network error loading clips");
    }
  }, []);

  const loadAgents = React.useCallback(async () => {
    try {
      const res = await fetch("/api/admin/presence-agents", { cache: "no-store" });
      const data = await res.json();
      if (!data.success) return;
      setAgents(Array.isArray(data.agents) ? data.agents : []);
    } catch {
      /* soft */
    }
  }, []);

  const refreshAll = React.useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadSettings(),
        loadInbox(),
        loadClips(),
        loadAgents(),
      ]);
    } finally {
      setLoading(false);
    }
  }, [loadSettings, loadInbox, loadClips, loadAgents]);

  React.useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  React.useEffect(() => {
    const id = window.setInterval(() => {
      void loadAgents();
      if (tab === "inbox") void loadInbox();
      if (tab === "clips") void loadClips();
    }, 8000);
    return () => window.clearInterval(id);
  }, [loadAgents, loadInbox, loadClips, tab]);

  async function saveSettings() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/guard-keyword-watch", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: policyEnabled,
          audioWatchEnabled,
          audioClipSeconds,
          audioGapSeconds,
        }),
        cache: "no-store",
      });
      const data = await res.json();
      if (!data.success) {
        toastError(data.error || "Save failed");
        return;
      }
      setAudioWatchEnabled(data.settings?.audioWatchEnabled !== false);
      setPolicyEnabled(!!data.settings?.enabled);
      setAudioClipSeconds(
        Math.min(60, Math.max(10, Number(data.settings?.audioClipSeconds) || 20))
      );
      setAudioGapSeconds(
        Math.min(3600, Math.max(0, Number(data.settings?.audioGapSeconds) || 120))
      );
      toastSuccess("Audio settings saved");
    } catch {
      toastError("Network error saving");
    } finally {
      setSaving(false);
    }
  }

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
      await loadInbox();
    } catch {
      toastError("Network error");
    } finally {
      setBusy(false);
    }
  }

  async function convertClipToText(id: number) {
    setBusy(true);
    setClipText(null);
    try {
      const res = await fetch("/api/admin/guard-audio-clips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, force: true }),
      });
      const data = await res.json();
      if (!data.success) {
        toastError(data.error || "Convert failed");
        return;
      }
      if (data.clip) {
        setSelectedClip(data.clip as AudioClipRow);
        setClips((prev) =>
          prev.map((c) => (c.id === data.clip.id ? data.clip : c))
        );
      }
      if (data.empty) {
        setClipText(data.message || "No speech detected in this clip.");
        toastError(data.message || "No speech detected");
      } else {
        setClipText(String(data.transcript || ""));
        toastSuccess("Transcript ready");
      }
    } catch {
      toastError("Network error converting clip");
    } finally {
      setBusy(false);
    }
  }

  const recordingAgents = agents.filter(
    (a) => a.audioRecording && a.health !== "offline" && a.assignedEmployeeId
  );
  const onlineAgents = agents.filter(
    (a) => a.health === "healthy" && a.assignedEmployeeId
  );

  const form = selected?.form_data || {};
  const matched = (
    Array.isArray(form.matched)
      ? (form.matched as unknown[]).map((m) => String(m))
      : []
  ).slice(0, 1);
  const evidence = String(form.evidence || "").trim();
  const audioPath = String(form.audio_path || "").trim();
  const pseudonym = String(form.pseudonym || "").trim();

  const tabs: { id: TabId; label: string }[] = [
    { id: "live", label: "Live status" },
    { id: "clips", label: "Clips" },
    { id: "inbox", label: "Audio inbox" },
    { id: "settings", label: "Settings" },
  ];

  return (
    <div className={styles.section}>
      <div className={styles.detailHeader}>
        <button type="button" className={styles.navBackBtn} onClick={onBack}>
          ← Profiles
        </button>
        <div>
          <h2 className={styles.detailTitle}>Audio watch</h2>
          <p className={styles.detailSub}>
            Mic clips for quality + optional text. Keyword hits stay in Audio
            inbox (not Admin Ticket Inbox).
          </p>
        </div>
      </div>

      <div
        className={styles.durationRow}
        style={{ marginBottom: 12, gap: 10, flexWrap: "wrap" }}
      >
        <span
          className={styles.chipActive}
          style={{
            background: recordingAgents.length ? "#ecfdf5" : "#f8fafc",
            borderColor: recordingAgents.length ? "#10b981" : "#e2e8f0",
            color: recordingAgents.length ? "#047857" : "#64748b",
          }}
        >
          {recordingAgents.length
            ? `● Recording now: ${recordingAgents.length}`
            : "○ No mic recording right now"}
        </span>
        <span className={styles.tip}>
          Online agents: {onlineAgents.length} · Clips: {clips.length} · Alerts:{" "}
          {tickets.length}
        </span>
        <button
          type="button"
          className={adminStyles.btnSecondary}
          disabled={loading}
          onClick={() => void refreshAll()}
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      <div className={styles.chips} style={{ marginBottom: 14 }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`${styles.chip}${tab === t.id ? ` ${styles.chipActive}` : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "live" ? (
        <div className={styles.block}>
          <h3 className={styles.blockTitle}>Who is recording</h3>
          <p className={styles.tip} style={{ marginBottom: 10 }}>
            Green = agent heartbeat says mic→Whisper loop is ON. Updates every
            few seconds.
          </p>
          {agents.filter((a) => a.assignedEmployeeId).length === 0 ? (
            <p className={styles.tip}>No assigned Guard agents yet.</p>
          ) : (
            <div className={styles.profileGrid}>
              {agents
                .filter((a) => a.assignedEmployeeId)
                .map((a) => {
                  const rec = !!a.audioRecording && a.health !== "offline";
                  const name =
                    a.assignedEmployeeName ||
                    `Employee ${a.assignedEmployeeId}`;
                  return (
                    <div
                      key={a.machineId}
                      className={styles.profileCard}
                      style={{
                        borderColor: rec ? "#10b981" : undefined,
                        boxShadow: rec
                          ? "0 0 0 1px rgba(16,185,129,0.35)"
                          : undefined,
                      }}
                    >
                      <div className={styles.profileCardTop}>
                        <strong>{name}</strong>
                        <span
                          className={
                            rec
                              ? styles.healthOk
                              : a.health === "healthy"
                                ? styles.healthOk
                                : a.health === "stale"
                                  ? styles.healthWarn
                                  : styles.healthBad
                          }
                        >
                          {rec
                            ? "RECORDING"
                            : a.health === "healthy"
                              ? "Online"
                              : a.health === "stale"
                                ? "Stale"
                                : "Offline"}
                        </span>
                      </div>
                      <p className={styles.tip} style={{ margin: "6px 0 0" }}>
                        ID {a.assignedEmployeeId}
                        {a.assignedPseudonym
                          ? ` · ${a.assignedPseudonym}`
                          : ""}
                        {a.hostname ? ` · ${a.hostname}` : ""}
                      </p>
                      <p className={styles.tip} style={{ margin: "4px 0 0" }}>
                        {rec
                          ? "Mic clip → Whisper running"
                          : audioWatchEnabled
                            ? "Audio watch enabled in admin — waiting for agent ON + sidecar"
                            : "Audio watch OFF in Settings"}
                      </p>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      ) : null}

      {tab === "clips" ? (
        <div className={styles.policyInbox}>
          <p className={styles.tip} style={{ marginBottom: 10 }}>
            Every mic listen window is saved here so you can hear quality. Convert
            to text turns Urdu / Hindi / English speech into English text. If
            headset says &quot;lower microphone to unmute&quot;, boom arm is up —
            lower it or clips will be silence.
          </p>
          <div className={styles.policyInboxGrid}>
            <div className={styles.policyList}>
              {clips.length === 0 ? (
                <p className={styles.tip}>
                  No clips yet — wait for next listen window after Guard 1.2.68+.
                </p>
              ) : (
                clips.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`${styles.policyListItem}${
                      selectedClip?.id === c.id
                        ? ` ${styles.policyListItemActive}`
                        : ""
                    }`}
                    onClick={() => {
                      setSelectedClip(c);
                      setClipText(null);
                      setClipAudioReady(false);
                    }}
                  >
                    <strong>
                      #{c.id}
                      {c.ticket_number ? ` · ${c.ticket_number}` : ""}
                    </strong>
                    <span>
                      {c.employee_name || `Employee ${c.employee_id}`}
                    </span>
                    <span className={styles.tip}>
                      {c.byte_size != null
                        ? `${Math.max(1, Math.round(c.byte_size / 1024))} KB · `
                        : ""}
                      {formatDateTimeInServerTz(c.created_at)}
                      {c.transcript ? " · has text" : ""}
                    </span>
                  </button>
                ))
              )}
            </div>
            <div className={styles.policyDetail}>
              {!selectedClip ? (
                <p className={styles.tip}>Select a clip to play.</p>
              ) : (
                <>
                  <h3 className={styles.detailTitle}>
                    Clip #{selectedClip.id}
                  </h3>
                  <p className={styles.detailSub}>
                    {selectedClip.employee_name || "Employee"} · ID{" "}
                    {selectedClip.employee_id}
                    {selectedClip.pseudonym
                      ? ` · ${selectedClip.pseudonym}`
                      : ""}
                  </p>
                  <div className={styles.block} style={{ marginTop: 10 }}>
                    <h3 className={styles.blockTitle}>Play clip</h3>
                    <p className={styles.tip} style={{ marginBottom: 8 }}>
                      {selectedClip.audio_path}
                      {!clipAudioReady ? " · loading…" : ""}
                    </p>
                    <audio
                      key={selectedClip.id}
                      controls
                      preload="auto"
                      src={`/api/admin/guard-audio/file?path=${encodeURIComponent(
                        selectedClip.audio_path
                      )}`}
                      onLoadStart={() => setClipAudioReady(false)}
                      onCanPlay={() => setClipAudioReady(true)}
                      onError={() => setClipAudioReady(false)}
                      style={{ width: "100%" }}
                    />
                  </div>
                  <div className={styles.block}>
                    <h3 className={styles.blockTitle}>Convert to text</h3>
                    {clipText != null ? (
                      <pre className={styles.policyEvidence}>{clipText}</pre>
                    ) : selectedClip.transcript ? (
                      <pre className={styles.policyEvidence}>
                        {selectedClip.transcript}
                      </pre>
                    ) : (
                      <p className={styles.tip}>
                        Transcript not shown yet — click Convert to text.
                      </p>
                    )}
                    <div className={styles.actions} style={{ marginTop: 10 }}>
                      <button
                        type="button"
                        className={adminStyles.btnPrimary}
                        disabled={busy}
                        onClick={() => void convertClipToText(selectedClip.id)}
                      >
                        {busy ? "Working…" : "Convert to text"}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {tab === "inbox" ? (
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
            <span className={styles.tip}>{tickets.length} audio alert(s)</span>
          </div>
          <div className={styles.policyInboxGrid}>
            <div className={styles.policyList}>
              {tickets.length === 0 ? (
                <p className={styles.tip}>No audio policy alerts yet.</p>
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
                    <span>{t.employee_name}</span>
                    <span className={styles.tip}>
                      {t.status} · {formatDateTimeInServerTz(t.requested_at)}
                    </span>
                  </button>
                ))
              )}
            </div>
            <div className={styles.policyDetail}>
              {!selected ? (
                <p className={styles.tip}>Select an audio alert.</p>
              ) : (
                <>
                  <h3 className={styles.detailTitle}>
                    {selected.subject || "Audio policy alert"}
                  </h3>
                  <p className={styles.detailSub}>
                    {selected.employee_name}
                    {pseudonym ? ` · ${pseudonym}` : ""} · ID{" "}
                    {selected.employee_id}
                  </p>
                  <div className={styles.block} style={{ marginTop: 10 }}>
                    <h3 className={styles.blockTitle}>Word matched (spoken)</h3>
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
                    <h3 className={styles.blockTitle}>Transcript</h3>
                    <HighlightEvidence text={evidence} matched={matched} />
                  </div>
                  {audioPath ? (
                    <div className={styles.block}>
                      <h3 className={styles.blockTitle}>Audio evidence</h3>
                      <p className={styles.tip} style={{ marginBottom: 8 }}>
                        {audioPath}
                      </p>
                      <audio
                        controls
                        preload="auto"
                        src={`/api/admin/guard-audio/file?path=${encodeURIComponent(audioPath)}`}
                        style={{ width: "100%" }}
                      />
                    </div>
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
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {tab === "settings" ? (
        <div className={styles.block}>
          <h3 className={styles.blockTitle}>Audio watch settings</h3>
          <label className={styles.toggleRow} style={{ marginBottom: 12 }}>
            <input
              type="checkbox"
              checked={policyEnabled}
              disabled={saving}
              onChange={(e) => setPolicyEnabled(e.target.checked)}
            />
            <span className={styles.toggleText}>
              <span className={styles.toggleTitle}>Enable policy alerts</span>
              <span className={styles.toggleHint}>
                Master switch — required for audio tickets too.
              </span>
            </span>
          </label>
          <label className={styles.toggleRow}>
            <input
              type="checkbox"
              checked={audioWatchEnabled}
              disabled={saving}
              onChange={(e) => setAudioWatchEnabled(e.target.checked)}
            />
            <span className={styles.toggleText}>
              <span className={styles.toggleTitle}>Audio watch (mic → Whisper)</span>
              <span className={styles.toggleHint}>
                Timed mic clips on Guard PCs. Sensitive speech → Audio inbox + clip.
              </span>
            </span>
          </label>

          <h3 className={styles.blockTitle} style={{ marginTop: 16 }}>
            Mic timing
          </h3>
          <div className={styles.durationRow} style={{ gap: 16, flexWrap: "wrap" }}>
            <div className={styles.field} style={{ minWidth: 180 }}>
              <label htmlFor="au-clip">Listen window (seconds)</label>
              <input
                id="au-clip"
                type="number"
                min={10}
                max={60}
                value={audioClipSeconds}
                disabled={saving}
                onChange={(e) =>
                  setAudioClipSeconds(
                    Math.min(60, Math.max(10, Number(e.target.value) || 10))
                  )
                }
              />
              <span className={styles.tip}>Mic ON for this long each cycle</span>
            </div>
            <div className={styles.field} style={{ minWidth: 180 }}>
              <label htmlFor="au-gap">Gap after listen (seconds)</label>
              <input
                id="au-gap"
                type="number"
                min={0}
                max={3600}
                value={audioGapSeconds}
                disabled={saving}
                onChange={(e) =>
                  setAudioGapSeconds(
                    Math.min(3600, Math.max(0, Number(e.target.value) || 0))
                  )
                }
              />
              <span className={styles.tip}>
                Mic idle between clips (e.g. 120 = 2 min). Reduces tray mic blink.
              </span>
            </div>
          </div>
          <p className={styles.tip} style={{ marginTop: 10 }}>
            Windows always shows the taskbar mic icon while any app is listening —
            that OS privacy light cannot be hidden. Use a longer gap so it appears
            only briefly. Words list is shared with Policy → Words (OCR).
          </p>
          <p className={styles.tip} style={{ marginTop: 8 }}>
            Headset tip: &quot;Lower microphone to unmute&quot; means the boom arm
            is raised (muted) — usually Jabra/Evolve. Lower the boom or Guard
            clips will be silence.
          </p>
          <div className={styles.actions} style={{ marginTop: 14 }}>
            <button
              type="button"
              className={adminStyles.btnPrimary}
              disabled={saving}
              onClick={() => void saveSettings()}
            >
              {saving ? "Saving…" : "Save audio settings"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
