using System.IO;
using NAudio.Wave;

namespace InteractGuard;

/// <summary>
/// Always-on mic capture → offline Whisper STT → HRM policy ticket when sensitive words match.
/// </summary>
public sealed class AudioWatchService : IDisposable
{
    private readonly AppSettings _settings;
    private readonly HrmClient _hrm;
    private readonly SttSidecarClient _stt;
    private readonly object _gate = new();
    private CancellationTokenSource? _loopCts;
    private Task? _loopTask;
    private Action<string>? _setStatus;
    private bool _enabled;

    public AudioWatchService(AppSettings settings, HrmClient hrm)
    {
        _settings = settings;
        _hrm = hrm;
        _stt = new SttSidecarClient(settings);
    }

    public void BindUi(Action<string> setStatus) => _setStatus = setStatus;

    public void SyncFromSettings()
    {
        var want = _settings.AudioWatchEnabled && !string.IsNullOrWhiteSpace(_settings.EmployeeId);
        if (want == _enabled) return;
        if (want) Start();
        else Stop();
    }

    public void Start()
    {
        lock (_gate)
        {
            if (_enabled) return;
            _enabled = true;
            _loopCts = new CancellationTokenSource();
            _loopTask = Task.Run(() => LoopAsync(_loopCts.Token));
            _setStatus?.Invoke("Audio watch ON — mic → Whisper small");
        }
    }

    public void Stop()
    {
        lock (_gate)
        {
            if (!_enabled) return;
            _enabled = false;
            try { _loopCts?.Cancel(); } catch { /* ignore */ }
            _loopCts?.Dispose();
            _loopCts = null;
            _loopTask = null;
            _setStatus?.Invoke("Audio watch OFF");
        }
    }

    private async Task LoopAsync(CancellationToken ct)
    {
        var clipSec = Math.Clamp(_settings.AudioClipSeconds, 15, 45);
        while (!ct.IsCancellationRequested)
        {
            string? wavPath = null;
            try
            {
                wavPath = await RecordClipAsync(clipSec, ct).ConfigureAwait(false);
                if (string.IsNullOrWhiteSpace(wavPath) || !File.Exists(wavPath))
                {
                    await Task.Delay(2000, ct).ConfigureAwait(false);
                    continue;
                }

                // Skip near-silent clips (file tiny / no real speech energy)
                var fi = new FileInfo(wavPath);
                if (fi.Length < 16_000)
                {
                    TryDelete(wavPath);
                    continue;
                }

                var stt = await _stt.TranscribeAsync(wavPath, ct).ConfigureAwait(false);
                if (!stt.Ok)
                {
                    _setStatus?.Invoke($"STT error: {stt.Error}");
                    TryDelete(wavPath);
                    await Task.Delay(3000, ct).ConfigureAwait(false);
                    continue;
                }

                if (string.IsNullOrWhiteSpace(stt.Text))
                {
                    TryDelete(wavPath);
                    continue;
                }

                _setStatus?.Invoke($"Audio STT ({stt.Language ?? "?"}): {Trim(stt.Text, 48)}");
                await _hrm.PostAudioAlertAsync(wavPath, stt.Text, stt.Language, ct).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _setStatus?.Invoke($"Audio watch: {ex.Message}");
                try { await Task.Delay(4000, ct).ConfigureAwait(false); } catch { /* ignore */ }
            }
            finally
            {
                // Keep local clip only briefly; HRM stores evidence on hit.
                if (!string.IsNullOrWhiteSpace(wavPath))
                    TryDelete(wavPath);
            }
        }
    }

    private async Task<string?> RecordClipAsync(int seconds, CancellationToken ct)
    {
        var dir = Path.Combine(AppSettings.DataDir, "pending-audio");
        Directory.CreateDirectory(dir);
        var path = Path.Combine(dir, $"clip_{DateTime.UtcNow:yyyyMMdd_HHmmss_fff}.wav");

        WaveInEvent? waveIn = null;
        WaveFileWriter? writer = null;
        try
        {
            waveIn = new WaveInEvent
            {
                WaveFormat = new WaveFormat(16000, 1),
                BufferMilliseconds = 50,
            };
            writer = new WaveFileWriter(path, waveIn.WaveFormat);
            var writeGate = new object();
            waveIn.DataAvailable += (_, e) =>
            {
                lock (writeGate)
                {
                    writer?.Write(e.Buffer, 0, e.BytesRecorded);
                }
            };

            waveIn.StartRecording();
            await Task.Delay(TimeSpan.FromSeconds(seconds), ct).ConfigureAwait(false);
            waveIn.StopRecording();
            await Task.Delay(80, CancellationToken.None).ConfigureAwait(false);
            return path;
        }
        catch (Exception ex)
        {
            _setStatus?.Invoke($"Mic capture failed: {ex.Message}");
            TryDelete(path);
            return null;
        }
        finally
        {
            try { waveIn?.Dispose(); } catch { /* ignore */ }
            try { writer?.Dispose(); } catch { /* ignore */ }
        }
    }

    private static void TryDelete(string path)
    {
        try { if (File.Exists(path)) File.Delete(path); } catch { /* ignore */ }
    }

    private static string Trim(string s, int n)
        => s.Length <= n ? s : s[..n] + "…";

    public void Dispose() => Stop();
}
