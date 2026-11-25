using System.Diagnostics;
using System.IO;
using System.Text;
using System.Text.Json;

namespace InteractGuard;

/// <summary>
/// Calls local faster-whisper sidecar (Python) for offline EN/Urdu/Hindi STT.
/// </summary>
public sealed class SttSidecarClient
{
    private readonly AppSettings _settings;

    public SttSidecarClient(AppSettings settings)
    {
        _settings = settings;
    }

    public sealed class SttResult
    {
        public bool Ok { get; init; }
        public string Text { get; init; } = "";
        public string? Language { get; init; }
        public string? Error { get; init; }
    }

    public async Task<SttResult> TranscribeAsync(string wavPath, CancellationToken ct)
    {
        var python = ResolvePython();
        var script = ResolveScript();
        if (string.IsNullOrWhiteSpace(python) || string.IsNullOrWhiteSpace(script))
        {
            return new SttResult
            {
                Ok = false,
                Error = "STT sidecar not configured (GUARD_STT_PYTHON / stt-sidecar)",
            };
        }

        var psi = new ProcessStartInfo
        {
            FileName = python,
            Arguments = $"\"{script}\" --wav \"{wavPath}\" --model {_settings.SttModelSize} --device cpu --compute-type int8",
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true,
            StandardOutputEncoding = Encoding.UTF8,
        };

        using var proc = new Process { StartInfo = psi };
        try
        {
            if (!proc.Start())
                return new SttResult { Ok = false, Error = "failed to start STT python" };

            var stdoutTask = proc.StandardOutput.ReadToEndAsync(ct);
            var stderrTask = proc.StandardError.ReadToEndAsync(ct);
            await proc.WaitForExitAsync(ct).ConfigureAwait(false);
            var stdout = (await stdoutTask.ConfigureAwait(false)).Trim();
            var stderr = (await stderrTask.ConfigureAwait(false)).Trim();

            if (string.IsNullOrWhiteSpace(stdout))
            {
                return new SttResult
                {
                    Ok = false,
                    Error = string.IsNullOrWhiteSpace(stderr) ? "empty STT output" : stderr,
                };
            }

            using var doc = JsonDocument.Parse(stdout);
            var root = doc.RootElement;
            var ok = root.TryGetProperty("ok", out var okEl) && okEl.ValueKind == JsonValueKind.True;
            var text = root.TryGetProperty("text", out var textEl) ? textEl.GetString() ?? "" : "";
            var lang = root.TryGetProperty("language", out var langEl) ? langEl.GetString() : null;
            var err = root.TryGetProperty("error", out var errEl) ? errEl.GetString() : null;
            return new SttResult
            {
                Ok = ok,
                Text = text.Trim(),
                Language = lang,
                Error = ok ? null : (err ?? stderr ?? "STT failed"),
            };
        }
        catch (Exception ex)
        {
            return new SttResult { Ok = false, Error = ex.Message };
        }
    }

    private string? ResolvePython()
    {
        var env = Environment.GetEnvironmentVariable("GUARD_STT_PYTHON");
        if (!string.IsNullOrWhiteSpace(env) && File.Exists(env)) return env;

        // Prefer sidecar venv next to agent install / repo.
        var candidates = new[]
        {
            Path.Combine(AppContext.BaseDirectory, "stt-sidecar", ".venv", "Scripts", "python.exe"),
            Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "stt-sidecar", ".venv", "Scripts", "python.exe")),
            Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "stt-sidecar", ".venv", "Scripts", "python.exe")),
        };
        foreach (var c in candidates)
        {
            try
            {
                if (File.Exists(c)) return c;
            }
            catch { /* ignore */ }
        }
        return null;
    }

    private string? ResolveScript()
    {
        var env = Environment.GetEnvironmentVariable("GUARD_STT_SCRIPT");
        if (!string.IsNullOrWhiteSpace(env) && File.Exists(env)) return env;

        var candidates = new[]
        {
            Path.Combine(AppContext.BaseDirectory, "stt-sidecar", "transcribe.py"),
            Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "stt-sidecar", "transcribe.py")),
            Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "stt-sidecar", "transcribe.py")),
        };
        foreach (var c in candidates)
        {
            try
            {
                if (File.Exists(c)) return c;
            }
            catch { /* ignore */ }
        }
        return null;
    }
}
