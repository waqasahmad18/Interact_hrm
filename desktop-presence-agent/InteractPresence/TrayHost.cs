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
            Text = $"Interact Presence {AgentUpdater.CurrentVersion}",
            Icon = System.Drawing.SystemIcons.Application,
        };

        var menu = new ContextMenuStrip();
        menu.Items.Add("Status: starting…", null, null).Name = "status";
        menu.Items.Add($"Version: {AgentUpdater.CurrentVersion}", null, null);
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Set Employee ID (admin)…", null, (_, _) => PromptEmployeeId());
        menu.Items.Add("Set HRM URL (admin)…", null, (_, _) => PromptHrmUrl());
        menu.Items.Add("Use Staging HRM (admin)…", null, (_, _) =>
            SetHrmUrlWithPassword("https://192.168.10.6:8443", "staging"));
        menu.Items.Add("Use Localhost HRM (admin)…", null, (_, _) =>
            SetHrmUrlWithPassword("http://localhost:3000", "localhost"));
        menu.Items.Add("Check for updates (admin)…", null, (_, _) => CheckUpdates());
        menu.Items.Add("Test success toast (admin)…", null, (_, _) =>
        {
            if (!ConfirmAdminPassword("Enter admin password for test toast:")) return;
            DesktopNotify.Success("Verification successful — you are present.");
        });
        menu.Items.Add("Test fail toast (admin)…", null, (_, _) =>
        {
            if (!ConfirmAdminPassword("Enter admin password for test toast:")) return;
            DesktopNotify.Failed("Verification failed — face did not match.");
        });
        menu.Items.Add("Open HRM in browser (admin)…", null, (_, _) => OpenHrm());
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(
            AutoStartHelper.IsEnabled() ? "Auto-start: ON (login)" : "Auto-start: OFF",
            null,
            null).Name = "autostart";
        menu.Items.Add("Disable auto-start (admin)…", null, (_, _) => DisableAutoStartWithPassword());
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Exit (admin password)…", null, (_, _) => TryExitWithPassword());
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
        AutoStartHelper.EnsureEnabled();
        RefreshAutoStartLabel();
        _notify.BalloonTipTitle = "Interact Presence";
        _notify.BalloonTipText = "Agent is running.";
        _notify.ShowBalloonTip(2500);
        DesktopNotify.Success("Presence agent started.");
    }

    private void RefreshAutoStartLabel()
    {
        if (_notify.ContextMenuStrip?.Items["autostart"] is ToolStripMenuItem item)
            item.Text = AutoStartHelper.IsEnabled() ? "Auto-start: ON (login)" : "Auto-start: OFF";
    }

    private bool ConfirmAdminPassword(string purpose)
    {
        var expected = string.IsNullOrWhiteSpace(_settings.AgentExitPassword)
            ? "InteractAdmin"
            : _settings.AgentExitPassword.Trim();
        var input = SimplePrompt.AskPassword(
            "Admin password required",
            purpose.Trim());
        if (input == null) return false;
        if (string.Equals(input.Trim(), expected, StringComparison.Ordinal))
            return true;
        DesktopNotify.Failed("Wrong password.");
        return false;
    }

    private void TryExitWithPassword()
    {
        if (!ConfirmAdminPassword("Enter admin password to EXIT Interact Presence:"))
            return;
        _controller.Stop();
        Application.Current.Shutdown();
    }

    private void DisableAutoStartWithPassword()
    {
        if (!ConfirmAdminPassword("Enter admin password to disable login auto-start:"))
            return;
        if (AutoStartHelper.TryDisable())
            DesktopNotify.Success("Auto-start disabled.");
        else
            DesktopNotify.Failed("Could not remove startup shortcut.");
        RefreshAutoStartLabel();
    }

    private void PromptEmployeeId()
    {
        if (!ConfirmAdminPassword("Enter admin password to set Employee ID:"))
            return;
        var input = SimplePrompt.Ask(
            "Interact Presence",
            "Employee ID:",
            _settings.EmployeeId ?? "");
        if (string.IsNullOrWhiteSpace(input)) return;
        _settings.EmployeeId = input.Trim();
        _settings.Save();
        DesktopNotify.Success($"Employee ID set to {_settings.EmployeeId}");
    }

    private void PromptHrmUrl()
    {
        if (!ConfirmAdminPassword("Enter admin password to change HRM URL:"))
            return;
        var input = SimplePrompt.Ask(
            "Interact Presence",
            "HRM base URL:\n• Staging: https://192.168.10.6:8443\n• Local: http://localhost:3000",
            _settings.HrmBaseUrl ?? "");
        if (string.IsNullOrWhiteSpace(input)) return;
        ApplyHrmUrl(input.Trim());
    }

    private void SetHrmUrlWithPassword(string url, string label)
    {
        if (!ConfirmAdminPassword($"Enter admin password to switch HRM to {label}:"))
            return;
        ApplyHrmUrl(url);
    }

    private void ApplyHrmUrl(string url)
    {
        var cleaned = url.Trim().TrimEnd('/');
        if (string.IsNullOrWhiteSpace(cleaned)) return;
        _settings.HrmBaseUrl = cleaned;
        _settings.Save();
        DesktopNotify.Success($"HRM pointed at: {cleaned}");
    }

    private void CheckUpdates()
    {
        if (!ConfirmAdminPassword("Enter admin password to check for updates:"))
            return;
        _ = Task.Run(async () =>
        {
            await AgentUpdater.CheckAndUpdateAsync(_settings, force: true).ConfigureAwait(false);
        });
        DesktopNotify.Success("Checking for agent updates…");
    }

    private void OpenHrm()
    {
        if (!ConfirmAdminPassword("Enter admin password to open HRM:"))
            return;
        try
        {
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
            {
                FileName = _settings.HrmBaseUrl,
                UseShellExecute = true,
            });
        }
        catch { /* ignore */ }
    }

    public void Dispose()
    {
        _notify.Visible = false;
        _notify.Dispose();
    }
}
