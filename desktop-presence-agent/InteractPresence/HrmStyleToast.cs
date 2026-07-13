using System.Drawing;
using System.Windows.Forms;

namespace InteractPresence;

/// <summary>
/// HRM-style green/red toast (top-right). WinForms so it reliably shows over
/// Cursor / any app even with a tray-only WPF host.
/// </summary>
internal static class HrmStyleToast
{
    public static void ShowSuccess(string message = "You are present.")
        => Show(true, "Verification Successful", message);

    public static void ShowFailed(string message = "Face did not match enrollment.")
        => Show(false, "Verification Failed", message);

    public static void Show(bool success, string title, string message, int durationMs = 6000)
    {
        var screen = Screen.FromPoint(Control.MousePosition).WorkingArea;
        var form = new Form
        {
            FormBorderStyle = FormBorderStyle.None,
            StartPosition = FormStartPosition.Manual,
            ShowInTaskbar = true,
            TopMost = true,
            Width = 400,
            Height = 96,
            BackColor = success ? Color.FromArgb(240, 253, 244) : Color.FromArgb(254, 242, 242),
        };
        form.Location = new Point(screen.Right - form.Width - 24, screen.Bottom - form.Height - 24);

        var accent = new Panel
        {
            Dock = DockStyle.Left,
            Width = 6,
            BackColor = success ? Color.FromArgb(0, 122, 90) : Color.FromArgb(220, 38, 38),
        };

        var titleLbl = new Label
        {
            AutoSize = false,
            Text = title,
            Font = new Font("Segoe UI", 12f, FontStyle.Bold),
            ForeColor = success ? Color.FromArgb(0, 122, 90) : Color.FromArgb(220, 38, 38),
            Location = new Point(20, 14),
            Size = new Size(340, 24),
        };

        var msgLbl = new Label
        {
            AutoSize = false,
            Text = string.IsNullOrWhiteSpace(message) ? "" : Truncate(message, 120),
            Font = new Font("Segoe UI", 9.5f, FontStyle.Regular),
            ForeColor = Color.FromArgb(51, 65, 85),
            Location = new Point(20, 42),
            Size = new Size(340, 40),
        };

        var closeBtn = new Label
        {
            Text = "×",
            Font = new Font("Segoe UI", 14f, FontStyle.Bold),
            ForeColor = Color.FromArgb(148, 163, 184),
            AutoSize = false,
            TextAlign = ContentAlignment.MiddleCenter,
            Location = new Point(form.Width - 36, 4),
            Size = new Size(28, 28),
            Cursor = Cursors.Hand,
        };
        closeBtn.Click += (_, _) => { try { form.Close(); } catch { /* ignore */ } };

        form.Controls.Add(msgLbl);
        form.Controls.Add(titleLbl);
        form.Controls.Add(closeBtn);
        form.Controls.Add(accent);

        form.Paint += (_, e) =>
        {
            var c = success ? Color.FromArgb(167, 243, 208) : Color.FromArgb(252, 165, 165);
            using var pen = new Pen(c, 1);
            e.Graphics.DrawRectangle(pen, 0, 0, form.Width - 1, form.Height - 1);
        };

        form.Shown += (_, _) =>
        {
            form.TopMost = true;
            form.BringToFront();
            form.Activate();
        };

        var timer = new System.Windows.Forms.Timer { Interval = durationMs };
        timer.Tick += (_, _) =>
        {
            timer.Stop();
            try { form.Close(); } catch { /* ignore */ }
        };
        form.FormClosed += (_, _) => timer.Dispose();
        timer.Start();

        form.Show();
        form.TopMost = true;
        form.BringToFront();
    }

    private static string Truncate(string s, int max)
        => s.Length <= max ? s : s[..(max - 1)] + "…";
}
