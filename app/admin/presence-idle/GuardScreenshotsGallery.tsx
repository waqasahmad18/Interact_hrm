"use client";

import React from "react";
import { FaEye, FaEyeSlash } from "react-icons/fa";
import adminStyles from "../admin-page.module.css";
import styles from "./presence-idle.module.css";
import { toastError, toastSuccess } from "@/lib/app-toast";

type EmpSummary = {
  employeeId: string;
  count: number;
  latestAt: string | null;
  sampleName: string | null;
  samplePseudonym: string | null;
};

type FileRow = {
  relativePath: string;
  fileName: string;
  employeeId: string;
  dateFolder: string;
  size: number;
  mtimeMs: number;
  capturedAt: string;
};

export default function GuardScreenshotsGallery() {
  const [unlocked, setUnlocked] = React.useState(false);
  const [checking, setChecking] = React.useState(true);
  const [password, setPassword] = React.useState("");
  const [showPw, setShowPw] = React.useState(false);
  const [unlocking, setUnlocking] = React.useState(false);
  const [employees, setEmployees] = React.useState<EmpSummary[]>([]);
  const [selectedId, setSelectedId] = React.useState("");
  const [files, setFiles] = React.useState<FileRow[]>([]);
  const [loadingList, setLoadingList] = React.useState(false);
  const [loadingFiles, setLoadingFiles] = React.useState(false);
  const [viewPath, setViewPath] = React.useState<string | null>(null);

  const checkUnlock = React.useCallback(async () => {
    setChecking(true);
    try {
      const res = await fetch("/api/admin/guard-screenshots/unlock", {
        cache: "no-store",
      });
      const data = await res.json();
      setUnlocked(!!data.unlocked);
    } catch {
      setUnlocked(false);
    } finally {
      setChecking(false);
    }
  }, []);

  React.useEffect(() => {
    void checkUnlock();
  }, [checkUnlock]);

  const loadEmployees = React.useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await fetch("/api/admin/guard-screenshots", {
        cache: "no-store",
      });
      const data = await res.json();
      if (res.status === 401 || data.locked) {
        setUnlocked(false);
        return;
      }
      if (!data.success) {
        toastError(data.error || "Could not load screenshots");
        return;
      }
      setEmployees((data.employees || []) as EmpSummary[]);
    } catch {
      toastError("Network error loading screenshots");
    } finally {
      setLoadingList(false);
    }
  }, []);

  React.useEffect(() => {
    if (unlocked) void loadEmployees();
  }, [unlocked, loadEmployees]);

  const loadFiles = React.useCallback(async (employeeId: string) => {
    if (!employeeId) {
      setFiles([]);
      return;
    }
    setLoadingFiles(true);
    try {
      const res = await fetch(
        `/api/admin/guard-screenshots?employeeId=${encodeURIComponent(employeeId)}`,
        { cache: "no-store" }
      );
      const data = await res.json();
      if (res.status === 401 || data.locked) {
        setUnlocked(false);
        return;
      }
      if (!data.success) {
        toastError(data.error || "Could not load files");
        return;
      }
      setFiles((data.files || []) as FileRow[]);
    } catch {
      toastError("Network error loading files");
    } finally {
      setLoadingFiles(false);
    }
  }, []);

  React.useEffect(() => {
    if (unlocked && selectedId) void loadFiles(selectedId);
  }, [unlocked, selectedId, loadFiles]);

  async function unlock() {
    setUnlocking(true);
    try {
      const res = await fetch("/api/admin/guard-screenshots/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!data.success) {
        toastError(data.error || "Invalid password");
        return;
      }
      setUnlocked(true);
      setPassword("");
      toastSuccess("Gallery unlocked");
    } catch {
      toastError("Network error");
    } finally {
      setUnlocking(false);
    }
  }

  async function lock() {
    try {
      await fetch("/api/admin/guard-screenshots/unlock", { method: "DELETE" });
    } catch {
      /* ignore */
    }
    setUnlocked(false);
    setEmployees([]);
    setFiles([]);
    setSelectedId("");
    setViewPath(null);
  }

  function fileUrl(rel: string, download = false) {
    const q = new URLSearchParams({ path: rel });
    if (download) q.set("download", "1");
    return `/api/admin/guard-screenshots/file?${q.toString()}`;
  }

  return (
    <div className={styles.block}>
      <h3 className={styles.blockTitle}>Guard Screenshots</h3>
      <p className={styles.tip} style={{ marginBottom: 8 }}>
        Password-gated gallery of full-screen captures from Interact Guard (when
        tray Screenshots is On). Files stay on the HRM server — not public.
      </p>

      {checking ? (
        <p className={styles.tip}>Checking access…</p>
      ) : !unlocked ? (
        <div className={styles.durationRow}>
          <div className={styles.field} style={{ minWidth: 280 }}>
            <label htmlFor="gallery-password">Gallery password</label>
            <div className={styles.passwordWrap}>
              <input
                id="gallery-password"
                type={showPw ? "text" : "password"}
                autoComplete="off"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void unlock();
                }}
                className={styles.passwordInput}
              />
              <button
                type="button"
                className={styles.passwordToggle}
                onClick={() => setShowPw((v) => !v)}
                aria-label={showPw ? "Hide password" : "Show password"}
              >
                {showPw ? <FaEyeSlash /> : <FaEye />}
              </button>
            </div>
          </div>
          <button
            type="button"
            className={adminStyles.btnPrimary}
            disabled={unlocking || !password}
            onClick={() => void unlock()}
          >
            {unlocking ? "Unlocking…" : "Unlock gallery"}
          </button>
        </div>
      ) : (
        <div className={styles.galleryWrap}>
          <div className={styles.durationRow} style={{ marginBottom: 10 }}>
            <button
              type="button"
              className={adminStyles.btnSecondary}
              onClick={() => void loadEmployees()}
              disabled={loadingList}
            >
              {loadingList ? "Refreshing…" : "Refresh list"}
            </button>
            <button
              type="button"
              className={adminStyles.btnSecondary}
              onClick={() => void lock()}
            >
              Lock gallery
            </button>
          </div>

          {employees.length === 0 ? (
            <p className={styles.tip}>
              No screenshots uploaded yet. Enable tray Screenshots on an agent.
            </p>
          ) : (
            <>
              <div className={styles.field} style={{ maxWidth: 420 }}>
                <label htmlFor="ss-emp">Employee</label>
                <select
                  id="ss-emp"
                  value={selectedId}
                  onChange={(e) => setSelectedId(e.target.value)}
                >
                  <option value="">Select employee…</option>
                  {employees.map((e) => (
                    <option key={e.employeeId} value={e.employeeId}>
                      {[e.sampleName, e.samplePseudonym]
                        .filter(Boolean)
                        .join(" / ") || e.employeeId}{" "}
                      (id {e.employeeId}) — {e.count} file
                      {e.count === 1 ? "" : "s"}
                    </option>
                  ))}
                </select>
              </div>

              {selectedId ? (
                loadingFiles ? (
                  <p className={styles.tip}>Loading…</p>
                ) : files.length === 0 ? (
                  <p className={styles.tip}>No files for this employee.</p>
                ) : (
                  <div className={styles.thumbGrid}>
                    {files.map((f) => (
                      <button
                        key={f.relativePath}
                        type="button"
                        className={styles.thumbCard}
                        onClick={() => setViewPath(f.relativePath)}
                        title={f.fileName}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={fileUrl(f.relativePath)}
                          alt={f.fileName}
                          className={styles.thumbImg}
                        />
                        <span className={styles.thumbMeta}>{f.capturedAt}</span>
                      </button>
                    ))}
                  </div>
                )
              ) : null}
            </>
          )}
        </div>
      )}

      {viewPath ? (
        <div
          className={styles.modalBackdrop}
          role="dialog"
          aria-modal="true"
          onClick={() => setViewPath(null)}
        >
          <div
            className={styles.modalPanel}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalActions}>
              <a
                className={adminStyles.btnPrimary}
                href={fileUrl(viewPath, true)}
                download
              >
                Download
              </a>
              <button
                type="button"
                className={adminStyles.btnSecondary}
                onClick={() => setViewPath(null)}
              >
                Close
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={fileUrl(viewPath)}
              alt="Screenshot"
              className={styles.modalImg}
            />
            <p className={styles.tip}>{viewPath}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
