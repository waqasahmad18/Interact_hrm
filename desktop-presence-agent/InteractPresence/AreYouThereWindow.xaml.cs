using System.Windows;

namespace InteractPresence;

public partial class AreYouThereWindow : Window
{
    public event Action? ImHereClicked;

    public AreYouThereWindow(int initialSeconds, string? failDetail = null)
    {
        InitializeComponent();
        Topmost = true;
        ShowInTaskbar = true;
        WindowStartupLocation = WindowStartupLocation.CenterScreen;
        UpdateCountdown(initialSeconds);

        if (!string.IsNullOrWhiteSpace(failDetail))
            DetailText.Text = $"Check detail: {failDetail}";

        Loaded += (_, _) =>
        {
            try
            {
                var formsScreen = System.Windows.Forms.Screen.FromPoint(
                    System.Windows.Forms.Control.MousePosition);
                Left = formsScreen.WorkingArea.Left + (formsScreen.WorkingArea.Width - Width) / 2;
                Top = formsScreen.WorkingArea.Top + (formsScreen.WorkingArea.Height - Height) / 2;
            }
            catch { /* center default */ }

            TopmostHelper.ForceToFront(this);
        };

        SourceInitialized += (_, _) => TopmostHelper.ForceToFront(this);
    }

    public void UpdateCountdown(int secondsLeft)
    {
        if (!Dispatcher.CheckAccess())
        {
            Dispatcher.Invoke(() => UpdateCountdown(secondsLeft));
            return;
        }
        var m = Math.Max(0, secondsLeft) / 60;
        var s = Math.Max(0, secondsLeft) % 60;
        CountdownText.Text = $"{m}:{s:D2}";
    }

    private void ImHere_Click(object sender, RoutedEventArgs e)
    {
        ImHereClicked?.Invoke();
    }
}
