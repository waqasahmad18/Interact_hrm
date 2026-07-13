using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Interop;

namespace InteractPresence;

/// <summary>Force a WPF window above every other app (Cursor, browsers, etc.).</summary>
internal static class TopmostHelper
{
    private static readonly IntPtr HwndTopmost = new(-1);
    private const uint SwpNosize = 0x0001;
    private const uint SwpNomove = 0x0002;
    private const uint SwpShowwindow = 0x0040;
    private const uint SwpNoactivate = 0x0010;

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool SetWindowPos(
        IntPtr hWnd, IntPtr hWndInsertAfter,
        int x, int y, int cx, int cy, uint uFlags);

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool BringWindowToTop(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr hWnd, IntPtr processId);

    [DllImport("kernel32.dll")]
    private static extern uint GetCurrentThreadId();

    [DllImport("user32.dll")]
    private static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);

    private const int SwRestore = 9;

    public static void ForceToFront(Window window)
    {
        try
        {
            window.ShowActivated = true;
            window.Topmost = false;
            window.Topmost = true;
            window.Activate();

            var helper = new WindowInteropHelper(window);
            helper.EnsureHandle();
            var hwnd = helper.Handle;
            if (hwnd == IntPtr.Zero) return;

            ShowWindow(hwnd, SwRestore);
            SetWindowPos(hwnd, HwndTopmost, 0, 0, 0, 0, SwpNomove | SwpNosize | SwpShowwindow);
            BringWindowToTop(hwnd);

            var foreground = GetForegroundWindow();
            var foreTid = GetWindowThreadProcessId(foreground, IntPtr.Zero);
            var curTid = GetCurrentThreadId();
            if (foreTid != 0 && foreTid != curTid)
            {
                AttachThreadInput(curTid, foreTid, true);
                try
                {
                    BringWindowToTop(hwnd);
                    SetForegroundWindow(hwnd);
                }
                finally
                {
                    AttachThreadInput(curTid, foreTid, false);
                }
            }
            else
            {
                SetForegroundWindow(hwnd);
            }

            // Cursor / Electron often reclaims z-order — keep asserting for ~3s
            var timer = new System.Windows.Threading.DispatcherTimer
            {
                Interval = TimeSpan.FromMilliseconds(200),
            };
            var ticks = 0;
            timer.Tick += (_, _) =>
            {
                ticks++;
                try
                {
                    if (!window.IsVisible)
                    {
                        timer.Stop();
                        return;
                    }
                    window.Topmost = true;
                    SetWindowPos(hwnd, HwndTopmost, 0, 0, 0, 0,
                        SwpNomove | SwpNosize | SwpShowwindow | SwpNoactivate);
                }
                catch
                {
                    timer.Stop();
                }
                if (ticks >= 15) timer.Stop();
            };
            timer.Start();
        }
        catch
        {
            /* best effort */
        }
    }
}
