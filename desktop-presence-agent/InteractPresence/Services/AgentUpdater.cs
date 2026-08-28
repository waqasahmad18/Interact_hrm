using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Reflection;
using System.Text.Json;

namespace InteractPresence;

/// <summary>
/// Manual + guarded self-update. Automatic polling is disabled — admin publishes;
/// users update via tray "Check for updates" or one controlled background check/day.
/// </summary>
internal static class AgentUpdater
{
    private static readonly HttpClient Http = CreateHttp();
    private static bool _updateInFlight;

    private static string UpdateStatePath =>
        Path.Combine(AgentInstallPaths.AppDir, "update-state.json");

    private static HttpClient CreateHttp()
    {
        var handler = new HttpClientHandler
        {
            ServerCertificateCustomValidationCallback =
                HttpClientHandler.DangerousAcceptAnyServerCertificateValidator,
        };
        return new HttpClient(handler) { Timeout = TimeSpan.FromMinutes(5) };
    }

    public static string CurrentVersion
    {
        get
        {
            var exe = AgentInstallPaths.ResolveUpdateTargetExe();
            if (File.Exists(exe))
            {
                var fromFile = ReadExeFileVersion(exe);
                if (!string.IsNullOrWhiteSpace(fromFile)) return fromFile!;
            }

            var v = Assembly.GetExecutingAssembly().GetName().Version;
            if (v == null) return "0.0.0";
            return $"{v.Major}.{v.Minor}.{v.Build}";
        }
    }

    /// <param name="force">true = tray admin "Check for updates". false = ignored (no auto-update).</param>
    public static async Task CheckAndUpdateAsync(
        AppSettings settings,
        CancellationToken ct = default,
        bool force = false)
    {
        // Permanent fix: never auto-update from background sync / heartbeat.
        if (!force) return;
        if (_updateInFlight) return;

        var baseUrl = (settings.HrmBaseUrl ?? "").TrimEnd('/');
        if (string.IsNullOrWhiteSpace(baseUrl)) return;

        var state = LoadUpdateState();
        var now = DateTime.UtcNow;
        if (state.LastManualCheckUtc.HasValue &&
            (now - state.LastManualCheckUtc.Value).TotalMinutes < 2)
        {
            return;
        }
        state.LastManualCheckUtc = now;
        SaveUpdateState(state);

        try
        {
            using var res = await Http.GetAsync($"{baseUrl}/api/presence-agent/version", ct)
                .ConfigureAwait(false);
            if (!res.IsSuccessStatusCode) return;
            var json = await res.Content.ReadAsStringAsync(ct).ConfigureAwait(false);
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            if (!root.TryGetProperty("success", out var ok) || !ok.GetBoolean()) return;
            if (!root.TryGetProperty("hasBinary", out var has) || !has.GetBoolean()) return;
            var remoteVer = Normalize(root.TryGetProperty("version", out var verEl)
                ? (verEl.GetString() ?? "")
                : "");
            var localVer = Normalize(CurrentVersion);

            if (!IsNewer(remoteVer, localVer))
            {
                DesktopNotify.Success($"Already on latest agent ({localVer}).");
                ClearPendingForVersion(state, remoteVer);
                return;
            }

            if (HasAlreadyAttemptedVersion(state, remoteVer))
            {
                DesktopNotify.Failed(
                    $"Update to {remoteVer} already attempted — still on {localVer}. " +
                    "Republish matching exe from admin or reinstall manually.");
                return;
            }

            var downloadPath = root.TryGetProperty("downloadPath", out var dp)
                ? (dp.GetString() ?? "/api/presence-agent/download")
                : "/api/presence-agent/download";
            if (!downloadPath.StartsWith('/')) downloadPath = "/" + downloadPath;

            MarkVersionAttempted(state, remoteVer);
            _updateInFlight = true;
            DesktopNotify.Success($"Updating agent to {remoteVer}…");
            await DownloadAndApplyAsync($"{baseUrl}{downloadPath}", remoteVer, ct)
                .ConfigureAwait(false);
        }
        catch
        {
            _updateInFlight = false;
        }
    }

    private static bool HasAlreadyAttemptedVersion(UpdateState state, string remoteVer) =>
        string.Equals(state.LastAppliedVersion, remoteVer, StringComparison.OrdinalIgnoreCase);

    private static void MarkVersionAttempted(UpdateState state, string remoteVer)
    {
        state.LastAppliedVersion = remoteVer;
        state.LastAttemptUtc = DateTime.UtcNow;
        SaveUpdateState(state);
    }

    private static void ClearPendingForVersion(UpdateState state, string remoteVer)
    {
        state.LastAppliedVersion = remoteVer;
        state.LastAttemptUtc = null;
        SaveUpdateState(state);
    }

