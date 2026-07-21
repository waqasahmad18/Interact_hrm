"use client";

import React from "react";

type TestDocument = {
  id: number;
  employee_id: string;
  title: string;
  notes: string | null;
  created_at: string;
};

export default function TestDocumentsPage() {
  const [employeeId, setEmployeeId] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [documents, setDocuments] = React.useState<TestDocument[]>([]);

  const loadDocuments = React.useCallback(async (id: string) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/employee-test-documents?employeeId=${encodeURIComponent(id)}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!data?.success) {
        throw new Error(data?.error || "Failed to load test documents");
      }
      setDocuments(Array.isArray(data.documents) ? data.documents : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load test documents");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    const id =
      localStorage.getItem("employeeId") ||
      localStorage.getItem("loginId") ||
      sessionStorage.getItem("employeeId") ||
      "";
    setEmployeeId(id);
    if (id) void loadDocuments(id);
  }, [loadDocuments]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    const cleanTitle = title.trim();
    if (!employeeId) {
      setError("Employee ID not found. Please login again.");
      return;
    }
    if (!cleanTitle) {
      setError("Title is required.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/employee-test-documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee_id: employeeId,
          title: cleanTitle,
          notes: notes.trim(),
        }),
      });
      const data = await res.json();
      if (!data?.success) {
        throw new Error(data?.error || "Could not save test document");
      }
      setTitle("");
      setNotes("");
      setSuccess("Test document saved.");
      const created = data.document as TestDocument | null;
      if (created) setDocuments((prev) => [created, ...prev]);
      else void loadDocuments(employeeId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save test document");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: 920, margin: "0 auto", display: "grid", gap: 16 }}>
      <section style={{ background: "#fff", border: "1px solid #e6e9ef", borderRadius: 12, padding: 16 }}>
        <h1 style={{ margin: "0 0 8px", fontSize: 24 }}>Test Documents</h1>
        <p style={{ margin: 0, color: "#64748b" }}>
          Demo page for auto-deploy verification. Save any test document row in database.
        </p>
      </section>

      <section style={{ background: "#fff", border: "1px solid #e6e9ef", borderRadius: 12, padding: 16 }}>
        <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
          <div>
            <label htmlFor="test-doc-title" style={{ display: "block", marginBottom: 6, fontWeight: 600 }}>
              Title
            </label>
            <input
              id="test-doc-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Deploy test document"
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #cbd5e1" }}
            />
          </div>
          <div>
            <label htmlFor="test-doc-notes" style={{ display: "block", marginBottom: 6, fontWeight: 600 }}>
              Notes (optional)
            </label>
            <textarea
              id="test-doc-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Any text for testing."
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #cbd5e1" }}
            />
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button
              type="submit"
              disabled={saving}
              style={{
                border: 0,
                borderRadius: 8,
                padding: "10px 14px",
                background: "#2563eb",
                color: "#fff",
                fontWeight: 600,
                cursor: saving ? "not-allowed" : "pointer",
              }}
            >
              {saving ? "Saving..." : "Save Test Document"}
            </button>
            <button
              type="button"
              onClick={() => employeeId && void loadDocuments(employeeId)}
              disabled={loading}
              style={{
                border: "1px solid #cbd5e1",
                borderRadius: 8,
                padding: "10px 14px",
                background: "#fff",
                color: "#0f172a",
                fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
          {error ? <p style={{ margin: 0, color: "#dc2626" }}>{error}</p> : null}
          {success ? <p style={{ margin: 0, color: "#059669" }}>{success}</p> : null}
        </form>
      </section>

      <section style={{ background: "#fff", border: "1px solid #e6e9ef", borderRadius: 12, padding: 16 }}>
        <h2 style={{ marginTop: 0, marginBottom: 12, fontSize: 18 }}>Saved Rows</h2>
        {!documents.length ? (
          <p style={{ margin: 0, color: "#64748b" }}>No test documents saved yet.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #e2e8f0", padding: "8px 6px" }}>ID</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #e2e8f0", padding: "8px 6px" }}>Title</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #e2e8f0", padding: "8px 6px" }}>Notes</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #e2e8f0", padding: "8px 6px" }}>Created</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr key={doc.id}>
                    <td style={{ borderBottom: "1px solid #f1f5f9", padding: "8px 6px" }}>{doc.id}</td>
                    <td style={{ borderBottom: "1px solid #f1f5f9", padding: "8px 6px" }}>{doc.title}</td>
                    <td style={{ borderBottom: "1px solid #f1f5f9", padding: "8px 6px" }}>{doc.notes || "-"}</td>
                    <td style={{ borderBottom: "1px solid #f1f5f9", padding: "8px 6px" }}>
                      {new Date(doc.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
