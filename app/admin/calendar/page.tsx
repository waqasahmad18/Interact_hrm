"use client";

import React from "react";
import LayoutDashboard from "../../layout-dashboard";

interface CalendarDayOverride {
  date: string;
  status: "off" | "working";
  note?: string | null;
}

function formatMonthLabel(date: Date) {
  return date.toLocaleString("en-US", { month: "long", year: "numeric" });
}

function formatISO(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isWeekend(date: Date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function getMonthDays(date: Date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  const days: Date[] = [];
  for (let i = 1; i <= lastDay; i += 1) {
    days.push(new Date(year, month, i));
  }
  return days;
}

export default function AdminCalendarPage() {
  const [currentMonth, setCurrentMonth] = React.useState(new Date());
  const [overrides, setOverrides] = React.useState<Record<string, CalendarDayOverride>>({});
  const [loading, setLoading] = React.useState(false);
  const [savingDate, setSavingDate] = React.useState<string | null>(null);
  const [editingNote, setEditingNote] = React.useState<Record<string, boolean>>({});
  const [noteDrafts, setNoteDrafts] = React.useState<Record<string, string>>({});

  const fetchOverrides = React.useCallback(async () => {
    try {
      setLoading(true);
      const month = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, "0")}`;
      const res = await fetch(`/api/calendar?month=${month}`, { cache: "no-store" });
      const data = await res.json();
      if (data?.success) {
        const map: Record<string, CalendarDayOverride> = {};
        (data.days || []).forEach((d: CalendarDayOverride) => {
          map[d.date] = d;
        });
        setOverrides(map);
      }
    } catch (error) {
      console.error("calendar fetch", error);
    } finally {
      setLoading(false);
    }
  }, [currentMonth]);

  React.useEffect(() => {
    fetchOverrides();
  }, [fetchOverrides]);

  const monthDays = React.useMemo(() => getMonthDays(currentMonth), [currentMonth]);
  const firstDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay();

  function getStatus(date: Date) {
    const iso = formatISO(date);
    const override = overrides[iso];
    if (override) return override.status;
    return isWeekend(date) ? "off" : "working";
  }

  function getStatusLabel(date: Date) {
    return getStatus(date) === "off" ? "Off" : "Working";
  }

  async function updateDay(date: Date, status: "off" | "working", note?: string | null) {
    const iso = formatISO(date);
    try {
      setSavingDate(iso);
      const res = await fetch("/api/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: iso, status, note })
      });
      const data = await res.json();
      if (data?.success) {
        const nextNote = note ?? overrides[iso]?.note ?? null;
        setOverrides((prev) => ({
          ...prev,
          [iso]: { date: iso, status, note: nextNote }
        }));
      }
    } catch (error) {
      console.error("calendar update", error);
    } finally {
      setSavingDate(null);
    }
  }

  function handlePrevMonth() {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  }

  function handleNextMonth() {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  }

  return (
    <LayoutDashboard>
      <style>{`
        @import url("https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700&family=Fraunces:opsz,wght@9..144,600&display=swap");
        .calendar-shell {
          position: relative;
          overflow: hidden;
          padding: 16px;
          border-radius: 20px;
          background: radial-gradient(1200px 600px at 10% -10%, #ffe9d6 0%, rgba(255,233,214,0) 60%),
            radial-gradient(900px 500px at 90% -20%, #d7f3ff 0%, rgba(215,243,255,0) 60%),
            linear-gradient(135deg, #f7f4ff 0%, #eef7ff 45%, #fef3f2 100%);
          box-shadow: 0 24px 48px rgba(20, 30, 60, 0.12);
          font-family: "Space Grotesk", sans-serif;
        }
        .calendar-orb {
          position: absolute;
          border-radius: 999px;
          filter: blur(0px);
          opacity: 0.5;
          pointer-events: none;
        }
        .calendar-orb.one {
          width: 170px;
          height: 170px;
          background: linear-gradient(135deg, #ffd7a8, #ffb6c8);
          top: -60px;
          left: -40px;
        }
        .calendar-orb.two {
          width: 180px;
          height: 180px;
          background: linear-gradient(135deg, #b7e4ff, #d7d6ff);
          bottom: -80px;
          right: -60px;
        }
        .calendar-card {
          position: relative;
          background: rgba(255,255,255,0.92);
          border-radius: 18px;
          padding: 16px;
          box-shadow: 0 12px 24px rgba(20, 30, 60, 0.08);
          backdrop-filter: blur(6px);
        }
        .calendar-title {
          font-family: "Fraunces", serif;
          font-size: 1.4rem;
          font-weight: 600;
          color: #2d2a3e;
        }
        .calendar-subtitle {
          color: #5c5f73;
          margin-top: 4px;
          font-size: 0.85rem;
        }
        .calendar-controls {
          display: flex;
          align-items: center;
          gap: 8px;
          background: #fff;
          border-radius: 999px;
          padding: 4px 8px;
          box-shadow: inset 0 0 0 1px #e6e9f2;
        }
        .calendar-btn {
          padding: 6px 10px;
          border-radius: 999px;
          border: 0;
          font-weight: 700;
          font-size: 0.85rem;
          background: linear-gradient(135deg, #5d5fef, #8b5cf6);
          color: #fff;
          cursor: pointer;
          transition: transform 0.15s ease, box-shadow 0.15s ease;
          box-shadow: 0 6px 16px rgba(93, 95, 239, 0.28);
        }
        .calendar-btn.secondary {
          background: #f4f6ff;
          color: #2d2a3e;
          box-shadow: none;
          border: 1px solid #e1e6f5;
        }
        .calendar-btn:hover { transform: translateY(-1px); }
        .weekday-row {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 8px;
          margin: 8px 0 6px;
          font-weight: 700;
          color: #5d6075;
          text-transform: uppercase;
          font-size: 0.68rem;
          letter-spacing: 0.04em;
        }
        .days-grid {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 8px;
        }
        .day-card {
          border-radius: 14px;
          padding: 8px;
          min-height: 112px;
          border: 1px solid #e8ecf6;
          background: #f9fbff;
          box-shadow: 0 8px 16px rgba(26, 33, 68, 0.06);
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .day-card.off {
          background: #fff0f0;
          border-color: #ffd6d6;
        }
        .day-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .day-num {
          font-weight: 700;
          color: #2d2a3e;
          font-size: 0.9rem;
        }
        .day-pill {
          padding: 3px 8px;
          border-radius: 999px;
          font-size: 0.65rem;
          font-weight: 700;
        }
        .day-pill.off { background: #ffe3e3; color: #c0392b; }
        .day-pill.work { background: #e7f8ed; color: #1f7a3f; }
        .day-week {
          font-size: 0.75rem;
          color: #767b90;
        }
        .day-select, .day-note {
          border-radius: 10px;
          border: 1px solid #d7ddef;
          padding: 6px 8px;
          background: #fff;
          font-weight: 600;
          font-size: 0.8rem;
        }
        .day-note {
          font-weight: 500;
        }
        .saving-chip {
          font-size: 0.72rem;
          color: #6b7280;
        }
        @media (max-width: 1100px) {
          .days-grid, .weekday-row { grid-template-columns: repeat(4, 1fr); }
        }
        @media (max-width: 720px) {
          .days-grid, .weekday-row { grid-template-columns: repeat(2, 1fr); }
          .calendar-controls { flex-wrap: wrap; justify-content: center; }
        }
      `}</style>
      <div className="calendar-shell">
        <div className="calendar-orb one" />
        <div className="calendar-orb two" />

        <div className="calendar-card">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <div>
              <div className="calendar-title">Calendar Management</div>
              <div className="calendar-subtitle">Set company off days and working days with notes.</div>
            </div>
            <div className="calendar-controls">
              <button onClick={handlePrevMonth} className="calendar-btn secondary">Prev</button>
              <div style={{ fontWeight: 700, color: "#2d2a3e", minWidth: 180, textAlign: "center" }}>{formatMonthLabel(currentMonth)}</div>
              <button onClick={handleNextMonth} className="calendar-btn">Next</button>
            </div>
          </div>

          <div style={{ marginTop: 10, marginBottom: 6, fontWeight: 700, color: "#3b3f5c" }}>
            {formatMonthLabel(currentMonth)}
          </div>

          {loading ? (
            <div style={{ padding: 12, color: "#666" }}>Loading...</div>
          ) : (
            <div>
              <div className="weekday-row">
                {"Sun Mon Tue Wed Thu Fri Sat".split(" ").map((d) => (
                  <div key={d} style={{ textAlign: "center" }}>{d}</div>
                ))}
              </div>

              <div className="days-grid">
                {Array.from({ length: firstDay }).map((_, idx) => (
                  <div key={`empty-${idx}`} />
                ))}
                {monthDays.map((day) => {
                  const iso = formatISO(day);
                  const status = getStatus(day);
                  const statusLabel = getStatusLabel(day);
                  const isOff = status === "off";
                  const isSaving = savingDate === iso;
                  const noteValue = noteDrafts[iso] ?? overrides[iso]?.note ?? "";
                  const isEditing = editingNote[iso] === true;

                  return (
                    <div key={iso} className={`day-card ${isOff ? "off" : ""}`}>
                      <div className="day-top">
                        <div className="day-num">{day.getDate()}</div>
                        <span className={`day-pill ${isOff ? "off" : "work"}`}>{statusLabel}</span>
                      </div>

                      <div className="day-week">{day.toLocaleString("en-US", { weekday: "long" })}</div>

                      <select
                        value={status}
                        onChange={(e) => updateDay(day, e.target.value as "off" | "working", noteValue)}
                        disabled={isSaving}
                        className="day-select"
                      >
                        <option value="working">Working</option>
                        <option value="off">Off</option>
                      </select>

                      <input
                        type="text"
                        value={noteValue}
                        disabled={!isEditing}
                        onChange={(e) => {
                          const next = e.target.value;
                          setNoteDrafts((prev) => ({ ...prev, [iso]: next }));
                        }}
                        placeholder="Note (optional)"
                        className="day-note"
                      />

                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          className="calendar-btn secondary"
                          type="button"
                          onClick={() => {
                            setEditingNote((prev) => ({ ...prev, [iso]: true }));
                            if (noteDrafts[iso] === undefined) {
                              setNoteDrafts((prev) => ({ ...prev, [iso]: overrides[iso]?.note ?? "" }));
                            }
                          }}
                        >
                          Edit
                        </button>
                        <button
                          className="calendar-btn"
                          type="button"
                          disabled={!isEditing || isSaving}
                          onClick={() => {
                            setEditingNote((prev) => ({ ...prev, [iso]: false }));
                            updateDay(day, status, noteValue);
                          }}
                        >
                          Set
                        </button>
                      </div>

                      {isSaving && <div className="saving-chip">Saving...</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </LayoutDashboard>
  );
}
