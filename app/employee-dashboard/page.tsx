
"use client";
import React from "react";
import Layout from "./layout";
import { formatDuration } from "../components/utils"; // Assuming this utility function exists
import { differenceInSeconds } from "date-fns";

export default function EmployeeDashboardPage() {
  const [isClockedIn, setIsClockedIn] = React.useState(false);
  const [timer, setTimer] = React.useState(0);
  const [intervalId, setIntervalId] = React.useState<NodeJS.Timeout | null>(null);
  const [employeeId, setEmployeeId] = React.useState<string>("");
  const [employeeName, setEmployeeName] = React.useState("");
  // (Already declared above, remove duplicate)
  const [isOnBreak, setIsOnBreak] = React.useState(false);
  const [breakStart, setBreakStart] = React.useState<Date | null>(null);
  const breakTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const [currentBreakDuration, setCurrentBreakDuration] = React.useState(0);

  // Fetch employeeId and restore session state from backend
  React.useEffect(() => {
    if (typeof window !== "undefined") {
      const loginId = localStorage.getItem("loginId");
      if (loginId) {
        let apiUrl = "/api/employee?";
        if (loginId.includes("@")) {
          apiUrl += `email=${loginId}`;
        } else {
          apiUrl += `username=${loginId}`;
        }
        fetch(apiUrl)
          .then(res => res.json())
          .then(async data => {
            if (data.success && data.employee) {
              setEmployeeId(data.employee.employee_id);
              setEmployeeName(
                `${data.employee.first_name || ""} ${data.employee.middle_name || ""} ${data.employee.last_name || ""}`.trim()
              );
              // Restore attendance session
              const today = new Date().toISOString().slice(0, 10);
              const attRes = await fetch(`/api/attendance?employeeId=${data.employee.employee_id}&date=${today}`);
              const attData = await attRes.json();
              if (attData.success && attData.attendance) {
                const att = attData.attendance;
                if (att.clock_in && !att.clock_out) {
                  setIsClockedIn(true);
                  // Restore timer
                  const clockInTime = new Date(att.clock_in);
                  const now = new Date();
                  const seconds = Math.floor((now.getTime() - clockInTime.getTime()) / 1000);
                  setTimer(seconds);
                  if (intervalId) clearInterval(intervalId);
                  const id = setInterval(() => {
                    setTimer(prev => prev + 1);
                  }, 1000);
                  setIntervalId(id);
                }
              }
              // Restore break session
              const breakRes = await fetch(`/api/breaks?employeeId=${data.employee.employee_id}&date=${today}`);
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
            }
          });
      }
    }
  }, []);

  // Function to fetch ongoing break status
  const fetchOngoingBreakStatus = React.useCallback(async () => {
    if (!employeeId) return;
    try {
      const today = new Date().toISOString().slice(0, 10); // Current date in YYYY-MM-DD format
      console.log("Fetching ongoing break for employeeId:", employeeId, "on date:", today);
      const response = await fetch(`/api/breaks?employeeId=${employeeId}&date=${today}`);
      const data = await response.json();
      console.log("Ongoing break API response:", data);

      if (data.success && data.breaks.length > 0) {
        const ongoingBreak = data.breaks.find((b: any) => !b.break_end);
        console.log("Identified ongoing break:", ongoingBreak);
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
  }, [employeeId]);

  const handleClockIn = async () => {
    setIsClockedIn(true);
    if (!employeeId) return;
    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const clockIn = now.toISOString();
    await fetch("/api/attendance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employee_id: employeeId, employee_name: employeeName, date, clock_in: clockIn })
    });
    setTimer(0);
    if (intervalId) {
      clearInterval(intervalId);
    }
    const id = setInterval(() => {
      setTimer((prev) => prev + 1);
    }, 1000);
    setIntervalId(id);
  };

  const handleClockOut = async () => {
    setIsClockedIn(false);
    if (intervalId) {
      clearInterval(intervalId);
      setIntervalId(null);
    }
    if (!employeeId) return;
    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const clockOut = now.toISOString();
    await fetch("/api/attendance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employee_id: employeeId, employee_name: employeeName, date, clock_out: clockOut })
    });
    setTimer(0);
  };

  const handleBreakStart = async () => {
    if (!employeeId) {
      alert("Employee ID not available. Cannot start break.");
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
          employee_name: employeeName,
          date: new Date().toISOString(),
          break_start: new Date().toISOString(),
        }),
      });
      const data = await response.json();
      if (data.success) {
        setIsOnBreak(true);
        setBreakStart(new Date());
        setCurrentBreakDuration(0);
        if (breakTimerRef.current) clearInterval(breakTimerRef.current);
        breakTimerRef.current = setInterval(() => {
          setCurrentBreakDuration(prev => prev + 1);
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
        </div>
        {/* Break Widget */}
        {isClockedIn && (
          <div style={{ background: "#f7fafc", borderRadius: 16, boxShadow: "0 2px 8px #e2e8f0", padding: 24, minWidth: 180, display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ fontWeight: 600, fontSize: "1.1rem", color: "#e67e22", marginBottom: 10 }}>Break</div>
            <button
              onClick={isOnBreak ? handleBreakEnd : handleBreakStart}
              style={{
                background: isOnBreak ? "#e74c3c" : "#e67e22",
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

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600).toString().padStart(2, "0");
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${h}h ${m}m ${s}s`;
  };

  return (
    <div style={{ marginTop: 12, background: "#fff", borderRadius: 12, boxShadow: "0 2px 8px rgba(230,126,34,0.10)", padding: "8px 12px", minWidth: 120 }}>
      <div style={{ fontSize: "0.95rem", fontWeight: 600, color: "#e67e22", marginBottom: 6 }}>Today's Total Break</div>
      <div style={{ fontSize: "1rem", fontWeight: 500, color: totalBreakSeconds > 3600 ? "#e74c3c" : "#2d3436" }}>{formatTime(totalBreakSeconds)}</div>
      {exceedSeconds > 0 && (
        <div style={{ fontSize: "0.95rem", fontWeight: 600, color: "#e74c3c", marginTop: 6 }}>Exceed: {formatTime(exceedSeconds)}</div>
      )}
    </div>
  );
}

