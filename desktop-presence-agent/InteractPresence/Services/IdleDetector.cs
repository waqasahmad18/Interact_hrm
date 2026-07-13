using System.Runtime.InteropServices;

namespace InteractPresence;

/// <summary>
/// OS-level idle detection via Win32 GetLastInputInfo.
/// Works across Excel, browser, CRM, etc. — not limited to this app's window.
/// Requires only standard user permissions (no admin elevation).
/// </summary>
public sealed class IdleDetector
{
    [StructLayout(LayoutKind.Sequential)]
    private struct LASTINPUTINFO
    {
        public uint cbSize;
        public uint dwTime;
    }

    [DllImport("user32.dll")]
    private static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);

    [DllImport("kernel32.dll")]
    private static extern uint GetTickCount();

    /// <summary>Milliseconds since the last global mouse/keyboard input.</summary>
    public TimeSpan GetIdleDuration()
    {
        var info = new LASTINPUTINFO { cbSize = (uint)Marshal.SizeOf<LASTINPUTINFO>() };
        if (!GetLastInputInfo(ref info))
            return TimeSpan.Zero;

        uint tick = GetTickCount();
        uint idleMs = tick - info.dwTime;
        return TimeSpan.FromMilliseconds(idleMs);
    }

    public bool IsIdleBeyond(TimeSpan threshold) => GetIdleDuration() >= threshold;
}
