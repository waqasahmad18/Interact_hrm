"use client";

import React from "react";

type SampleRow = {
  id: number;
  login_id: string | null;
  message: string;
  created_at: string;
};

export default function SampleCheckPage() {
  const [message, setMessage] = React.useState("");
  const [rows, setRows] = React.useState<SampleRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const loginId =
    typeof window !== "undefined" ? localStorage.getItem("loginId") : null;

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/sample-check", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to load");
      setRows(data.rows as SampleRow[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const text = message.trim();
    if (!text) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/sample-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, loginId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to save");
      setMessage("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4, color: "#611f69" }}>
        Sample Check
      </h1>
      <p style={{ color: "#6b7280", marginBottom: 20 }}>
        End-to-end check: this saves to the <code>hrm_sample_check</code> table via
        the API and reads it back. If your message appears in the list below,
        deploy + migration + DB round-trip all work.
      </p>

      <form onSubmit={handleSave} style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type a test message…"
          style={{
            flex: 1,
            padding: "10px 12px",
            border: "1px solid #d1d5db",
            borderRadius: 8,
            fontSize: 14,
          }}
        />
        <button
          type="submit"
          disabled={saving || !message.trim()}
          style={{
            padding: "10px 18px",
            background: saving ? "#9d7aa5" : "#611f69",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            fontWeight: 600,
            cursor: saving ? "default" : "pointer",
          }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </form>

      {error && (
        <div style={{ color: "#dc2626", marginBottom: 16 }}>Error: {error}</div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <strong>Recent entries</strong>
        <button
          onClick={() => void load()}
          style={{
            background: "none",
            border: "none",
            color: "#611f69",
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <div style={{ color: "#6b7280" }}>Loading…</div>
      ) : rows.length === 0 ? (
        <div style={{ color: "#6b7280" }}>No entries yet.</div>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {rows.map((r) => (
            <li
              key={r.id}
              style={{
                padding: "10px 12px",
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                marginBottom: 8,
              }}
            >
              <div style={{ fontWeight: 600 }}>{r.message}</div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>
                #{r.id} · {r.login_id ?? "—"} · {new Date(r.created_at).toLocaleString()}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
