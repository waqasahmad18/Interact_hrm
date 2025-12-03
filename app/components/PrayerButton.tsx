"use client";
import React from "react";

interface PrayerButtonProps {
  employeeId: string;
  employeeName: string;
  isPrayerOn: boolean;
  setIsPrayerOn: React.Dispatch<React.SetStateAction<boolean>>;
  prayerStart: Date | null;
  setPrayerStart: React.Dispatch<React.SetStateAction<Date | null>>;
}

export function PrayerButton({
  employeeId,
  employeeName,
  isPrayerOn,
  setIsPrayerOn,
  prayerStart,
  setPrayerStart,
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
    <div style={{ background: "#f7fafc", borderRadius: 16, padding: 24, minWidth: 180, display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ fontWeight: 600, fontSize: "1.1rem", color: "#8e44ad", marginBottom: 10 }}>Prayer Break</div>
      <button
        onClick={isPrayerOn ? handlePrayerEnd : handlePrayerStart}
        style={{
          background: isPrayerOn ? "#e74c3c" : "#8e44ad",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          padding: "8px 18px",
          fontSize: "1rem",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        {isPrayerOn ? "End Prayer" : "Start Prayer"}
      </button>
      {isPrayerOn && (
        <div style={{ marginTop: 12, background: "#fff", borderRadius: 12, padding: "8px 12px", minWidth: 120, boxShadow: "0 2px 8px rgba(142,68,173,0.10)" }}>
          <div style={{ fontSize: "0.95rem", fontWeight: 600, color: "#8e44ad", marginBottom: 6 }}>Prayer Time</div>
          <div style={{ fontSize: "1rem", fontWeight: 500, color: "#2d3436" }}>{formatTime(currentPrayerDuration)}</div>
        </div>
      )}
    </div>
  );
}
