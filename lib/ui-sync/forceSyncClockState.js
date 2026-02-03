// forceSyncClockState.js
// Force UI state to always match backend attendance record (no localStorage, no local override)

export async function forceSyncClockState(employeeId, setIsClockedIn, setTimer, setLoadingAttendance, setIntervalId) {
  try {
    // First, try to close any old open records (before today)
    try {
      await fetch('/api/attendance', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          employeeId: String(employeeId).trim(),
          autoCloseOldRecords: true 
        })
      });
    } catch (e) {
      // Silently ignore if close attempt fails
    }

    const today = new Date().toISOString().slice(0, 10);
    const res = await fetch(`/api/attendance?employeeId=${String(employeeId).trim()}&date=${today}`);
    const data = await res.json();
    if (data.success && Array.isArray(data.attendance) && data.attendance.length > 0) {
      // API now returns only today's records, find one with clock_in but no clock_out
      const todayAttendance = data.attendance.find(a => a.clock_in && !a.clock_out);
      if (todayAttendance && todayAttendance.clock_in) {
        setIsClockedIn(true);
        const clockInTime = new Date(todayAttendance.clock_in);
        const now = new Date();
        const elapsedSeconds = Math.floor((now.getTime() - clockInTime.getTime()) / 1000);
        setTimer(elapsedSeconds);
        if (setIntervalId) {
          const id = setInterval(() => {
            const newElapsed = Math.floor((Date.now() - clockInTime.getTime()) / 1000);
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
