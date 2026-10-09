"use client";

import React from "react";
import Link from "next/link";
import OptionalAdminShell from "@/app/components/OptionalAdminShell";
import adminStyles from "../admin-page.module.css";
import styles from "../presence-idle/presence-idle.module.css";
import { toastError, toastSuccess } from "@/lib/app-toast";

type TabId = "words" | "websites" | "apps" | "uploads" | "settings";

type PolicySettings = {
  enabled: boolean;
  keywords: string[];
  websites: string[];
  apps: string[];
  uploads: string[];
  dedupMinutes: number;
};

function listToText(list: string[] | undefined) {
  return Array.isArray(list) ? list.join("\n") : "";
}

export default function GuardPolicyPage() {
  const [tab, setTab] = React.useState<TabId>("words");
  const [enabled, setEnabled] = React.useState(true);
  const [keywordsText, setKeywordsText] = React.useState("");
  const [websitesText, setWebsitesText] = React.useState("");
  const [appsText, setAppsText] = React.useState("");
  const [uploadsText, setUploadsText] = React.useState("");
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
        toastError(data.error || "Could not load Guard Policy settings");
        return;
      }
      const s = data.settings as PolicySettings;
      setEnabled(!!s.enabled);
      setKeywordsText(listToText(s.keywords));
      setWebsitesText(listToText(s.websites));
      setAppsText(listToText(s.apps));
      setUploadsText(listToText(s.uploads));
      setDedupMinutes(
        Math.min(24 * 60, Math.max(5, Number(s.dedupMinutes) || 60))
      );
    } catch {
      toastError("Network error loading Guard Policy");
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
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
        body: JSON.stringify({
          enabled,
          keywords: keywordsText,
          websites: websitesText,
          apps: appsText,
          uploads: uploadsText,
          dedupMinutes,
        }),
        cache: "no-store",
      });
      const data = await res.json();
      if (!data.success) {
        toastError(data.error || "Save failed");
        return;
      }
      const s = data.settings as PolicySettings;
      setEnabled(!!s.enabled);
      setKeywordsText(listToText(s.keywords));
      setWebsitesText(listToText(s.websites));
      setAppsText(listToText(s.apps));
      setUploadsText(listToText(s.uploads));
      setDedupMinutes(
        Math.min(24 * 60, Math.max(5, Number(s.dedupMinutes) || dedupMinutes))
      );
      toastSuccess(
        "Guard Policy saved. Matches create a silent ticket in the inbox."
      );
    } catch {
      toastError("Network error saving Guard Policy");
    } finally {
      setSaving(false);
    }
  }

  const disabled = loading || saving;

  const tabs: { id: TabId; label: string }[] = [
    { id: "words", label: "Words (OCR)" },
    { id: "websites", label: "Websites" },
    { id: "apps", label: "Apps" },
    { id: "uploads", label: "Uploads" },
    { id: "settings", label: "Settings" },
  ];

  return (
    <OptionalAdminShell>
      <div className={adminStyles.page}>
        <div className={`${adminStyles.card} ${styles.wrap}`}>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 12,
              marginBottom: 16,
            }}
          >
            <div>
              <h1 className={adminStyles.title}>Guard Policy</h1>
              <p className={adminStyles.subtitle}>
                Restricted words, websites, apps, and uploads. Matches open a
                high-priority HR ticket in the inbox with employee name and
                pseudonym — silently, no popup.
              </p>
            </div>
            <Link href="/admin/presence-idle" className={styles.navBackBtn}>
              ← Presence / Idle
            </Link>
          </div>

          <label className={styles.toggleRow} style={{ marginBottom: 14 }}>
            <input
              type="checkbox"
              checked={enabled}
              disabled={disabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            <span className={styles.toggleText}>
              <span className={styles.toggleTitle}>Enable Guard Policy alerts</span>
              <span className={styles.toggleHint}>
                Off = Image to text still works; no auto tickets from OCR or app
                activity.
              </span>
            </span>
          </label>

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

          {tab === "words" ? (
            <div className={styles.block}>
              <h3 className={styles.blockTitle}>Restricted words / phrases</h3>
              <p className={styles.tip} style={{ marginBottom: 8 }}>
                Checked from screenshot OCR (Image to text). One per line.
              </p>
              <textarea
                className={styles.scanOutput}
                rows={14}
                value={keywordsText}
                disabled={disabled}
                onChange={(e) => setKeywordsText(e.target.value)}
                placeholder={"porn\nfuck\nabusive phrase"}
              />
            </div>
          ) : null}

          {tab === "websites" ? (
            <div className={styles.block}>
              <h3 className={styles.blockTitle}>Restricted websites</h3>
              <p className={styles.tip} style={{ marginBottom: 8 }}>
                Domain or URL fragment. Matched in browser window titles and OCR
                text (e.g. pornhub.com). One per line.
              </p>
              <textarea
                className={styles.scanOutput}
                rows={14}
                value={websitesText}
                disabled={disabled}
                onChange={(e) => setWebsitesText(e.target.value)}
                placeholder={"pornhub.com\nxvideos.com"}
              />
            </div>
          ) : null}

          {tab === "apps" ? (
            <div className={styles.block}>
              <h3 className={styles.blockTitle}>Restricted apps</h3>
              <p className={styles.tip} style={{ marginBottom: 8 }}>
                App name or exe name from Guard app activity (e.g. utorrent.exe).
                One per line.
              </p>
              <textarea
                className={styles.scanOutput}
                rows={14}
                value={appsText}
                disabled={disabled}
                onChange={(e) => setAppsText(e.target.value)}
                placeholder={"utorrent.exe\ntelegram"}
              />
            </div>
          ) : null}

          {tab === "uploads" ? (
            <div className={styles.block}>
              <h3 className={styles.blockTitle}>Restricted uploads / file actions</h3>
              <p className={styles.tip} style={{ marginBottom: 8 }}>
                File extensions or dialog phrases seen in OCR / window titles
                (e.g. .torrent, Choose file). One per line.
              </p>
              <textarea
                className={styles.scanOutput}
                rows={14}
                value={uploadsText}
                disabled={disabled}
                onChange={(e) => setUploadsText(e.target.value)}
                placeholder={".torrent\nchoose file\nupload files"}
              />
            </div>
          ) : null}

          {tab === "settings" ? (
            <div className={styles.block}>
              <h3 className={styles.blockTitle}>Ticket rules</h3>
              <div className={styles.durationRow}>
                <div className={styles.field} style={{ minWidth: 200 }}>
                  <label htmlFor="gp-dedup">Minutes between tickets</label>
                  <input
                    id="gp-dedup"
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
              <p className={styles.tip} style={{ marginTop: 8 }}>
                Same employee will not get another open policy ticket inside this
                window. Tickets stay silent (inbox only, no toast popup).
              </p>
            </div>
          ) : null}

          <div className={styles.actions} style={{ marginTop: 14 }}>
            <button
              type="button"
              className={adminStyles.btnPrimary}
              disabled={disabled}
              onClick={() => void save()}
            >
              {saving ? "Saving…" : loading ? "Loading…" : "Save Guard Policy"}
            </button>
            <button
              type="button"
              className={adminStyles.btnSecondary}
              disabled={disabled}
              onClick={() => void load()}
            >
              Reload
            </button>
            <Link
              href="/admin/tickets"
              className={adminStyles.btnSecondary}
              style={{ display: "inline-flex", alignItems: "center" }}
            >
              Open ticket inbox
            </Link>
          </div>
        </div>
      </div>
    </OptionalAdminShell>
  );
}
