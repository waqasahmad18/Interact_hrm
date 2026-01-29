"use client";
import React from "react";
import './ClockBreakPrayerFade.css';
import { PrayerButton } from "./PrayerButton";

const CLOCKIN_KEY = "clockinInfo";

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600).toString().padStart(2, "0");
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${h}h ${m}m ${s}s`;
}

// Compact widget combining Clock In/Out, Break, and Prayer controls
export function ClockBreakPrayerWidget({ employeeId, employeeName }: { employeeId: string; employeeName: string }) {
  const [isPrayerOn, setIsPrayerOn] = React.useState(false);
  const [prayerStart, setPrayerStart] = React.useState<Date | null>(null);
  const [isOnBreak, setIsOnBreak] = React.useState(false);
  const [breakStart, setBreakStart] = React.useState<Date | null>(null);
  const breakTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const [currentBreakDuration, setCurrentBreakDuration] = React.useState(0);
  const [isClockedIn, setIsClockedIn] = React.useState(false);
  const [timer, setTimer] = React.useState(0);
  const [loadingAttendance, setLoadingAttendance] = React.useState(true);
  const [intervalId, setIntervalId] = React.useState<NodeJS.Timeout | null>(null);
  // Fade-in animation state
  const [fadeIn, setFadeIn] = React.useState(false);

  // Fade-in on mount
  React.useEffect(() => {
    setFadeIn(true);
    // Try to restore from localStorage instantly for fast UI
    const cached = localStorage.getItem(CLOCKIN_KEY);
    if (cached) {
      try {
        const { employeeId: cachedId, clockInTime } = JSON.parse(cached);
        if (cachedId === employeeId && clockInTime) {
          setIsClockedIn(true);
          const clockInDate = new Date(clockInTime);
          const now = new Date();
          const elapsedSeconds = Math.floor((now.getTime() - clockInDate.getTime()) / 1000);
          setTimer(elapsedSeconds);
          const id = setInterval(() => {
            const newElapsed = Math.floor((Date.now() - clockInDate.getTime()) / 1000);
            setTimer(newElapsed);
          }, 1000);
          setIntervalId(id as NodeJS.Timeout);
        }
      } catch {}
    }
    // Always fetch fresh from backend in background
    if (!employeeId) return;
    const fetchClockInStatus = async () => {
      try {
        const today = new Date().toISOString().slice(0, 10);
        const res = await fetch(`/api/attendance?employeeId=${employeeId}&date=${today}`);
        const data = await res.json();
        if (data.success && Array.isArray(data.attendance) && data.attendance.length > 0) {
          // Find today's attendance with clock_in and no clock_out
          const todayAttendance = data.attendance.find((a: any) => a.clock_in && !a.clock_out);
          if (todayAttendance && todayAttendance.clock_in) {
            // DB says running, always set as clocked in
            setIsClockedIn(true);
            const clockInTime = new Date(todayAttendance.clock_in);
            const now = new Date();
            const elapsedSeconds = Math.floor((now.getTime() - clockInTime.getTime()) / 1000);
            setTimer(elapsedSeconds);
            const id = setInterval(() => {
              const newElapsed = Math.floor((Date.now() - clockInTime.getTime()) / 1000);
              setTimer(newElapsed);
            }, 1000);
            setIntervalId(id as NodeJS.Timeout);
            // Optionally update localStorage for UI speedup
            localStorage.setItem(CLOCKIN_KEY, JSON.stringify({ employeeId, clockInTime: clockInTime.toISOString() }));
            setLoadingAttendance(false);
            return;
          } else {
            // Only set as clocked out if all DB records have clock_out
            setIsClockedIn(false);
            setTimer(0);
            localStorage.removeItem(CLOCKIN_KEY);
            setLoadingAttendance(false);
            return;
          }
        }
        // No attendance records, treat as not clocked in
        setIsClockedIn(false);
        setTimer(0);
        localStorage.removeItem(CLOCKIN_KEY);
        setLoadingAttendance(false);
      } catch (err) {
        setIsClockedIn(false);
        setTimer(0);
        localStorage.removeItem(CLOCKIN_KEY);
      }
      setLoadingAttendance(false);
    };
    fetchClockInStatus();
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [employeeId]);

  // Restore ongoing break status
  React.useEffect(() => {
    const fetchOngoingBreakStatus = async () => {
      if (!employeeId) return;
      try {
        const today = new Date().toISOString().slice(0, 10);
        const response = await fetch(`/api/breaks?employeeId=${employeeId}&date=${today}`);
        const data = await response.json();
        if (data.success && Array.isArray(data.breaks)) {
          const ongoingBreak = data.breaks.find((b: any) => !b.break_end);
          if (ongoingBreak && ongoingBreak.break_start) {
            setIsOnBreak(true);
            const start = new Date(ongoingBreak.break_start);
            setBreakStart(start);
            const startTimer = () => {
              const elapsed = Math.floor((Date.now() - start.getTime()) / 1000);
              setCurrentBreakDuration(elapsed);
            };
            startTimer();
            if (breakTimerRef.current) clearInterval(breakTimerRef.current);
            breakTimerRef.current = setInterval(startTimer, 1000);
          } else {
            setIsOnBreak(false);
            setBreakStart(null);
            setCurrentBreakDuration(0);
            if (breakTimerRef.current) clearInterval(breakTimerRef.current);
          }
        }
      } catch (error) {
        setIsOnBreak(false);
        setBreakStart(null);
        setCurrentBreakDuration(0);
        if (breakTimerRef.current) clearInterval(breakTimerRef.current);
      }
    };
    fetchOngoingBreakStatus();
  }, [employeeId]);

  const handleClockIn = async () => {
    if (!employeeId || !employeeName) {
      alert("Missing employee info");
      return;
    }
    const now = new Date();
    try {
      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee_id: employeeId,
          employee_name: employeeName,
          date: now.toISOString().slice(0, 10),
          clock_in: now.toISOString(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setIsClockedIn(true);
        setTimer(0);
        if (intervalId) clearInterval(intervalId);
        const id = setInterval(() => setTimer((prev) => prev + 1), 1000);
        setIntervalId(id as NodeJS.Timeout);
        localStorage.setItem(CLOCKIN_KEY, JSON.stringify({ employeeId, clockInTime: now.toISOString() }));
      } else {
        alert(data.error || "Failed to clock in. Please try again.");
      }
    } catch (error) {
      alert("Error while clocking in. Please try again.");
    }
  };

  const handleClockOut = async () => {
    if (!employeeId) return;
    const now = new Date();
    try {
      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee_id: employeeId,
          date: now.toISOString().slice(0, 10),
          clock_out: now.toISOString(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setIsClockedIn(false);
        setTimer(0);
        if (intervalId) clearInterval(intervalId);
        localStorage.removeItem(CLOCKIN_KEY);
      } else {
        alert(data.error || "Failed to clock out. Please try again.");
      }
    } catch (error) {
      alert("Error while clocking out. Please try again.");
    }
  };

  const handleBreakStart = async () => {
    if (!employeeId || !isClockedIn) {
      alert("Clock in first");
      return;
    }
    const startTime = new Date();
    try {
      const res = await fetch("/api/breaks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee_id: employeeId,
          employee_name: employeeName,
          date: startTime.toISOString(),
          break_start: startTime.toISOString(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setIsOnBreak(true);
        setBreakStart(startTime);
        setCurrentBreakDuration(0);
        if (breakTimerRef.current) clearInterval(breakTimerRef.current);
        breakTimerRef.current = setInterval(() => {
          const now = new Date();
          setCurrentBreakDuration(Math.floor((now.getTime() - startTime.getTime()) / 1000));
        }, 1000);
      } else {
        alert(data.error || "Failed to start break.");
      }
    } catch (error) {
      alert("Error starting break.");
    }
  };

  const handleBreakEnd = async () => {
    if (!employeeId || !breakStart) {
      alert("No ongoing break found.");
      return;
    }
    const endTime = new Date();
    try {
      const res = await fetch("/api/breaks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee_id: employeeId,
          date: endTime.toISOString(),
          break_end: endTime.toISOString(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setIsOnBreak(false);
        setBreakStart(null);
        setCurrentBreakDuration(0);
        if (breakTimerRef.current) clearInterval(breakTimerRef.current);
      } else {
        alert(data.error || "Failed to end break.");
      }
    } catch (error) {
      alert("Error ending break.");
    }
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600).toString().padStart(2, "0");
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${h}h ${m}m ${s}s`;
  };

  return (
    <div className={`cbp-fade-in${fadeIn ? ' cbp-fade-in-active' : ''}`} style={{ display: "flex", flexDirection: "row", justifyContent: "center", gap: 24, marginBottom: 32 }}>
      {/* Clock In Widget */}
      <div style={{ background: "#f7fafc", borderRadius: 16, boxShadow: "0 2px 8px #e2e8f0", padding: 24, minWidth: 180, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ fontWeight: 600, fontSize: "1.1rem", color: "#27ae60", marginBottom: 10 }}>Clock In</div>
        {!loadingAttendance && (
          <>
            <button
              onClick={isClockedIn ? handleClockOut : handleClockIn}
              style={{
                background: isClockedIn ? "#e74c3c" : "#27ae60",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "8px 18px",
                fontSize: "1rem",
                fontWeight: 600,
                cursor: "pointer",
                boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                transition: "background 0.2s"
              }}
            >
              {isClockedIn ? "Clock Out" : "Clock In"}
            </button>
            {isClockedIn && (
              <div style={{ marginTop: 12, background: "#fff", borderRadius: 12, boxShadow: "0 2px 8px rgba(52,120,246,0.10)", padding: "8px 12px", minWidth: 120 }}>
                <div style={{ fontSize: "0.95rem", fontWeight: 600, color: "#3478f6", marginBottom: 6 }}>Working</div>
                <div style={{ fontSize: "1rem", fontWeight: 500, color: "#2d3436" }}>{formatTime(timer)}</div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Break Widget */}
      {isClockedIn && (
        <div style={{ background: "#f7fafc", borderRadius: 16, boxShadow: "0 2px 8px #e2e8f0", padding: 24, minWidth: 180, display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ fontWeight: 600, fontSize: "1.1rem", color: "#e67e22", marginBottom: 10 }}>Break</div>
          <button
            onClick={isOnBreak ? handleBreakEnd : handleBreakStart}
            disabled={isPrayerOn}
            style={{
              background: isOnBreak ? "#e74c3c" : "#e67e22",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "8px 18px",
              fontSize: "1rem",
              fontWeight: 600,
              cursor: isPrayerOn ? "not-allowed" : "pointer",
              opacity: isPrayerOn ? 0.6 : 1,
              boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
              transition: "background 0.2s"
            }}
          >
            {isOnBreak ? "End Break" : "Start Break"}
          </button>
          {isOnBreak && (
            <div style={{ marginTop: 12, background: "#fff", borderRadius: 12, boxShadow: "0 2px 8px rgba(230,126,34,0.10)", padding: "8px 12px", minWidth: 120 }}>
              <div style={{ fontSize: "0.95rem", fontWeight: 600, color: "#e67e22", marginBottom: 6 }}>Break Time</div>
              <div style={{ fontSize: "1rem", fontWeight: 500, color: "#2d3436" }}>{formatTime(currentBreakDuration)}</div>
            </div>
          )}
          <BreakSummary employeeId={employeeId} />
        </div>
      )}

      {/* Prayer Break Widget */}
      {isClockedIn && (
        <PrayerButton
          employeeId={employeeId}
          employeeName={employeeName}
          isPrayerOn={isPrayerOn}
          setIsPrayerOn={setIsPrayerOn}
          prayerStart={prayerStart}
          setPrayerStart={setPrayerStart}
          disabled={isOnBreak}
        />
      )}
    </div>
  );
}

// Today's break totals for quick glance
function BreakSummary({ employeeId }: { employeeId: string }) {
  const [totalBreakSeconds, setTotalBreakSeconds] = React.useState(0);
  const [exceedSeconds, setExceedSeconds] = React.useState(0);
  // Removed prayer totals from BreakSummary; shown in Prayer widget instead

  React.useEffect(() => {
    const fetchBreaks = async () => {
      try {
        if (!employeeId) return;
        const today = new Date().toISOString().slice(0, 10);
        const res = await fetch(`/api/breaks?employeeId=${employeeId}&date=${today}`);
        const data = await res.json();
        if (data.success && data.breaks.length > 0) {
          let total = 0;
          data.breaks.forEach((b: any) => {
            if (b.break_start && b.break_end) {
              const start = new Date(b.break_start);
              const end = new Date(b.break_end);
              total += Math.floor((end.getTime() - start.getTime()) / 1000);
            }
          });
          setTotalBreakSeconds(total);
          setExceedSeconds(total > 3600 ? total - 3600 : 0);
        } else {
          setTotalBreakSeconds(0);
          setExceedSeconds(0);
        }
      } catch (error) {
        setTotalBreakSeconds(0);
        setExceedSeconds(0);
      }
    };
    fetchBreaks();
  }, [employeeId]);

  return (
    <div style={{ marginTop: 12, background: "#fff", borderRadius: 12, boxShadow: "0 2px 8px rgba(230,126,34,0.10)", padding: "8px 12px", minWidth: 120 }}>
      <div style={{ fontSize: "0.95rem", fontWeight: 600, color: "#e67e22", marginBottom: 6 }}>Today's Total Break</div>
      <div style={{ fontSize: "1rem", fontWeight: 500, color: totalBreakSeconds > 3600 ? "#e74c3c" : "#2d3436" }}>{formatDuration(totalBreakSeconds)}</div>
      {exceedSeconds > 0 && (
        <div style={{ fontSize: "0.9rem", color: "#e74c3c", marginTop: 4 }}>Exceed: {formatDuration(exceedSeconds)}</div>
      )}
    </div>
  );
}
