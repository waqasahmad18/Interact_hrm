// forceSyncPrayerBreakState.js
// Force UI state to always match backend prayer break record (no localStorage, no local override)
// Checks if prayer break is running and syncs timer with database

export async function forceSyncPrayerBreakState(employeeId, setIsOnPrayerBreak, setPrayerBreakTimer, setLoadingPrayerBreak, setPrayerBreakIntervalId) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const res = await fetch(`/api/prayer_breaks?employeeId=${employeeId}&date=${today}`);
    const data = await res.json();
    
    if (data.success && Array.isArray(data.prayer_breaks) && data.prayer_breaks.length > 0) {
      // Find running prayer break (prayer_break_start exists but prayer_break_end is NULL)
      const runningPrayerBreak = data.prayer_breaks.find(pb => pb.prayer_break_start && !pb.prayer_break_end);
      
      if (runningPrayerBreak && runningPrayerBreak.prayer_break_start) {
        setIsOnPrayerBreak(true);
        const prayerBreakStartTime = new Date(runningPrayerBreak.prayer_break_start);
        const now = new Date();
        const elapsedSeconds = Math.floor((now.getTime() - prayerBreakStartTime.getTime()) / 1000);
        setPrayerBreakTimer(elapsedSeconds);
        
        if (setPrayerBreakIntervalId) {
          const id = setInterval(() => {
            const newElapsed = Math.floor((Date.now() - prayerBreakStartTime.getTime()) / 1000);
            setPrayerBreakTimer(newElapsed);
          }, 1000);
          setPrayerBreakIntervalId(id);
        }
        setLoadingPrayerBreak(false);
        return;
      }
    }
    
    // No running prayer break
    setIsOnPrayerBreak(false);
    setPrayerBreakTimer(0);
    setLoadingPrayerBreak(false);
    if (setPrayerBreakIntervalId) clearInterval(setPrayerBreakIntervalId);
  } catch (err) {
    setIsOnPrayerBreak(false);
    setPrayerBreakTimer(0);
    setLoadingPrayerBreak(false);
    if (setPrayerBreakIntervalId) clearInterval(setPrayerBreakIntervalId);
  }
}
