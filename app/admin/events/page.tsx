"use client";
import React from "react";
import LayoutDashboard from "@/app/layout-dashboard";

interface EventItem {
  id: number;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string | null;
  is_all_day: number | boolean;
  location: string | null;
  status: string;
  created_at?: string;
  updated_at?: string;
}

const initialForm = {
  title: "",
  description: "",
  start_at: "",
  end_at: "",
  is_all_day: false,
  location: "",
  status: "published",
};

export default function AdminEventsPage() {
  const [form, setForm] = React.useState(initialForm);
  const [events, setEvents] = React.useState<EventItem[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<number | null>(null);
  const wsRef = React.useRef<WebSocket | null>(null);

  const fetchEvents = React.useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/events", { cache: "no-store" });
      const data = await res.json();
      if (data?.success) setEvents(data.events || []);
    } catch (e) {
      console.error("fetch events", e);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchEvents();
    if (typeof window === "undefined") return;
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${protocol}://${window.location.host}/api/ws`);
    wsRef.current = ws;
    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data.toString());
        if (msg?.type === "events_updated") {
          fetchEvents();
        }
      } catch (_) {
        // ignore malformed
      }
    };
    ws.onopen = () => ws.send(JSON.stringify({ type: "events_admin_init" }));
    return () => ws.close();
  }, [fetchEvents]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title || !form.start_at) return;
    try {
      setSaving(true);
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data?.success) {
        setForm(initialForm);
        fetchEvents();
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: "events_updated" }));
        }
      }
    } catch (err) {
      console.error("save event", err);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    const ok = window.confirm("Delete this event?");
    if (!ok) return;
    try {
      setDeletingId(id);
      const res = await fetch(`/api/events?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data?.success) {
        await fetchEvents();
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: "events_updated" }));
        }
      }
    } catch (err) {
      console.error("delete event", err);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <LayoutDashboard>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 360px) 1fr", gap: 16, width: "100%" }}>
        <div style={{ background: "#fff", borderRadius: 14, boxShadow: "0 10px 28px rgba(10,31,68,0.08)", padding: 18 }}>
          <h2 style={{ margin: 0, fontSize: "1.15rem", color: "#0f1d40", fontWeight: 700 }}>Add Event</h2>
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
            <input required placeholder="Title" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} style={inputStyle} />
            <textarea placeholder="Description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} style={{ ...inputStyle, minHeight: 80 }} />
            <label style={labelStyle}>Start At</label>
            <input required type="datetime-local" value={form.start_at} onChange={e => setForm({ ...form, start_at: e.target.value })} style={inputStyle} />
            <label style={labelStyle}>End At (optional)</label>
            <input type="datetime-local" value={form.end_at} onChange={e => setForm({ ...form, end_at: e.target.value })} style={inputStyle} />
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={!!form.is_all_day} onChange={e => setForm({ ...form, is_all_day: e.target.checked })} /> All day
            </label>
            <input placeholder="Location (optional)" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} style={inputStyle} />
            <button type="submit" disabled={saving} style={buttonStyle}>{saving ? "Saving..." : "Save Event"}</button>
          </form>
        </div>

        <div style={{ background: "#fff", borderRadius: 14, boxShadow: "0 10px 28px rgba(10,31,68,0.08)", padding: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ margin: 0, fontSize: "1.15rem", color: "#0f1d40", fontWeight: 700 }}>Upcoming Events</h2>
            {loading && <span style={{ fontSize: "0.9rem", color: "#6b7b9b" }}>Loading...</span>}
          </div>
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
            {events.length === 0 && <div style={{ color: "#6b7b9b" }}>No events yet.</div>}
            {events.map(ev => (
              <div key={ev.id} style={{ border: "1px solid #e6e8f2", borderRadius: 12, padding: 12, background: "#f9fbff", boxShadow: "0 6px 14px rgba(10,31,68,0.05)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                  <div style={{ fontWeight: 700, color: "#0f1d40" }}>{ev.title}</div>
                  <button
                    type="button"
                    onClick={() => handleDelete(ev.id)}
                    disabled={deletingId === ev.id}
                    title="Delete event"
                    style={{
                      border: "none",
                      background: "transparent",
                      color: "#c0392b",
                      cursor: deletingId === ev.id ? "not-allowed" : "pointer",
                      fontSize: "1rem",
                      padding: 4,
                    }}
                  >
                    {deletingId === ev.id ? "…" : "🗑"}
                  </button>
                </div>
                {ev.description && <div style={{ color: "#4a5775", fontSize: "0.95rem", marginTop: 4 }}>{ev.description}</div>}
                <div style={{ color: "#6b7b9b", fontSize: "0.9rem", marginTop: 6 }}>
                  {new Date(ev.start_at).toLocaleString()} {ev.end_at ? ` - ${new Date(ev.end_at).toLocaleString()}` : ""}
                </div>
                {ev.location && <div style={{ color: "#7b86a3", fontSize: "0.9rem", marginTop: 2 }}>Location: {ev.location}</div>}
                <div style={{ color: "#4a8b2c", fontSize: "0.85rem", marginTop: 4 }}>{ev.is_all_day ? "All day" : "Timed"} • {ev.status}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </LayoutDashboard>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #dfe3eb",
  fontSize: "0.95rem",
};

const labelStyle: React.CSSProperties = {
  fontSize: "0.9rem",
  fontWeight: 600,
  color: "#0f1d40",
};

const buttonStyle: React.CSSProperties = {
  marginTop: 4,
  padding: "12px 14px",
  borderRadius: 10,
  border: "none",
  background: "linear-gradient(120deg, #0052cc, #0b74ff)",
  color: "#fff",
  fontWeight: 700,
  cursor: "pointer",
};
