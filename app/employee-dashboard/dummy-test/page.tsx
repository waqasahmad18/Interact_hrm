"use client";

import React from "react";
import { FaFlask, FaDatabase } from "react-icons/fa";

type Note = {
  id: number;
  login_id: string | null;
  note: string;
  created_at: string;
};

export default function DummyTestPage() {
  const [notes, setNotes] = React.useState<Note[]>([]);
  const [note, setNote] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [msg, setMsg] = React.useState<{ text: string; ok: boolean } | null>(null);

  const loginId =
    typeof window !== "undefined" ? localStorage.getItem("loginId") || "" : "";

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/dummy-notes?loginId=${encodeURIComponent(loginId)}`,
        { cache: "no-store" }
      );
      const data = await res.json();
      if (data.success) setNotes(data.notes || []);
      else setMsg({ text: data.error || "Could not load notes", ok: false });
    } catch {
      setMsg({ text: "Could not load notes", ok: false });
    } finally {
      setLoading(false);
    }
  }, [loginId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!note.trim()) return;
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/dummy-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loginId, note }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed");
      setNote("");
      setMsg({ text: "Saved to database ✓", ok: true });
      await load();
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Failed", ok: false });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "8px 4px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <FaFlask style={{ color: "#611f69", fontSize: 22 }} />
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Dummy Test</h1>
      </div>
      <p style={{ color: "#64748b", marginTop: 0, marginBottom: 20, fontSize: 14 }}>
        End-to-end test: type something, save it to the <code>hrm_dummy_notes</code>{" "}
        database table, and see it listed below. Proves the auto-deploy +
        auto-migration pipeline works without touching the server.
      </p>

      <div
        style={{
          background: "#fff",
          borderRadius: 14,
          boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
          padding: 18,
          marginBottom: 22,
        }}
      >
        <label style={{ fontWeight: 600, fontSize: 13, display: "block", marginBottom: 8 }}>
          Your note
        </label>
        <div style={{ display: "flex", gap: 10 }}>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void save();
            }}
            placeholder="Type a note and press Save…"
            maxLength={500}
            style={{
              flex: 1,
              padding: "10px 12px",
              border: "1px solid #d1d5db",
              borderRadius: 10,
              fontSize: 14,
              outline: "none",
            }}
          />
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !note.trim()}
            style={{
              background: saving || !note.trim() ? "#c4b5d4" : "#611f69",
              color: "#fff",
              border: "none",
              borderRadius: 10,
              padding: "10px 20px",
              fontWeight: 600,
              fontSize: 14,
              cursor: saving || !note.trim() ? "default" : "pointer",
            }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
        {msg ? (
          <p
            style={{
              marginTop: 12,
              marginBottom: 0,
              fontSize: 13,
              color: msg.ok ? "#15803d" : "#b91c1c",
              fontWeight: 600,
            }}
          >
            {msg.text}
          </p>
        ) : null}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <FaDatabase style={{ color: "#611f69" }} />
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>
          Saved notes {notes.length ? `(${notes.length})` : ""}
        </h2>
      </div>

      {loading ? (
        <p style={{ color: "#64748b" }}>Loading…</p>
      ) : notes.length === 0 ? (
        <p style={{ color: "#64748b" }}>No notes yet. Save one above.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {notes.map((n) => (
            <div
              key={n.id}
              style={{
                background: "#fff",
                borderRadius: 10,
                boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
                padding: "12px 14px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
              }}
            >
              <span style={{ fontSize: 14 }}>{n.note}</span>
              <span style={{ fontSize: 12, color: "#94a3b8", whiteSpace: "nowrap" }}>
                #{n.id} · {new Date(n.created_at).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
