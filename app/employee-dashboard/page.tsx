"use client";
import React from "react";
import Layout from "./layout";
import { formatDuration } from "../components/utils";
import { PrayerButton } from "../components/PrayerButton";
import { differenceInSeconds } from "date-fns";

export default function EmployeeDashboardPage() {
    // Helper to fetch ongoing break status and update state
    const fetchOngoingBreakStatus = async () => {
      if (!employeeId) return;
      try {
        const today = new Date().toISOString().slice(0, 10);
        const response = await fetch(`/api/breaks?employeeId=${employeeId}&date=${today}`);
        const data = await response.json();
        if (data.success && data.breaks.length > 0) {
          const ongoingBreak = data.breaks.find((b: any) => !b.break_end);
          if (ongoingBreak) {
            setIsOnBreak(true);
            setBreakStart(new Date(ongoingBreak.break_start));
          } else {
            setIsOnBreak(false);
            setBreakStart(null);
          }
        } else {
          setIsOnBreak(false);
          setBreakStart(null);
        }
      } catch (error) {
        setIsOnBreak(false);
        setBreakStart(null);
      }
    };
  // State declarations
  const [isPrayerOn, setIsPrayerOn] = React.useState(false);
  const [prayerStart, setPrayerStart] = React.useState<Date | null>(null);
  const prayerTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const [isOnBreak, setIsOnBreak] = React.useState(false);
  const [breakStart, setBreakStart] = React.useState<Date | null>(null);
  const breakTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const [currentBreakDuration, setCurrentBreakDuration] = React.useState(0);
  const [isClockedIn, setIsClockedIn] = React.useState(false);
  const [timer, setTimer] = React.useState(0);
  const [employeeId, setEmployeeId] = React.useState<string>("");
  const [loadingAttendance, setLoadingAttendance] = React.useState(true);
  const [intervalId, setIntervalId] = React.useState<NodeJS.Timeout | null>(null);
  const [employeeName, setEmployeeName] = React.useState("");
  // Add attendanceTimerRef for clock-in timer interval management
  const attendanceTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  // Persisted clock-in info
  const CLOCKIN_KEY = "clockinInfo";

  // Effect 1: Run once to get employee info and set employeeId
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const loginId = localStorage.getItem("loginId");
    if (!loginId) return;
    let apiUrl = "/api/employee?";
    apiUrl += loginId.includes("@") ? `email=${loginId}` : `username=${loginId}`;
    fetch(apiUrl)
      .then(res => res.json())
      .then(data => {
        if (data.success && data.employee) {
          setEmployeeId(data.employee.employee_id);
          setEmployeeName(
            `${data.employee.first_name || ""} ${data.employee.middle_name || ""} ${data.employee.last_name || ""}`.trim()
          );
        }
      });
  }, []);

  // Effect 2: Restore attendance, break, prayer when employeeId is ready
  React.useEffect(() => {
    if (!employeeId) return;
    const today = new Date().toISOString().slice(0, 10);
    const restore = async () => {
      setLoadingAttendance(true);
      // Restore clock-in from localStorage
      const clockinInfo = localStorage.getItem(CLOCKIN_KEY);
      if (clockinInfo) {
        try {
          const info = JSON.parse(clockinInfo);
          if (info.employeeId === employeeId && info.clockInTime && !info.clockOutTime) {
            setIsClockedIn(true);
            const clockInTime = new Date(info.clockInTime);
            const now = new Date();
            const elapsedSeconds = Math.floor((now.getTime() - clockInTime.getTime()) / 1000);
            setTimer(elapsedSeconds);
            if (attendanceTimerRef.current) clearInterval(attendanceTimerRef.current);
            attendanceTimerRef.current = setInterval(() => {
              setTimer(prev => prev + 1);
            }, 1000);
          } else {
            setIsClockedIn(false);
            setTimer(0);
            if (attendanceTimerRef.current) clearInterval(attendanceTimerRef.current);
          }
        } catch {
          setIsClockedIn(false);
          setTimer(0);
          if (attendanceTimerRef.current) clearInterval(attendanceTimerRef.current);
        }
      } else {
        setIsClockedIn(false);
        setTimer(0);
        if (attendanceTimerRef.current) clearInterval(attendanceTimerRef.current);
      }
      // Break restore
      const breakRes = await fetch(`/api/breaks?employeeId=${employeeId}&date=${today}`);
      const breakData = await breakRes.json();
      if (breakData.success && breakData.breaks.length > 0) {
        const ongoingBreak = breakData.breaks.find((b: any) => b.break_start && !b.break_end);
        if (ongoingBreak) {
          setIsOnBreak(true);
          setBreakStart(new Date(ongoingBreak.break_start));
          // Restore break timer
          const breakStartTime = new Date(ongoingBreak.break_start);
          const now = new Date();
          const breakSeconds = Math.floor((now.getTime() - breakStartTime.getTime()) / 1000);
          setCurrentBreakDuration(breakSeconds);
          if (breakTimerRef.current) clearInterval(breakTimerRef.current);
          breakTimerRef.current = setInterval(() => {
            setCurrentBreakDuration(prev => prev + 1);
          }, 1000);
        }
      } else {
        setIsOnBreak(false);
        setBreakStart(null);
        setCurrentBreakDuration(0);
        if (breakTimerRef.current) clearInterval(breakTimerRef.current);
      }
      // Prayer break restore
      const prayerRes = await fetch(`/api/prayer_breaks?employeeId=${employeeId}&date=${today}`);
      const prayerData = await prayerRes.json();
      if (prayerData.success && prayerData.prayer_breaks && prayerData.prayer_breaks.length > 0) {
        const ongoingPrayer = prayerData.prayer_breaks.find((b: any) => b.prayer_break_start && !b.prayer_break_end);
        if (ongoingPrayer) {
          setIsPrayerOn(true);
          setPrayerStart(new Date(ongoingPrayer.prayer_break_start));
        } else {
          setIsPrayerOn(false);
          setPrayerStart(null);
        }
      } else {
        setIsPrayerOn(false);
        setPrayerStart(null);
      }
      setLoadingAttendance(false);
    };
    restore();
    // Cleanup prayer timer interval if any
    return () => {
      if (prayerTimerRef.current) clearInterval(prayerTimerRef.current);
    };
  }, [employeeId]);

  // Cleanup all intervals on unmount
  React.useEffect(() => {
    return () => {
      if (attendanceTimerRef.current) clearInterval(attendanceTimerRef.current);
      if (breakTimerRef.current) clearInterval(breakTimerRef.current);
      if (prayerTimerRef.current) clearInterval(prayerTimerRef.current);
    };
  }, []);
  // ...existing code...

  const handleClockIn = async () => {
    if (!employeeId) return;
    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const clockIn = now.toISOString();
    try {
      await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee_id: employeeId,
          employee_name: employeeName,
          date,
          clock_in: clockIn,
        }),
      });
      setIsClockedIn(true);
      localStorage.setItem(CLOCKIN_KEY, JSON.stringify({ employeeId, clockInTime: clockIn, clockOutTime: null }));
      if (attendanceTimerRef.current) clearInterval(attendanceTimerRef.current);
      setTimer(0);
      attendanceTimerRef.current = setInterval(() => {
        setTimer(prev => prev + 1);
      }, 1000);
    } catch (error) {
      console.error("Error clocking in:", error);
      alert("Failed to clock in. Please try again.");
    }
  };

  const handleClockOut = async () => {
    if (!employeeId) return;
    try {
      const now = new Date();
      const clockOut = now.toISOString();
      const date = now.toISOString().slice(0, 10);
      await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employee_id: employeeId, employee_name: employeeName, date, clock_out: clockOut })
      });
      if (attendanceTimerRef.current) {
        clearInterval(attendanceTimerRef.current);
        attendanceTimerRef.current = null;
      }
      setIsClockedIn(false);
      setTimer(0);
      // Update localStorage
      const clockinInfo = localStorage.getItem(CLOCKIN_KEY);
      if (clockinInfo) {
        try {
          const info = JSON.parse(clockinInfo);
          info.clockOutTime = clockOut;
          localStorage.setItem(CLOCKIN_KEY, JSON.stringify(info));
        } catch {}
      }
    } catch (error) {
      console.error("Error clocking out:", error);
      alert("Failed to clock out. Please try again.");
    }
  };

  const handleBreakStart = async () => {
    if (!employeeId) {
      alert("Employee ID not available. Cannot start break.");
      return;
    }
    try {
      const breakStartTime = new Date();
      const response = await fetch("/api/breaks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          employee_id: employeeId,
          employee_name: employeeName,
          date: breakStartTime.toISOString(),
          break_start: breakStartTime.toISOString(),
        }),
      });
      const data = await response.json();
      if (data.success) {
        setIsOnBreak(true);
        setBreakStart(breakStartTime);
        setCurrentBreakDuration(0);
        if (breakTimerRef.current) clearInterval(breakTimerRef.current);
        breakTimerRef.current = setInterval(async () => {
          const now = new Date();
          const elapsedSeconds = Math.floor((now.getTime() - breakStartTime.getTime()) / 1000);
          setCurrentBreakDuration(elapsedSeconds);

          // Auto end break at max 1 hour (3600 seconds)
          if (elapsedSeconds >= 3600) {
            clearInterval(breakTimerRef.current!);
            setIsOnBreak(false);
            setBreakStart(null);
            setCurrentBreakDuration(3600);
            // Update break_end in DB
            await fetch("/api/breaks", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                employee_id: employeeId,
                date: new Date().toISOString(),
                break_end: new Date().toISOString(),
              }),
            });
            await fetchOngoingBreakStatus();
          }
        }, 1000);
        await fetchOngoingBreakStatus(); // Refresh break data after starting a break
      } else {
        alert(data.error || "Failed to start break.");
      }
    } catch (error) {
      console.error("Error starting break:", error);
      alert("Error starting break.");
    }
  };

  const handleBreakEnd = async () => {
    if (!employeeId) {
      alert("Employee ID not available. Cannot end break.");
      return;
    }
    try {
      const response = await fetch("/api/breaks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          employee_id: employeeId,
          date: new Date().toISOString(),
          break_end: new Date().toISOString(),
        }),
      });
      const data = await response.json();
      if (data.success) {
        setIsOnBreak(false);
        setBreakStart(null);
        setCurrentBreakDuration(0);
        if (breakTimerRef.current) clearInterval(breakTimerRef.current);
        await fetchOngoingBreakStatus(); // Refresh break data after ending a break
      } else {
        alert(data.error || "Failed to end break.");
      }
    } catch (error) {
      console.error("Error ending break:", error);
      alert("Error ending break.");
    }
  };

  // Helper to format time for display
  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600).toString().padStart(2, "0");
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${h}h ${m}m ${s}s`;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minHeight: "80vh", width: "100%", gap: 0 }}>
      <div style={{ display: "flex", flexDirection: "row", justifyContent: "center", gap: 24, marginTop: 32 }}>
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
            {/* Show total break time and exceed info for today */}
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
        {/* Attendance Widget */}
        <div style={{ background: "#f7fafc", borderRadius: 16, boxShadow: "0 2px 8px #e2e8f0", padding: 24, minWidth: 180, display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ fontWeight: 600, fontSize: "1.1rem", color: "#3478f6", marginBottom: 10 }}>View Your Attendance</div>
          <button
            onClick={() => window.location.href = "/employee-dashboard/my-attendance"}
            style={{
              background: "#3478f6",
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
            Attendance
          </button>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "row", justifyContent: "center", gap: 24, marginTop: 24 }}>
        {/* Leave Widget */}
        <div style={{ background: "#f7fafc", borderRadius: 16, boxShadow: "0 2px 8px #e2e8f0", padding: 24, minWidth: 180, display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ fontWeight: 600, fontSize: "1.1rem", color: "#2b6cb0", marginBottom: 10 }}>Apply for Leave</div>
          <button
            onClick={() => window.location.href = "/employee-dashboard/leave"}
            style={{
              background: "#2b6cb0",
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
            Apply Leave
          </button>
        </div>
      </div>
    </div>
  );
}

// Helper component to show today's total break time and exceed info

function BreakSummary({ employeeId }: { employeeId: string }) {
  const [totalBreakSeconds, setTotalBreakSeconds] = React.useState(0);
  const [exceedSeconds, setExceedSeconds] = React.useState(0);
  const [totalPrayerBreakSeconds, setTotalPrayerBreakSeconds] = React.useState(0);
  const [prayerExceedSeconds, setPrayerExceedSeconds] = React.useState(0);

  React.useEffect(() => {
    const fetchBreaks = async () => {
      try {
        if (!employeeId) return;
        const today = new Date().toISOString().slice(0, 10);
        const res = await fetch(`/api/breaks?employeeId=${employeeId}&date=${today}`);
        const data = await res.json();
        if (data.success && data.breaks.length > 0) {
          let total = 0;
          let prayerTotal = 0;
          data.breaks.forEach((b: any) => {
            // Lunch break
            if (b.break_start && b.break_end) {
              const start = new Date(b.break_start);
              const end = new Date(b.break_end);
              total += Math.floor((end.getTime() - start.getTime()) / 1000);
            }
            // Prayer break
            if (b.prayer_break_start && b.prayer_break_end) {
              const pStart = new Date(b.prayer_break_start);
              const pEnd = new Date(b.prayer_break_end);
              prayerTotal += Math.floor((pEnd.getTime() - pStart.getTime()) / 1000);
            }
          });
          setTotalBreakSeconds(total);
          setExceedSeconds(total > 3600 ? total - 3600 : 0);
          setTotalPrayerBreakSeconds(prayerTotal);
          setPrayerExceedSeconds(prayerTotal > 1800 ? prayerTotal - 1800 : 0); // 30 min limit for prayer break
        } else {
          setTotalBreakSeconds(0);
          setExceedSeconds(0);
          setTotalPrayerBreakSeconds(0);
          setPrayerExceedSeconds(0);
        }
      } catch (error) {
        setTotalBreakSeconds(0);
        setExceedSeconds(0);
        setTotalPrayerBreakSeconds(0);
        setPrayerExceedSeconds(0);
      }
    };
    fetchBreaks();
  }, [employeeId]);

  // Use shared formatDuration utility for h m s format
  // If you want to customize, you can update formatDuration in ../components/utils

  return (
    <div style={{ marginTop: 12, background: "#fff", borderRadius: 12, boxShadow: "0 2px 8px rgba(230,126,34,0.10)", padding: "8px 12px", minWidth: 120 }}>
      <div style={{ fontSize: "0.95rem", fontWeight: 600, color: "#e67e22", marginBottom: 6 }}>Today's Total Break</div>
      <div style={{ fontSize: "1rem", fontWeight: 500, color: totalBreakSeconds > 3600 ? "#e74c3c" : "#2d3436" }}>{formatDuration(totalBreakSeconds)}</div>
      {exceedSeconds > 0 && (
        <div style={{ fontSize: "0.95rem", fontWeight: 600, color: "#e74c3c", marginTop: 6 }}>Exceed: {formatDuration(exceedSeconds)}</div>
      )}
    </div>
  );
}

