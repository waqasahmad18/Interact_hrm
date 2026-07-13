using System.Windows;

namespace InteractPresence;

public partial class App : System.Windows.Application
{
    private TrayHost? _tray;

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        // No main window chrome — tray-only agent.
        ShutdownMode = ShutdownMode.OnExplicitShutdown;

        var settings = AppSettings.Load();
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
        base.OnExit(e);
    }
}
