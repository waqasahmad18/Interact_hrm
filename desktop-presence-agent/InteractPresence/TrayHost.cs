using System.Windows;
using System.Windows.Forms;
using Application = System.Windows.Application;

namespace InteractPresence;

/// <summary>System-tray host — no permanent main window.</summary>
public sealed class TrayHost : IDisposable
{
    private readonly NotifyIcon _notify;
    private readonly PresenceController _controller;
    private readonly AppSettings _settings;

    public TrayHost(PresenceController controller, AppSettings settings)
    {
        _controller = controller;
        _settings = settings;

        _notify = new NotifyIcon
        {
            Visible = true,
            Text = "Interact Presence",
            Icon = System.Drawing.SystemIcons.Application,
        };

        var menu = new ContextMenuStrip();
        menu.Items.Add("Status: starting…", null, null).Name = "status";
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Set Employee ID…", null, (_, _) => PromptEmployeeId());
        menu.Items.Add("Set HRM URL…", null, (_, _) => PromptHrmUrl());
        menu.Items.Add("Use Staging HRM", null, (_, _) =>
            SetHrmUrl("https://192.168.10.6:8443"));
        menu.Items.Add("Use Localhost HRM", null, (_, _) =>
            SetHrmUrl("http://localhost:3000"));
        menu.Items.Add("Test success toast", null, (_, _) =>
            DesktopNotify.Success("Verification successful — you are present."));
        menu.Items.Add("Test fail toast", null, (_, _) =>
            DesktopNotify.Failed("Verification failed — face did not match."));
        menu.Items.Add("Open HRM in browser", null, (_, _) =>
        {
            try
            {
                System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
                {
                    FileName = _settings.HrmBaseUrl,
                    UseShellExecute = true,
                });
            }
            catch { /* ignore */ }
        });
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Exit", null, (_, _) =>
        {
            _controller.Stop();
            Application.Current.Shutdown();
        });
        _notify.ContextMenuStrip = menu;

        DesktopNotify.AttachTrayIcon(_notify);

        _controller.StatusChanged += text =>
        {
            if (_notify.ContextMenuStrip?.Items["status"] is ToolStripMenuItem item)
            {
                void apply() => item.Text = $"Status: {text}";
                if (_notify.ContextMenuStrip.InvokeRequired)
                    _notify.ContextMenuStrip.Invoke(apply);
                else
                    apply();
            }
            _notify.Text = text.Length > 60 ? text[..60] : text;
        };
    }

    public void Show()
    {
        _notify.BalloonTipTitle = "Interact Presence";
        _notify.BalloonTipText = "Presence agent is running in the tray.";
        _notify.ShowBalloonTip(2500);
        // Prove notifications work on startup
        DesktopNotify.Success("Presence agent started — notifications are on.");
    }

    private void PromptEmployeeId()
    {
        var input = SimplePrompt.Ask(
            "Interact Presence",
            "Employee ID (Phase-1 stub — real HRM login later):",
            _settings.EmployeeId ?? "");
        if (string.IsNullOrWhiteSpace(input)) return;
        _settings.EmployeeId = input.Trim();
        _settings.Save();
    }

    private void PromptHrmUrl()
    {
        var input = SimplePrompt.Ask(
            "Interact Presence",
            "HRM base URL:\n• Staging: https://192.168.10.6:8443\n• Local: http://localhost:3000",
            _settings.HrmBaseUrl ?? "");
        if (string.IsNullOrWhiteSpace(input)) return;
        SetHrmUrl(input.Trim());
    }

    private void SetHrmUrl(string url)
    {
        var cleaned = url.Trim().TrimEnd('/');
        if (string.IsNullOrWhiteSpace(cleaned)) return;
        _settings.HrmBaseUrl = cleaned;
        _settings.Save();
        DesktopNotify.Success($"HRM pointed at: {cleaned}");
    }

    public void Dispose()
    {
        _notify.Visible = false;
        _notify.Dispose();
    }
}
