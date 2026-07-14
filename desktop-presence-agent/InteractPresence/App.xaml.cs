using System.Threading;
using System.Windows;

namespace InteractPresence;

public partial class App : System.Windows.Application
{
    private TrayHost? _tray;
    private Mutex? _singleInstance;

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        const string mutexName = "Global\\InteractPresence_SingleInstance_v1";
        _singleInstance = new Mutex(true, mutexName, out var createdNew);
        if (!createdNew)
        {
            System.Windows.MessageBox.Show(
                "Interact Presence is already running in the system tray.",
                "Interact Presence",
                MessageBoxButton.OK,
                MessageBoxImage.Information);
            Shutdown();
            return;
        }

        // No main window chrome — tray-only agent.
        ShutdownMode = ShutdownMode.OnExplicitShutdown;

        var settings = AppSettings.Load();
        AutoStartHelper.EnsureEnabled();

        var api = new HrmApiClient(settings);
        var idle = new IdleDetector();
        var camera = new HrmFacePresenceChecker(settings);
        var controller = new PresenceController(settings, idle, api, camera);

        _tray = new TrayHost(controller, settings);
        _tray.Show();

        controller.Start();
    }

    protected override void OnExit(ExitEventArgs e)
    {
        _tray?.Dispose();
        try { _singleInstance?.ReleaseMutex(); } catch { /* ignore */ }
        _singleInstance?.Dispose();
        base.OnExit(e);
    }
}
