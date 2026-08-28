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
            Shutdown();
            return;
        }

        ShutdownMode = ShutdownMode.OnExplicitShutdown;

        // Always run from stable LocalAppData path (prevents dev-folder update loops).
        if (AgentInstallPaths.TryMigrateToCanonicalInstall())
        {
            Shutdown();
            return;
        }

        var settings = AppSettings.Load();
        try
        {
            var api = new HrmApiClient(settings);
            api.TryApplyPresenceSettingsAsync(settings).GetAwaiter().GetResult();
            api.TrySendHeartbeatAsync(settings).GetAwaiter().GetResult();
        }
        catch
        {
            /* offline — continue with local settings */
        }

        if (settings.AgentsRetired)
        {
            AutoStartHelper.TryDisable();
            Shutdown();
            return;
        }

        AutoStartHelper.EnsureEnabled();

        var apiClient = new HrmApiClient(settings);
        var idle = new IdleDetector();
        var camera = new HrmFacePresenceChecker(settings);
        var controller = new PresenceController(settings, idle, apiClient, camera);

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
