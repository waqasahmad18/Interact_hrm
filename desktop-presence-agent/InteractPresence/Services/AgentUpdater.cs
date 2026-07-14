using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Reflection;
using System.Text.Json;

namespace InteractPresence;

/// <summary>
/// Polls HRM for a newer InteractPresence.exe and self-updates via a short cmd script.
/// </summary>
internal static class AgentUpdater
{
    private static readonly HttpClient Http = CreateHttp();
    private static DateTime _lastCheckUtc = DateTime.MinValue;
    private static bool _updateInFlight;

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
            var v = Assembly.GetExecutingAssembly().GetName().Version;
            if (v == null) return "0.0.0";
            return $"{v.Major}.{v.Minor}.{v.Build}";
        }
    }

    public static async Task CheckAndUpdateAsync(
        AppSettings settings,
        CancellationToken ct = default,
        bool force = false)
    {
        if (_updateInFlight) return;
        if (!force && (DateTime.UtcNow - _lastCheckUtc).TotalMinutes < 10) return;
        _lastCheckUtc = DateTime.UtcNow;

        var baseUrl = (settings.HrmBaseUrl ?? "").TrimEnd('/');
        if (string.IsNullOrWhiteSpace(baseUrl)) return;

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
            var remoteVer = root.TryGetProperty("version", out var verEl)
                ? (verEl.GetString() ?? "")
                : "";
            if (!IsNewer(remoteVer, CurrentVersion)) return;

            var downloadPath = root.TryGetProperty("downloadPath", out var dp)
                ? (dp.GetString() ?? "/api/presence-agent/download")
                : "/api/presence-agent/download";
            if (!downloadPath.StartsWith('/')) downloadPath = "/" + downloadPath;

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

    private static async Task DownloadAndApplyAsync(string url, string version, CancellationToken ct)
    {
        var exe = Environment.ProcessPath
                   ?? Process.GetCurrentProcess().MainModule?.FileName;
        if (string.IsNullOrWhiteSpace(exe) || !File.Exists(exe))
        {
            _updateInFlight = false;
            return;
        }

        var dir = Path.GetDirectoryName(exe)!;
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

        // cmd waits, replaces locked exe after we exit, then restarts
        var bat = $"""
@echo off
timeout /t 2 /nobreak >nul
copy /y "{newPath}" "{exe}" >nul
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
}
