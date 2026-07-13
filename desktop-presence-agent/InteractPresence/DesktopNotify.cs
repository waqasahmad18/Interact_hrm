using System.Drawing;
using System.IO;
using System.Windows.Forms;

namespace InteractPresence;

/// <summary>
/// Reliable desktop notification: WinForms toast on its own STA thread
/// + optional tray balloon. WPF-only toasts were failing silently in tray host.
/// </summary>
internal static class DesktopNotify
{
    private static NotifyIcon? _icon;
    private static Form? _openToast;

    public static void AttachTrayIcon(NotifyIcon icon) => _icon = icon;

    public static void Success(string message = "Verification successful — you are present.")
        => Show(true, "SUCCESS", message);

    public static void Failed(string message = "Verification failed — face did not match.")
        => Show(false, "ERROR", message);

    public static void Show(bool success, string title, string message)
    {
        Log($"notify success={success} title={title} msg={message}");

        // 1) Tray balloon (Windows notification area) — always attempt
        try
        {
            void balloon()
            {
                if (_icon == null) return;
                _icon.BalloonTipIcon = success ? ToolTipIcon.Info : ToolTipIcon.Error;
                _icon.BalloonTipTitle = title;
                _icon.BalloonTipText = string.IsNullOrWhiteSpace(message)
                    ? title
                    : (message.Length > 240 ? message[..240] : message);
                _icon.ShowBalloonTip(success ? 4500 : 6000);
            }

            if (_icon?.ContextMenuStrip?.InvokeRequired == true)
                _icon.ContextMenuStrip.BeginInvoke(balloon);
            else
                balloon();
        }
        catch (Exception ex)
        {
            Log("balloon error: " + ex.Message);
        }

        // 2) Visible HRM-sized toast on dedicated STA thread (always on top)
        try
        {
            var t = new Thread(() =>
            {
                try
                {
                    ShowToastForm(success, title, message ?? "");
                }
                catch (Exception ex)
                {
                    Log("toast thread error: " + ex.Message);
                    try
                    {
                        MessageBox.Show(message, title, MessageBoxButtons.OK,
                            success ? MessageBoxIcon.Information : MessageBoxIcon.Error);
                    }
                    catch { /* ignore */ }
                }
            })
            {
                IsBackground = true,
                Name = "InteractPresenceToast",
            };
            t.SetApartmentState(ApartmentState.STA);
            t.Start();
        }
        catch (Exception ex)
        {
            Log("toast start error: " + ex.Message);
            try
            {
                MessageBox.Show(message, title, MessageBoxButtons.OK,
                    success ? MessageBoxIcon.Information : MessageBoxIcon.Error);
            }
            catch { /* ignore */ }
        }
    }

