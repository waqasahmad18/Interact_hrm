using System.Windows;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Threading;
using MediaColor = System.Windows.Media.Color;

namespace InteractPresence;

/// <summary>
/// HRM-sized toast (~400px, bottom-right). Opaque — no AllowsTransparency
/// (that made the improved UI invisible / fail to show).
/// </summary>
public partial class VerificationResultWindow : Window
{
    private static VerificationResultWindow? _open;
    private readonly DispatcherTimer _autoClose;
    private readonly DispatcherTimer _progressTimer;
    private readonly int _durationMs;
    private DateTime _endsAt;

    public VerificationResultWindow(bool success, string? detail = null, int autoCloseMs = 4000)
    {
        InitializeComponent();
        Opacity = 1;
        Topmost = true;
        WindowStartupLocation = WindowStartupLocation.Manual;
        _durationMs = success ? autoCloseMs : Math.Max(autoCloseMs, 5000);
        _endsAt = DateTime.UtcNow.AddMilliseconds(_durationMs);

        if (success)
        {
            TitleText.Text = "SUCCESS";
            TitleText.Foreground = Brush(0x00, 0x7A, 0x5A);
            BodyText.Text = string.IsNullOrWhiteSpace(detail)
                ? "Verification successful — you are present."
                : detail!;
            AccentBar.Background = Brush(0x00, 0x7A, 0x5A);
            RootBorder.BorderBrush = Brush(0x6E, 0xE7, 0xB7);
            RootBorder.Background = Brush(0xF0, 0xFD, 0xF9);
            Background = RootBorder.Background;
            IconWrap.Background = Brush(0xEC, 0xFD, 0xF5);
            IconText.Text = "✓";
            IconText.Foreground = Brush(0x00, 0x7A, 0x5A);
            ProgressBar.Background = Brush(0x00, 0x7A, 0x5A);
        }
        else
        {
            TitleText.Text = "ERROR";
            TitleText.Foreground = Brush(0xB9, 0x1C, 0x1C);
            BodyText.Text = string.IsNullOrWhiteSpace(detail)
                ? "Verification failed — face did not match."
                : detail!;
            AccentBar.Background = Brush(0xDC, 0x26, 0x26);
            RootBorder.BorderBrush = Brush(0xFC, 0xA5, 0xA5);
            RootBorder.Background = Brush(0xFE, 0xF2, 0xF2);
            Background = RootBorder.Background;
            IconWrap.Background = Brush(0xFE, 0xF2, 0xF2);
            IconText.Text = "!";
            IconText.Foreground = Brush(0xDC, 0x26, 0x26);
            ProgressBar.Background = Brush(0xDC, 0x26, 0x26);
        }

        SourceInitialized += (_, _) => PlaceBottomRight();
        Loaded += (_, _) =>
        {
            PlaceBottomRight();
            Opacity = 1;
            TopmostHelper.ForceToFront(this);
            ProgressBar.Width = Width;
        };

        Closed += (_, _) =>
        {
            try { _progressTimer.Stop(); } catch { /* ignore */ }
            try { _autoClose.Stop(); } catch { /* ignore */ }
            if (ReferenceEquals(_open, this)) _open = null;
        };

        _progressTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(40) };
        _progressTimer.Tick += (_, _) =>
        {
            var left = (_endsAt - DateTime.UtcNow).TotalMilliseconds;
            var pct = Math.Max(0, left / _durationMs);
            ProgressBar.Width = Width * pct;
            if (left <= 0) _progressTimer.Stop();
        };
        _progressTimer.Start();

        _autoClose = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(_durationMs) };
        _autoClose.Tick += (_, _) =>
        {
            _autoClose.Stop();
            try { Close(); } catch { /* ignore */ }
        };
        _autoClose.Start();
    }

    private void PlaceBottomRight()
    {
        try
        {
            var screen = System.Windows.Forms.Screen.FromPoint(
                System.Windows.Forms.Control.MousePosition).WorkingArea;
            Left = screen.Right - Width - 24;
            Top = screen.Bottom - Height - 24;
        }
        catch
        {
            Left = 100;
            Top = 100;
        }
    }

    private void Close_Click(object sender, MouseButtonEventArgs e)
    {
        try { Close(); } catch { /* ignore */ }
    }

    private static SolidColorBrush Brush(byte r, byte g, byte b) =>
        new(MediaColor.FromRgb(r, g, b));

    public static void ShowToast(bool success, string? detail = null)
    {
        void show()
        {
            try
            {
                try { _open?.Close(); } catch { /* ignore */ }
                _open = null;

                var w = new VerificationResultWindow(success, detail);
                _open = w;
                w.Opacity = 1;
                w.Show();
                w.PlaceBottomRight();
                w.Activate();
                TopmostHelper.ForceToFront(w);
            }
            catch
            {
                // Last-resort visible feedback if WPF toast fails
                try
                {
                    HrmStyleToast.Show(success,
                        success ? "SUCCESS" : "ERROR",
                        detail ?? (success
                            ? "Verification successful — you are present."
                            : "Verification failed — face did not match."));
                }
                catch
                {
                    System.Windows.MessageBox.Show(
                        detail ?? (success ? "Verification successful" : "Verification failed"),
                        success ? "SUCCESS" : "ERROR");
                }
            }
        }

        var app = System.Windows.Application.Current;
        if (app?.Dispatcher == null) { show(); return; }
        if (app.Dispatcher.CheckAccess()) show();
        else _ = app.Dispatcher.BeginInvoke(show);
    }
}
