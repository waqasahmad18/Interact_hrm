using System.Runtime.InteropServices;

namespace InteractPresence;

/// <summary>
/// OPTIONAL — not part of core unavailable logging.
/// Enable only via AppSettings.LockScreenOnTimeout.
/// </summary>
public static class OptionalScreenLock
{
    [DllImport("user32.dll")]
    private static extern bool LockWorkStation();

    public static void TryLockIfEnabled(bool enabled)
    {
        if (!enabled) return;
        try { LockWorkStation(); }
        catch { /* ignore */ }
    }
}
