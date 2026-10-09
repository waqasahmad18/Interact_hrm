"use client";

import React from "react";
import adminStyles from "../admin-page.module.css";
import styles from "../presence-idle/presence-idle.module.css";
import { toastError, toastSuccess } from "@/lib/app-toast";

export default function GuardKeywordWatchSettings() {
  const [enabled, setEnabled] = React.useState(true);
  const [keywordsText, setKeywordsText] = React.useState("");
  const [dedupMinutes, setDedupMinutes] = React.useState(60);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/guard-keyword-watch", {
        cache: "no-store",
      });
      const data = await res.json();
      if (!data.success || !data.settings) {
        toastError(data.error || "Could not load keyword watch settings");
        return;
      }
      setEnabled(!!data.settings.enabled);
      setKeywordsText(
        Array.isArray(data.settings.keywords)
          ? data.settings.keywords.join("\n")
          : ""
      );
      setDedupMinutes(
        Math.min(24 * 60, Math.max(5, Number(data.settings.dedupMinutes) || 60))
      );
    } catch {
      toastError("Network error loading keyword watch");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/guard-keyword-watch", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        body: JSON.stringify({
          enabled,
          keywords: keywordsText,
          dedupMinutes,
        }),
        cache: "no-store",
      });
      const data = await res.json();
      if (!data.success) {
        toastError(data.error || "Save failed");
        return;
      }
      setEnabled(!!data.settings?.enabled);
      setKeywordsText(
        Array.isArray(data.settings?.keywords)
          ? data.settings.keywords.join("\n")
          : keywordsText
      );
      setDedupMinutes(
        Math.min(24 * 60, Math.max(5, Number(data.settings?.dedupMinutes) || dedupMinutes))
      );
      toastSuccess("Keyword watch saved. Matches open a ticket in the inbox.");
    } catch {
      toastError("Network error saving keyword watch");
    } finally {
      setSaving(false);
    }
  }

  const disabled = loading || saving;

  return (
    <div className={styles.section} style={{ marginBottom: 16 }}>
      <h2 className={styles.blockTitle} style={{ marginBottom: 10 }}>
        Keyword watch (Image to text)
      </h2>
      <p className={styles.tip} style={{ marginBottom: 10 }}>
        When a screenshot is uploaded, OCR runs in the background. If any word
        below appears, a high-priority HR ticket opens in the ticket inbox for
        CEO / managers (pseudonym included).
      </p>

      <label className={styles.toggleRow}>
        <input
          type="checkbox"
          checked={enabled}
          disabled={disabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        <span className={styles.toggleText}>
          <span className={styles.toggleTitle}>Enable keyword alerts</span>
          <span className={styles.toggleHint}>
            Off = OCR still works for Image to text, but no auto tickets.
          </span>
        </span>
      </label>

      <div className={styles.block}>
        <h3 className={styles.blockTitle}>Restricted words / phrases</h3>
        <p className={styles.tip} style={{ marginBottom: 8 }}>
          One per line. Matching is case-insensitive.
        </p>
        <textarea
          className={styles.scanOutput}
          rows={10}
          value={keywordsText}
          disabled={disabled}
          onChange={(e) => setKeywordsText(e.target.value)}
          placeholder={"porn\nfuck\nabusive phrase"}
        />
      </div>

      <div className={styles.block}>
        <h3 className={styles.blockTitle}>Do not repeat ticket</h3>
        <div className={styles.durationRow}>
          <div className={styles.field} style={{ minWidth: 180 }}>
            <label htmlFor="kw-dedup">Minutes between tickets</label>
            <input
              id="kw-dedup"
              type="number"
              min={5}
              max={1440}
              value={dedupMinutes}
              disabled={disabled}
              onChange={(e) =>
                setDedupMinutes(
                  Math.min(1440, Math.max(5, Number(e.target.value) || 5))
                )
              }
            />
          </div>
          <span className={styles.total}>{dedupMinutes} min</span>
        </div>
        <p className={styles.tip} style={{ marginTop: 6 }}>
          Same employee will not get another open keyword ticket inside this
          window.
        </p>
      </div>

      <div className={styles.actions} style={{ marginTop: 10 }}>
        <button
          type="button"
          className={adminStyles.btnPrimary}
          disabled={disabled}
          onClick={() => void save()}
        >
          {saving ? "Saving…" : loading ? "Loading…" : "Save keyword watch"}
        </button>
        <button
          type="button"
          className={adminStyles.btnSecondary}
          disabled={disabled}
          onClick={() => void load()}
        >
          Reload
        </button>
      </div>
    </div>
  );
}
