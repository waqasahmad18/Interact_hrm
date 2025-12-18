"use client";
import React from "react";

interface PrayerButtonProps {
  employeeId: string;
  employeeName: string;
  isPrayerOn: boolean;
  setIsPrayerOn: React.Dispatch<React.SetStateAction<boolean>>;
  prayerStart: Date | null;
  setPrayerStart: React.Dispatch<React.SetStateAction<Date | null>>;
  disabled?: boolean;
}

export function PrayerButton({
  employeeId,
  employeeName,
  isPrayerOn,
  setIsPrayerOn,
  prayerStart,
  setPrayerStart,
  disabled = false,
}: PrayerButtonProps) {
  const [currentPrayerDuration, setCurrentPrayerDuration] = React.useState(0);
  const prayerTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  // Restore ongoing prayer break session from DB (simplified logic)
  React.useEffect(() => {
    const fetchOngoingPrayerBreak = async () => {
      if (!employeeId) return;
      const today = new Date().toISOString().slice(0, 10);
      try {
        const res = await fetch(`/api/prayer_breaks?employeeId=${employeeId}&date=${today}`);
        const data = await res.json();
        if (data.success && Array.isArray(data.prayer_breaks)) {
          const ongoing = data.prayer_breaks.find((pb: any) => pb.prayer_break_start && !pb.prayer_break_end);
          if (ongoing) {
            setIsPrayerOn(true);
            setPrayerStart(new Date(ongoing.prayer_break_start));
          } else {
            setIsPrayerOn(false);
            setPrayerStart(null);
          }
        }
      } catch (err) {
        setIsPrayerOn(false);
        setPrayerStart(null);
      }
    };

    fetchOngoingPrayerBreak();
  }, [employeeId]);

  // When prayerStart changes, set up timer to always calculate elapsed time
  React.useEffect(() => {
    if (!prayerStart) return;
    const startTime = new Date(prayerStart);
    const updateDuration = () => {
      const now = new Date();
      setCurrentPrayerDuration(Math.floor((now.getTime() - startTime.getTime()) / 1000));
    };
    updateDuration(); // Set immediately
    if (prayerTimerRef.current) clearInterval(prayerTimerRef.current);
    prayerTimerRef.current = setInterval(updateDuration, 1000);
    return () => {
      if (prayerTimerRef.current) clearInterval(prayerTimerRef.current);
    };
  }, [prayerStart]);

  const handlePrayerStart = async () => {
    if (!employeeId) return;
    const startTime = new Date();
    try {
      const res = await fetch("/api/prayer_breaks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee_id: employeeId,
          employee_name: employeeName,
          date: startTime.toISOString(),
          prayer_break_start: startTime.toISOString(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setIsPrayerOn(true);
        setPrayerStart(startTime);
        setCurrentPrayerDuration(0);
        if (prayerTimerRef.current) clearInterval(prayerTimerRef.current);
        prayerTimerRef.current = setInterval(() => {
          const now = new Date();
          setCurrentPrayerDuration(Math.floor((now.getTime() - startTime.getTime()) / 1000));
        }, 1000);
      } else {
        alert(data.error || "Failed to start prayer break");
      }
    } catch (err) {
      console.error(err);
      alert("Error starting prayer break");
    }
  };

  const handlePrayerEnd = async () => {
    if (!employeeId) return;
    try {
      const endTime = new Date();
      const res = await fetch("/api/prayer_breaks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee_id: employeeId,
          date: endTime.toISOString(),
          prayer_break_end: endTime.toISOString(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setIsPrayerOn(false);
        setPrayerStart(null);
        setCurrentPrayerDuration(0);
        if (prayerTimerRef.current) clearInterval(prayerTimerRef.current);
      } else {
        alert(data.error || "Failed to end prayer break");
      }
    } catch (err) {
      console.error(err);
      alert("Error ending prayer break");
    }
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600)
      .toString()
      .padStart(2, "0");
    const m = Math.floor((seconds % 3600) / 60)
      .toString()
      .padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${h}h ${m}m ${s}s`;
  };

  return (
    <div style={{ background: "#f7fafc", borderRadius: 16, boxShadow: "0 2px 8px #e2e8f0", padding: 24, minWidth: 180, display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ fontWeight: 600, fontSize: "1.1rem", color: "#8e44ad", marginBottom: 10 }}>Prayer Break</div>
      <button
        onClick={isPrayerOn ? handlePrayerEnd : handlePrayerStart}
        disabled={disabled}
        style={{
          background: isPrayerOn ? "#e74c3c" : "#8e44ad",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          padding: "8px 18px",
          fontSize: "1rem",
          fontWeight: 600,
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.6 : 1,
          boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
          transition: "background 0.2s"
        }}
      >
        {isPrayerOn ? "End Prayer" : "Start Prayer"}
      </button>
      {isPrayerOn && (
        <div style={{ marginTop: 12, background: "#fff", borderRadius: 12, boxShadow: "0 2px 8px rgba(142,68,173,0.10)", padding: "8px 12px", minWidth: 120 }}>
          <div style={{ fontSize: "0.95rem", fontWeight: 600, color: "#8e44ad", marginBottom: 6 }}>Prayer Time</div>
          <div style={{ fontSize: "1rem", fontWeight: 500, color: "#2d3436" }}>{formatTime(currentPrayerDuration)}</div>
        </div>
      )}
      <PrayerTotals employeeId={employeeId} />
    </div>
  );
}

// Today's total prayer time summary
function PrayerTotals({ employeeId }: { employeeId: string }) {
  const [totalSeconds, setTotalSeconds] = React.useState(0);
  const [exceedSeconds, setExceedSeconds] = React.useState(0);

  React.useEffect(() => {
    const fetchTotals = async () => {
      try {
        if (!employeeId) return;
        const today = new Date().toISOString().slice(0, 10);
        const res = await fetch(`/api/prayer_breaks?employeeId=${employeeId}&date=${today}`);
        const data = await res.json();
        if (data.success && Array.isArray(data.prayer_breaks)) {
          let total = 0;
          data.prayer_breaks.forEach((p: any) => {
            if (p.prayer_break_start && p.prayer_break_end) {
              const s = new Date(p.prayer_break_start).getTime();
              const e = new Date(p.prayer_break_end).getTime();
              total += Math.floor((e - s) / 1000);
            }
          });
          setTotalSeconds(total);
          setExceedSeconds(total > 1800 ? total - 1800 : 0);
        } else {
          setTotalSeconds(0);
          setExceedSeconds(0);
        }
      } catch {
        setTotalSeconds(0);
        setExceedSeconds(0);
      }
    };
    fetchTotals();
  }, [employeeId]);

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600).toString().padStart(2, "0");
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${h}h ${m}m ${s}s`;
  };

  return (
    <div style={{ marginTop: 12, background: "#fff", borderRadius: 12, boxShadow: "0 2px 8px rgba(142,68,173,0.10)", padding: "8px 12px", minWidth: 120 }}>
      <div style={{ fontSize: "0.95rem", fontWeight: 600, color: "#8e44ad", marginBottom: 6 }}>Today's Total Prayer</div>
      <div style={{ fontSize: "1rem", fontWeight: 500, color: totalSeconds > 1800 ? "#e74c3c" : "#2d3436" }}>{formatDuration(totalSeconds)}</div>
      {exceedSeconds > 0 && (
        <div style={{ fontSize: "0.9rem", color: "#e74c3c", marginTop: 4 }}>Exceed: {formatDuration(exceedSeconds)}</div>
      )}
    </div>
  );
}
