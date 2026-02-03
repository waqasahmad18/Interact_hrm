// forceSyncBreakState.js
// Force UI state to always match backend break record (no localStorage, no local override)
// Checks if break is running and syncs timer with database

export async function forceSyncBreakState(employeeId, setIsOnBreak, setBreakTimer, setLoadingBreak, setBreakIntervalId) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const res = await fetch(`/api/breaks?employeeId=${String(employeeId).trim()}&date=${today}`);
    const data = await res.json();
    
    if (data.success && Array.isArray(data.breaks) && data.breaks.length > 0) {
      // Find running break (break_start exists but break_end is NULL)
      const runningBreak = data.breaks.find(b => b.break_start && !b.break_end);
      
      if (runningBreak && runningBreak.break_start) {
        setIsOnBreak(true);
        const breakStartTime = new Date(runningBreak.break_start);
        const now = new Date();
        const elapsedSeconds = Math.floor((now.getTime() - breakStartTime.getTime()) / 1000);
        setBreakTimer(elapsedSeconds);
        
        if (setBreakIntervalId) {
          const id = setInterval(() => {
            const newElapsed = Math.floor((Date.now() - breakStartTime.getTime()) / 1000);
            setBreakTimer(newElapsed);
          }, 1000);
          setBreakIntervalId(id);
        }
        setLoadingBreak(false);
        return;
      }
    }
    
    // No running break
    setIsOnBreak(false);
    setBreakTimer(0);
    setLoadingBreak(false);
    if (setBreakIntervalId) clearInterval(setBreakIntervalId);
  } catch (err) {
    setIsOnBreak(false);
    setBreakTimer(0);
    setLoadingBreak(false);
    if (setBreakIntervalId) clearInterval(setBreakIntervalId);
  }
}
