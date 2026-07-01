"use client";

import React, { useCallback, useEffect, useState } from "react";
import { ATTENDANCE_DATA_CHANGED } from "@/lib/ui-sync/breakPrayerDataRefresh";
import { getDateStringInTimeZone, SERVER_TIMEZONE } from "@/lib/timezone";
import {
  countWords,
  TARDY_NOTE_OPTIONS,
  TARDY_NOTE_OTHER_CODE,
  TARDY_NOTE_OTHER_MAX_WORDS,
  type TardyNoteOption,
} from "@/lib/tardy-note-options";
import slackStyles from "./tardy-note-slack.module.css";

export function TardyNoteWidget({
  employeeId,
  variant = "default",
}: {
  employeeId: string;
  variant?: "default" | "slack";
}) {
  const isSlack = variant === "slack";
  const [visible, setVisible] = useState(false);
  const [selectedCode, setSelectedCode] = useState("");
  const [otherText, setOtherText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [attendanceDate, setAttendanceDate] = useState(() =>
    getDateStringInTimeZone(new Date(), SERVER_TIMEZONE)
  );

  const otherWordCount = countWords(otherText);
  const isOther = selectedCode === TARDY_NOTE_OTHER_CODE;
  const canSubmit =
    Boolean(selectedCode) &&
    !submitting &&
    (!isOther || (otherWordCount >= 1 && otherWordCount <= TARDY_NOTE_OTHER_MAX_WORDS));

  const refresh = useCallback(async () => {
    const id = String(employeeId || "").trim();
    if (!id) {
      setVisible(false);
      return;
    }
    const today = getDateStringInTimeZone(new Date(), SERVER_TIMEZONE);
    try {
      const res = await fetch(
        `/api/tardy-notes?employeeId=${encodeURIComponent(id)}&date=${encodeURIComponent(today)}`,
        { cache: "no-store" }
      );
      const data = await res.json();
      if (!data.success) {
        setVisible(false);
        return;
      }
      setVisible(Boolean(data.success && data.isLate && data.isClockedIn && data.canAddNote));
      setAttendanceDate(data.attendanceDate || today);
      if (!data.canAddNote) {
        setSelectedCode("");
        setOtherText("");
      }
    } catch {
      setVisible(false);
    }
  }, [employeeId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onAttendanceChanged = () => {
      void refresh();
    };
    window.addEventListener(ATTENDANCE_DATA_CHANGED, onAttendanceChanged);
    return () => window.removeEventListener(ATTENDANCE_DATA_CHANGED, onAttendanceChanged);
  }, [refresh]);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setMessage("");
    try {
      const res = await fetch("/api/tardy-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId,
          attendanceDate,
          noteCode: selectedCode,
          noteText: isOther ? otherText : undefined,
        }),
      });
      const data = await res.json();
      if (data.success && data.note) {
        setVisible(false);
        setSelectedCode("");
        setOtherText("");
        return;
      }
      setMessage(data.error || "Could not submit");
    } catch {
      setMessage("Could not submit");
    } finally {
      setSubmitting(false);
    }
  };

  if (!visible) return null;

  if (isSlack) {
    return (
      <div className={slackStyles.wrap}>
        <div className={slackStyles.panel}>
          <div className={slackStyles.formRow}>
            <span className={slackStyles.badge}>Late today</span>
            <select
              className={slackStyles.select}
              value={selectedCode}
              onChange={(e) => {
                const next = e.target.value;
                setSelectedCode(next);
                if (next !== TARDY_NOTE_OTHER_CODE) setOtherText("");
                setMessage("");
              }}
              aria-label="Tardy justification"
            >
              <option value="">Add a note…</option>
              {TARDY_NOTE_OPTIONS.map((opt: TardyNoteOption) => (
                <option key={opt.code} value={opt.code}>
                  {opt.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={slackStyles.submit}
              onClick={handleSubmit}
              disabled={!canSubmit}
            >
              {submitting ? "…" : "Submit"}
            </button>
          </div>
          {isOther ? (
            <div>
              <textarea
                className={slackStyles.textarea}
                value={otherText}
                onChange={(e) => {
                  setOtherText(e.target.value);
                  setMessage("");
                }}
                placeholder="Write your reason here…"
                rows={3}
                maxLength={2500}
                aria-label="Custom tardy reason"
              />
              <div
                className={`${slackStyles.wordCount} ${otherWordCount > TARDY_NOTE_OTHER_MAX_WORDS ? slackStyles.wordCountError : ""}`}
              >
                {otherWordCount}/{TARDY_NOTE_OTHER_MAX_WORDS} words
              </div>
            </div>
          ) : null}
          {message ? <div className={slackStyles.error}>{message}</div> : null}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        marginTop: 10,
        display: "flex",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          maxWidth: 520,
          width: "100%",
          padding: "8px 10px",
          borderRadius: 12,
          background: "rgba(255,255,255,0.92)",
          border: "1px solid rgba(255,255,255,0.35)",
          boxShadow: "0 4px 14px rgba(0,0,0,0.08)",
        }}
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          <span
            style={{
              fontSize: "0.72rem",
              fontWeight: 700,
              letterSpacing: "0.02em",
              textTransform: "uppercase",
              color: "#c53030",
              whiteSpace: "nowrap",
            }}
          >
            Late today
          </span>

          <select
            value={selectedCode}
            onChange={(e) => {
              const next = e.target.value;
              setSelectedCode(next);
              if (next !== TARDY_NOTE_OTHER_CODE) setOtherText("");
              setMessage("");
            }}
            aria-label="Tardy justification"
            style={{
              flex: "1 1 180px",
              minWidth: 0,
              maxWidth: 280,
              height: 32,
              padding: "0 28px 0 10px",
              borderRadius: 8,
              border: "1px solid #d8e2ec",
              background: "#fff",
              fontSize: "0.78rem",
              color: "#2d3748",
              outline: "none",
              cursor: "pointer",
            }}
          >
            <option value="">Add a note…</option>
            {TARDY_NOTE_OPTIONS.map((opt: TardyNoteOption) => (
              <option key={opt.code} value={opt.code}>
                {opt.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            style={{
              height: 32,
              padding: "0 12px",
              borderRadius: 8,
              border: "none",
              background: canSubmit ? "linear-gradient(120deg, #4c8dff, #0052CC)" : "#cbd5e0",
              color: "#fff",
              fontSize: "0.76rem",
              fontWeight: 700,
              cursor: canSubmit ? "pointer" : "not-allowed",
              whiteSpace: "nowrap",
              boxShadow: canSubmit ? "0 2px 6px rgba(0,82,204,0.25)" : "none",
            }}
          >
            {submitting ? "…" : "Submit"}
          </button>
        </div>

        {isOther ? (
          <div>
            <textarea
              value={otherText}
              onChange={(e) => {
                setOtherText(e.target.value);
                setMessage("");
              }}
              placeholder="Write your reason here…"
              rows={3}
              maxLength={2500}
              aria-label="Custom tardy reason"
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid #d8e2ec",
                background: "#fff",
                fontSize: "0.78rem",
                color: "#2d3748",
                resize: "vertical",
                minHeight: 64,
                outline: "none",
                fontFamily: "inherit",
              }}
            />
            <div
              style={{
                marginTop: 4,
                fontSize: "0.68rem",
                color: otherWordCount > TARDY_NOTE_OTHER_MAX_WORDS ? "#c53030" : "#718096",
                textAlign: "right",
              }}
            >
              {otherWordCount}/{TARDY_NOTE_OTHER_MAX_WORDS} words
            </div>
          </div>
        ) : null}

        {message ? (
          <div style={{ fontSize: "0.72rem", color: "#c53030", textAlign: "center" }}>{message}</div>
        ) : null}
      </div>
    </div>
  );
}