    private static void ShowToastForm(bool success, string title, string message)
    {
        // Close previous toast on this thread's message loop if any
        try { _openToast?.Close(); } catch { /* ignore */ }

        var screen = Screen.FromPoint(Control.MousePosition).WorkingArea;
        var form = new Form
        {
            FormBorderStyle = FormBorderStyle.None,
            StartPosition = FormStartPosition.Manual,
            ShowInTaskbar = true,
            TopMost = true,
            Width = 400,
            Height = 92,
            BackColor = success ? Color.FromArgb(240, 253, 249) : Color.FromArgb(254, 242, 242),
            Text = "Interact Presence",
        };
        form.Location = new Point(screen.Right - form.Width - 24, screen.Bottom - form.Height - 24);
        _openToast = form;

        var accent = new Panel
        {
            Dock = DockStyle.Left,
            Width = 5,
            BackColor = success ? Color.FromArgb(0, 122, 90) : Color.FromArgb(220, 38, 38),
        };

        var iconPanel = new Panel
        {
            Location = new Point(18, 16),
            Size = new Size(34, 34),
            BackColor = success ? Color.FromArgb(236, 253, 245) : Color.FromArgb(254, 242, 242),
        };
        var iconLbl = new Label
        {
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.MiddleCenter,
            Font = new Font("Segoe UI", 12f, FontStyle.Bold),
            Text = success ? "✓" : "!",
            ForeColor = success ? Color.FromArgb(0, 122, 90) : Color.FromArgb(220, 38, 38),
        };
        iconPanel.Controls.Add(iconLbl);

        var titleLbl = new Label
        {
            AutoSize = false,
            Text = title.ToUpperInvariant(),
            Font = new Font("Segoe UI", 9f, FontStyle.Bold),
            ForeColor = success ? Color.FromArgb(0, 122, 90) : Color.FromArgb(185, 28, 28),
            Location = new Point(62, 14),
            Size = new Size(290, 18),
        };

        var msgLbl = new Label
        {
            AutoSize = false,
            Text = Truncate(message, 110),
            Font = new Font("Segoe UI", 9.5f, FontStyle.Bold),
            ForeColor = Color.FromArgb(29, 28, 29),
            Location = new Point(62, 36),
            Size = new Size(290, 40),
        };

        var closeBtn = new Label
        {
            Text = "×",
            Font = new Font("Segoe UI", 14f, FontStyle.Bold),
            ForeColor = Color.FromArgb(100, 116, 139),
            AutoSize = false,
            TextAlign = ContentAlignment.MiddleCenter,
            Location = new Point(form.Width - 34, 6),
            Size = new Size(26, 26),
            Cursor = Cursors.Hand,
            BorderStyle = BorderStyle.FixedSingle,
            BackColor = Color.White,
        };
        closeBtn.Click += (_, _) => form.Close();

        var progress = new Panel
        {
            Height = 3,
            Dock = DockStyle.Bottom,
            BackColor = success ? Color.FromArgb(0, 122, 90) : Color.FromArgb(220, 38, 38),
        };

        form.Controls.Add(msgLbl);
        form.Controls.Add(titleLbl);
        form.Controls.Add(closeBtn);
        form.Controls.Add(iconPanel);
        form.Controls.Add(accent);
        form.Controls.Add(progress);

        form.Paint += (_, e) =>
        {
            var c = success ? Color.FromArgb(110, 231, 183) : Color.FromArgb(252, 165, 165);
            using var pen = new Pen(c, 1);
            e.Graphics.DrawRectangle(pen, 0, 0, form.Width - 1, form.Height - 1);
        };

        var durationMs = success ? 4500 : 6000;
        var started = Environment.TickCount64;
        var anim = new System.Windows.Forms.Timer { Interval = 40 };
        anim.Tick += (_, _) =>
        {
            var elapsed = Environment.TickCount64 - started;
            var left = Math.Max(0, durationMs - (int)elapsed);
            var pct = left / (double)durationMs;
            progress.Width = Math.Max(2, (int)(form.ClientSize.Width * pct));
            progress.Left = 0;
            if (left <= 0)
            {
                anim.Stop();
                form.Close();
            }
        };

        form.Shown += (_, _) =>
        {
            form.TopMost = true;
            form.BringToFront();
            form.Activate();
            anim.Start();
        };
        form.FormClosed += (_, _) =>
        {
            anim.Dispose();
            if (ReferenceEquals(_openToast, form)) _openToast = null;
            Application.ExitThread();
        };

        Application.Run(form);
    }

    private static string Truncate(string s, int max)
        => string.IsNullOrEmpty(s) ? "" : (s.Length <= max ? s : s[..(max - 1)] + "…");

    private static void Log(string line)
    {
        try
        {
            var dir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "InteractPresence");
            Directory.CreateDirectory(dir);
            File.AppendAllText(
                Path.Combine(dir, "notify.log"),
                $"{DateTime.Now:HH:mm:ss} {line}{Environment.NewLine}");
        }
        catch { /* ignore */ }
    }
}
