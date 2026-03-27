// forceSyncClockState.js
// Force UI state to always match backend attendance record (no localStorage, no local override)

export async function forceSyncClockState(employeeId, setIsClockedIn, setTimer, setLoadingAttendance, setIntervalId) {
  if (!employeeId || !String(employeeId).trim()) {
    setIsClockedIn(false);
    setTimer(0);
    setLoadingAttendance(false);
    return;
  }
  try {
    // Fetch ALL records for this employee to find any open one (not just today)
    const res = await fetch(`/api/attendance?employeeId=${String(employeeId).trim()}`);
    const data = await res.json();
    if (data.success && Array.isArray(data.attendance) && data.attendance.length > 0) {
      // Find ANY open record (clock_in exists but clock_out is NULL)
      const openAttendance = data.attendance.find(a => a.clock_in && !a.clock_out);
      if (openAttendance && openAttendance.clock_in) {
        setIsClockedIn(true);
        const clockInTime = new Date(openAttendance.clock_in);
        if (Number.isNaN(clockInTime.getTime())) {
          setTimer(0);
          setLoadingAttendance(false);
          return;
        }
        const now = new Date();
        // If API/DB clock is ahead of client "now" (timezone skew), elapsed can go negative — show 0+ only.
        const elapsedSeconds = Math.max(
          0,
          Math.floor((now.getTime() - clockInTime.getTime()) / 1000)
        );
        setTimer(elapsedSeconds);
        if (setIntervalId) {
          const id = setInterval(() => {
            const newElapsed = Math.max(
              0,
              Math.floor((Date.now() - clockInTime.getTime()) / 1000)
            );
            setTimer(newElapsed);
          }, 1000);
          setIntervalId(id);
        }
        setLoadingAttendance(false);
        return;
      }
    }
    // No open record
    setIsClockedIn(false);
    setTimer(0);
    setLoadingAttendance(false);
    if (setIntervalId) clearInterval(setIntervalId);
  } catch (err) {
    setIsClockedIn(false);
    setTimer(0);
    setLoadingAttendance(false);
    if (setIntervalId) clearInterval(setIntervalId);
  }
}
