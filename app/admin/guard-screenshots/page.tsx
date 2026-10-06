"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FaEye, FaEyeSlash } from "react-icons/fa";
import OptionalAdminShell from "@/app/components/OptionalAdminShell";
import adminStyles from "../admin-page.module.css";
import styles from "../presence-idle/presence-idle.module.css";
import GuardScreenshotSettings from "./GuardScreenshotSettings";
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

const PAGE_SIZE = 24;

function todayYmd() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function GuardScreenshotsPage() {
  const router = useRouter();
  const [unlocked, setUnlocked] = React.useState(false);
  const [checking, setChecking] = React.useState(true);
  const [password, setPassword] = React.useState("");
  const [showPw, setShowPw] = React.useState(false);
  const [unlocking, setUnlocking] = React.useState(false);
  const [employees, setEmployees] = React.useState<EmpSummary[]>([]);
  const [selectedId, setSelectedId] = React.useState("");
  const [dates, setDates] = React.useState<string[]>([]);
  const [filterDate, setFilterDate] = React.useState(todayYmd());
  const [timeFrom, setTimeFrom] = React.useState("");
  const [timeTo, setTimeTo] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [files, setFiles] = React.useState<FileRow[]>([]);
  const [selected, setSelected] = React.useState<Record<string, boolean>>({});
  const [loadingList, setLoadingList] = React.useState(false);
  const [loadingFiles, setLoadingFiles] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [viewPath, setViewPath] = React.useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const selectedPaths = React.useMemo(
    () => Object.keys(selected).filter((k) => selected[k]),
    [selected]
  );

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

  const loadDates = React.useCallback(async (employeeId: string) => {
    if (!employeeId) {
      setDates([]);
      return;
    }
    try {
      const res = await fetch(
        `/api/admin/guard-screenshots?employeeId=${encodeURIComponent(employeeId)}&datesOnly=1`,
        { cache: "no-store" }
      );
      const data = await res.json();
      if (res.status === 401 || data.locked) {
        setUnlocked(false);
        return;
      }
      const list = (data.dates || []) as string[];
      setDates(list);
      if (list.length && !list.includes(filterDate)) {
        setFilterDate(list[0]);
      }
    } catch {
      setDates([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only reset date when employee changes
  }, []);

  React.useEffect(() => {
    if (unlocked && selectedId) {
      setPage(1);
      setSelected({});
      void loadDates(selectedId);
    } else {
      setDates([]);
      setFiles([]);
      setTotal(0);
    }
  }, [unlocked, selectedId, loadDates]);

  const loadFiles = React.useCallback(async () => {
    if (!selectedId) {
      setFiles([]);
      setTotal(0);
      return;
    }
    setLoadingFiles(true);
    try {
      const q = new URLSearchParams({
        employeeId: selectedId,
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (filterDate) q.set("date", filterDate);
      if (timeFrom) q.set("timeFrom", timeFrom);
      if (timeTo) q.set("timeTo", timeTo);
      const res = await fetch(`/api/admin/guard-screenshots?${q}`, {
        cache: "no-store",
      });
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
      setTotal(Number(data.total) || 0);
    } catch {
      toastError("Network error loading files");
    } finally {
      setLoadingFiles(false);
    }
  }, [selectedId, filterDate, timeFrom, timeTo, page]);

  React.useEffect(() => {
    if (unlocked && selectedId) void loadFiles();
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
    router.push("/admin/presence-idle");
  }

  function fileUrl(rel: string, download = false) {
    const q = new URLSearchParams({ path: rel });
    if (download) q.set("download", "1");
    return `/api/admin/guard-screenshots/file?${q.toString()}`;
  }

  function toggleSelect(path: string) {
    setSelected((prev) => ({ ...prev, [path]: !prev[path] }));
  }

  function toggleSelectAllOnPage() {
    const allOn = files.length > 0 && files.every((f) => selected[f.relativePath]);
    setSelected((prev) => {
      const next = { ...prev };
      for (const f of files) {
        next[f.relativePath] = !allOn;
      }
      return next;
    });
  }

  async function deletePaths(paths: string[]) {
    if (!paths.length) return;
    if (!window.confirm(`Delete ${paths.length} screenshot(s)? This cannot be undone.`)) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/guard-screenshots", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paths }),
      });
      const data = await res.json();
      if (!data.success) {
        toastError(data.error || "Delete failed");
        return;
      }
      toastSuccess(`Deleted ${data.deleted?.length ?? 0}`);
      setSelected({});
      setViewPath(null);
      await loadFiles();
      await loadEmployees();
      if (selectedId) await loadDates(selectedId);
    } catch {
      toastError("Network error");
    } finally {
      setBusy(false);
    }
  }

  async function deleteDay() {
    if (!selectedId || !filterDate) return;
    if (
      !window.confirm(
        `Delete ALL screenshots for this employee on ${filterDate}? This cannot be undone.`
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/guard-screenshots", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId: selectedId, date: filterDate }),
      });
      const data = await res.json();
      if (!data.success) {
        toastError(data.error || "Delete failed");
        return;
      }
      toastSuccess(`Deleted ${data.deletedCount ?? 0} file(s)`);
      setSelected({});
      setViewPath(null);
      await loadDates(selectedId);
      await loadFiles();
      await loadEmployees();
    } catch {
      toastError("Network error");
    } finally {
      setBusy(false);
    }
  }

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
              <h1 className={adminStyles.title}>Guard Screenshots</h1>
              <p className={adminStyles.subtitle}>
                Files stay on the HRM server. Filters load one day at a time for
                speed.
              </p>
            </div>
            <Link href="/admin/presence-idle" className={adminStyles.btnSecondary}>
              ← Presence / Idle
            </Link>
          </div>

          <GuardScreenshotSettings />

          {checking ? (
            <p className={styles.tip}>Checking access…</p>
          ) : !unlocked ? (
            <div className={styles.section}>
              <p className={styles.tip} style={{ marginBottom: 12 }}>
                Enter the gallery password to view, filter, and delete screenshots.
              </p>
              <div className={styles.durationRow}>
                <div className={styles.field} style={{ minWidth: 280 }}>
                  <label htmlFor="gallery-password-page">Gallery password</label>
                  <div className={styles.passwordWrap}>
                    <input
                      id="gallery-password-page"
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
            </div>
          ) : (
            <div className={styles.galleryWrap}>
              <div className={styles.durationRow} style={{ marginBottom: 10 }}>
                <button
                  type="button"
                  className={adminStyles.btnSecondary}
                  onClick={() => {
                    void loadEmployees();
                    if (selectedId) void loadFiles();
                  }}
                  disabled={loadingList || loadingFiles || busy}
                >
                  {loadingList || loadingFiles ? "Refreshing…" : "Refresh"}
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
                  No screenshots on server yet. Enable Auto screenshots in Capture
                  settings above, Save, assign employee on Presence / Idle — then
                  Refresh.
                </p>
              ) : (
                <>
                  <div className={styles.durationRow}>
                    <div className={styles.field} style={{ minWidth: 220, flex: 1 }}>
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
                            (id {e.employeeId}) — {e.count}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className={styles.field}>
                      <label htmlFor="ss-date">Date</label>
                      <input
                        id="ss-date"
                        type="date"
                        value={filterDate}
                        list="ss-date-list"
                        disabled={!selectedId}
                        onChange={(e) => {
                          setFilterDate(e.target.value);
                          setPage(1);
                          setSelected({});
                        }}
                      />
                      <datalist id="ss-date-list">
                        {dates.map((d) => (
                          <option key={d} value={d} />
                        ))}
                      </datalist>
                    </div>
                    <div className={styles.field}>
                      <label htmlFor="ss-from">Time from</label>
                      <input
                        id="ss-from"
                        type="time"
                        step={1}
                        value={timeFrom}
                        disabled={!selectedId}
                        onChange={(e) => {
                          setTimeFrom(e.target.value);
                          setPage(1);
                        }}
                      />
                    </div>
                    <div className={styles.field}>
                      <label htmlFor="ss-to">Time to</label>
                      <input
                        id="ss-to"
                        type="time"
                        step={1}
                        value={timeTo}
                        disabled={!selectedId}
                        onChange={(e) => {
                          setTimeTo(e.target.value);
                          setPage(1);
                        }}
                      />
                    </div>
                  </div>

                  {selectedId ? (
                    <>
                      <div className={styles.durationRow} style={{ marginTop: 4 }}>
                        <span className={styles.tip}>
                          {loadingFiles
                            ? "Loading…"
                            : `${total} file(s)${filterDate ? ` on ${filterDate}` : ""} · page ${page}/${totalPages}`}
                        </span>
                        <button
                          type="button"
                          className={styles.chip}
                          disabled={!files.length || busy}
                          onClick={toggleSelectAllOnPage}
                        >
                          Select page
                        </button>
                        <button
                          type="button"
                          className={adminStyles.btnSecondary}
                          disabled={!selectedPaths.length || busy}
                          onClick={() => void deletePaths(selectedPaths)}
                        >
                          Delete selected ({selectedPaths.length})
                        </button>
                        <button
                          type="button"
                          className={adminStyles.btnSecondary}
                          disabled={!filterDate || busy}
                          onClick={() => void deleteDay()}
                        >
                          Delete whole day
                        </button>
                      </div>

                      {!loadingFiles && files.length === 0 ? (
                        <p className={styles.tip}>
                          No screenshots for this filter. Pick another date or clear
                          time range.
                        </p>
                      ) : (
                        <div className={styles.thumbGrid}>
                          {files.map((f) => (
                            <div key={f.relativePath} className={styles.thumbCard}>
                              <label className={styles.thumbCheck}>
                                <input
                                  type="checkbox"
                                  checked={!!selected[f.relativePath]}
                                  onChange={() => toggleSelect(f.relativePath)}
                                />
                              </label>
                              <button
                                type="button"
                                className={styles.thumbOpen}
                                onClick={() => setViewPath(f.relativePath)}
                                title={f.fileName}
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={fileUrl(f.relativePath)}
                                  alt={f.fileName}
                                  className={styles.thumbImg}
                                  loading="lazy"
                                  decoding="async"
                                />
                                <span className={styles.thumbMeta}>
                                  {f.capturedAt.replace("T", " ")}
                                </span>
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {totalPages > 1 ? (
                        <div className={styles.durationRow} style={{ marginTop: 8 }}>
                          <button
                            type="button"
                            className={adminStyles.btnSecondary}
                            disabled={page <= 1 || loadingFiles}
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                          >
                            Previous
                          </button>
                          <button
                            type="button"
                            className={adminStyles.btnSecondary}
                            disabled={page >= totalPages || loadingFiles}
                            onClick={() =>
                              setPage((p) => Math.min(totalPages, p + 1))
                            }
                          >
                            Next
                          </button>
                        </div>
                      ) : null}
                    </>
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
                    disabled={busy}
                    onClick={() => void deletePaths([viewPath])}
                  >
                    Delete
                  </button>
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
      </div>
    </OptionalAdminShell>
  );
}
