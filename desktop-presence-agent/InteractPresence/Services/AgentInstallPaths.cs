using System.Diagnostics;
using System.IO;

namespace InteractPresence;

/// <summary>
/// Single stable install location — updates and auto-start always use this path.
/// Prevents restart loops when running from a dev/build folder.
/// </summary>
internal static class AgentInstallPaths
{
    public static string AppDir =>
        Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "InteractPresence");

    public static string CanonicalExe => Path.Combine(AppDir, "InteractPresence.exe");

    public static string RunningExe =>
        Environment.ProcessPath
        ?? Process.GetCurrentProcess().MainModule?.FileName
        ?? CanonicalExe;

    public static bool IsRunningFromCanonical()
    {
        try
        {
            return string.Equals(
                Path.GetFullPath(RunningExe),
                Path.GetFullPath(CanonicalExe),
                StringComparison.OrdinalIgnoreCase);
        }
        catch
        {
            return false;
        }
    }

    /// <summary>
    /// Copy current exe to LocalAppData and launch it. Caller should exit when true.
    /// </summary>
    public static bool TryMigrateToCanonicalInstall()
    {
        try
        {
            var current = RunningExe;
            if (string.IsNullOrWhiteSpace(current) || !File.Exists(current)) return false;
            if (IsRunningFromCanonical()) return false;

            Directory.CreateDirectory(AppDir);
            var canonical = CanonicalExe;
            var shouldCopy = !File.Exists(canonical) || IsNewerFile(current, canonical);
            if (shouldCopy)
                File.Copy(current, canonical, overwrite: true);

            Process.Start(new ProcessStartInfo
            {
                FileName = canonical,
                WorkingDirectory = AppDir,
                UseShellExecute = true,
            });
            return true;
        }
        catch
        {
            return false;
        }
    }

    public static string ResolveUpdateTargetExe()
    {
        if (File.Exists(CanonicalExe)) return CanonicalExe;
        var running = RunningExe;
        if (!string.IsNullOrWhiteSpace(running) && File.Exists(running)) return running;
        return CanonicalExe;
    }

    private static bool IsNewerFile(string source, string target)
    {
        try
        {
            var s = ReadVersion(source);
            var t = ReadVersion(target);
            if (Version.TryParse(s, out var sv) && Version.TryParse(t, out var tv))
                return sv > tv;
        }
        catch { /* ignore */ }
        try
        {
            return File.GetLastWriteTimeUtc(source) > File.GetLastWriteTimeUtc(target);
        }
        catch
        {
            return true;
        }
    }

    private static string ReadVersion(string path)
    {
        var vi = FileVersionInfo.GetVersionInfo(path);
        var raw = (vi.FileVersion ?? vi.ProductVersion ?? "0.0.0").Trim();
        return raw.Length > 0 ? raw : "0.0.0";
    }
}