    private static bool IsNewer(string remote, string local)
    {
        if (!Version.TryParse(Normalize(remote), out var r)) return false;
        if (!Version.TryParse(Normalize(local), out var l)) return true;
        return r > l;
    }

    private static string Normalize(string v)
    {
        var parts = (v ?? "0").Trim().Split('.');
        while (parts.Length < 3) Array.Resize(ref parts, parts.Length + 1);
        for (var i = 0; i < parts.Length; i++)
            if (string.IsNullOrWhiteSpace(parts[i])) parts[i] = "0";
        return string.Join(".", parts.Take(4));
    }

    private static string? ReadExeFileVersion(string path)
    {
        try
        {
            var vi = FileVersionInfo.GetVersionInfo(path);
            var raw = (vi.FileVersion ?? vi.ProductVersion ?? "").Trim();
            if (raw.Length == 0) return null;
            return Normalize(raw);
        }
        catch
        {
            return null;
        }
    }

    private static async Task DownloadAndApplyAsync(string url, string version, CancellationToken ct)
    {
        Directory.CreateDirectory(AgentInstallPaths.AppDir);
        var exe = AgentInstallPaths.CanonicalExe;
        var dir = AgentInstallPaths.AppDir;
        var newPath = Path.Combine(dir, "InteractPresence_new.exe");
        var batPath = Path.Combine(dir, "apply-update.cmd");

        using (var res = await Http.GetAsync(url, ct).ConfigureAwait(false))
        {
            if (!res.IsSuccessStatusCode)
            {
                _updateInFlight = false;
                DesktopNotify.Failed("Agent update download failed.");
                return;
            }
            await using var fs = File.Create(newPath);
            await res.Content.CopyToAsync(fs, ct).ConfigureAwait(false);
        }

        var fi = new FileInfo(newPath);
        if (fi.Length < 1024)
        {
            try { File.Delete(newPath); } catch { /* ignore */ }
            _updateInFlight = false;
            DesktopNotify.Failed("Agent update file invalid.");
            return;
        }

        var downloadedVer = ReadExeFileVersion(newPath);
        if (downloadedVer == null || !IsNewer(downloadedVer, CurrentVersion))
        {
            try { File.Delete(newPath); } catch { /* ignore */ }
            _updateInFlight = false;
            DesktopNotify.Failed("Downloaded file is not newer than this install.");
            return;
        }

        if (!string.Equals(Normalize(version), Normalize(downloadedVer), StringComparison.OrdinalIgnoreCase))
        {
            try { File.Delete(newPath); } catch { /* ignore */ }
            _updateInFlight = false;
            DesktopNotify.Failed(
                $"Published version {version} does not match uploaded exe ({downloadedVer}).");
            return;
        }

        var bat = $"""
@echo off
ping 127.0.0.1 -n 6 >nul
:retry
copy /y "{newPath}" "{exe}"
if errorlevel 1 (
  ping 127.0.0.1 -n 3 >nul
  goto retry
)
if exist "{newPath}" del /f /q "{newPath}"
start "" "{exe}"
del /f /q "%~f0"
""";
        await File.WriteAllTextAsync(batPath, bat, ct).ConfigureAwait(false);

        Process.Start(new ProcessStartInfo
        {
            FileName = batPath,
            WorkingDirectory = dir,
            UseShellExecute = true,
            CreateNoWindow = true,
            WindowStyle = ProcessWindowStyle.Hidden,
        });

        DesktopNotify.Success($"Restarting for update {version}…");
        System.Windows.Application.Current?.Dispatcher.Invoke(() =>
        {
            System.Windows.Application.Current.Shutdown();
        });
    }

    private static UpdateState LoadUpdateState()
    {
        try
        {
            if (!File.Exists(UpdateStatePath)) return new UpdateState();
            var json = File.ReadAllText(UpdateStatePath);
            return JsonSerializer.Deserialize<UpdateState>(json) ?? new UpdateState();
        }
        catch
        {
            return new UpdateState();
        }
    }

    private static void SaveUpdateState(UpdateState state)
    {
        try
        {
            Directory.CreateDirectory(AgentInstallPaths.AppDir);
            var json = JsonSerializer.Serialize(state, new JsonSerializerOptions { WriteIndented = true });
            File.WriteAllText(UpdateStatePath, json);
        }
        catch
        {
            /* ignore */
        }
    }

    private sealed class UpdateState
    {
        public string? LastAppliedVersion { get; set; }
        public DateTime? LastAttemptUtc { get; set; }
        public DateTime? LastManualCheckUtc { get; set; }
    }
}
