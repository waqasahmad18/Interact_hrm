using System.IO;
using NAudio.Wave;

namespace InteractGuard;

/// <summary>
/// Timed mic clips → offline Whisper STT → HRM policy ticket when sensitive words match.
/// Mic is only open during clipSeconds; then gapSeconds quiet (reduces tray mic blink).
/// Windows still shows the privacy mic icon while any clip is capturing — that is OS-level.
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
    private bool _micOpen;

    public AudioWatchService(AppSettings settings, HrmClient hrm)
    {
        _settings = settings;
        _hrm = hrm;
        _stt = new SttSidecarClient(settings);
    }

    public void BindUi(Action<string> setStatus) => _setStatus = setStatus;

    /// <summary>True only while the mic device is actually capturing (not during gap).</summary>
    public bool IsRecording
    {
        get { lock (_gate) return _enabled && _micOpen; }
    }

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
            _setStatus?.Invoke(
                $"Audio watch ON — listen {_settings.AudioClipSeconds}s / gap {_settings.AudioGapSeconds}s");
        }
    }

    public void Stop()
    {
        lock (_gate)
        {
            if (!_enabled) return;
            _enabled = false;
            _micOpen = false;
            try { _loopCts?.Cancel(); } catch { /* ignore */ }
            _loopCts?.Dispose();
            _loopCts = null;
            _loopTask = null;
            _setStatus?.Invoke("Audio watch OFF");
        }
    }

    private async Task LoopAsync(CancellationToken ct)
    {
        // Drain leftovers from previous runs (STT hang / crash) so Clips tab catches up.
        try { await UploadPendingAsync(ct).ConfigureAwait(false); }
        catch (Exception ex) { Log($"drain: {ex.Message}"); }

        while (!ct.IsCancellationRequested)
        {
            string? wavPath = null;
            var clipSec = Math.Clamp(_settings.AudioClipSeconds, 10, 60);
            var gapSec = Math.Clamp(_settings.AudioGapSeconds, 0, 3600);
            try
            {
                wavPath = await RecordClipAsync(clipSec, ct).ConfigureAwait(false);
                if (string.IsNullOrWhiteSpace(wavPath) || !File.Exists(wavPath))
                {
                    await Task.Delay(Math.Max(2000, gapSec * 1000), ct).ConfigureAwait(false);
                    continue;
                }

                var fi = new FileInfo(wavPath);
                // Keep short/quiet clips too — admin needs them for mic quality checks.
                if (fi.Length < 4_000)
                {
                    TryDelete(wavPath);
                    wavPath = null;
                    if (gapSec > 0)
                        await Task.Delay(TimeSpan.FromSeconds(gapSec), ct).ConfigureAwait(false);
                    continue;
                }

                await UploadOneAsync(wavPath, ct).ConfigureAwait(false);
                wavPath = null; // UploadOne deletes or moves the file

                if (gapSec > 0)
                {
                    _setStatus?.Invoke($"Audio gap {gapSec}s (mic idle)");
                    await Task.Delay(TimeSpan.FromSeconds(gapSec), ct).ConfigureAwait(false);
                }
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                Log($"loop: {ex.Message}");
                _setStatus?.Invoke($"Audio watch: {ex.Message}");
                try { await Task.Delay(4000, ct).ConfigureAwait(false); } catch { /* ignore */ }
            }
            finally
            {
                if (!string.IsNullOrWhiteSpace(wavPath))
                    TryDelete(wavPath);
            }
        }
    }

    private async Task UploadPendingAsync(CancellationToken ct)
    {
        var dir = Path.Combine(AppSettings.DataDir, "pending-audio");
        if (!Directory.Exists(dir)) return;
        foreach (var path in Directory.GetFiles(dir, "clip_*.wav")
                     .OrderBy(f => f)
                     .Take(30))
        {
            ct.ThrowIfCancellationRequested();
            try
            {
                var fi = new FileInfo(path);
                if (!fi.Exists || fi.Length < 4_000)
                {
                    TryDelete(path);
                    continue;
                }
                // Skip files still being written (touched in last 2s).
                if (fi.LastWriteTimeUtc > DateTime.UtcNow.AddSeconds(-2))
                    continue;
                await UploadOneAsync(path, ct).ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                Log($"pending {Path.GetFileName(path)}: {ex.Message}");
            }
        }
    }

    /// <summary>
    /// Upload clip to HRM immediately, then STT in background (never block next record).
    /// </summary>
    private async Task UploadOneAsync(string wavPath, CancellationToken ct)
    {
        var fi = new FileInfo(wavPath);
        var kb = Math.Max(1, fi.Length / 1024);
        _setStatus?.Invoke($"Uploading audio clip ({kb} KB)…");
        Log($"upload start {fi.Name} {kb}KB");

        HrmClient.AudioUploadResult up;
        try
        {
            up = await _hrm.PostAudioAlertAsync(wavPath, "", null, ct).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            Log($"upload throw: {ex.Message}");
            _setStatus?.Invoke($"Audio upload failed: {ex.Message}");
            return;
        }

        Log(up.Ok
            ? $"upload ok clip_id={up.ClipId} {up.Detail}"
            : $"upload fail {up.Detail}");
        _setStatus?.Invoke(up.Ok
            ? $"Audio clip uploaded ({kb} KB)"
            : $"Audio upload failed: {up.Detail}");

        if (!up.Ok)
            return;

        // Copy for STT, delete original so pending-audio does not pile up / lock.
        string? sttCopy = null;
        try
        {
            var sttDir = Path.Combine(AppSettings.DataDir, "stt-work");
            Directory.CreateDirectory(sttDir);
            sttCopy = Path.Combine(sttDir, Path.GetFileName(wavPath));
            File.Copy(wavPath, sttCopy, overwrite: true);
        }
        catch (Exception ex)
        {
            Log($"stt copy: {ex.Message}");
        }
        TryDelete(wavPath);

        if (string.IsNullOrWhiteSpace(sttCopy))
            return;

        var clipId = up.ClipId;
        var copy = sttCopy;
        _ = Task.Run(async () =>
        {
            try
            {
                // Cold model load + Urdu/Hindi can exceed 90s on CPU.
                using var sttCts = new CancellationTokenSource(TimeSpan.FromSeconds(240));
                var stt = await _stt.TranscribeAsync(copy, sttCts.Token).ConfigureAwait(false);
                if (stt.Ok && !string.IsNullOrWhiteSpace(stt.Text))
                {
                    _setStatus?.Invoke(
                        $"Audio STT ({stt.Language ?? "?"}): {Trim(stt.Text, 48)}");
                    if (clipId is > 0)
                    {
                        await _hrm.PatchAudioClipTranscriptAsync(
                                clipId.Value, stt.Text, stt.Language, CancellationToken.None)
                            .ConfigureAwait(false);
                        Log($"stt ok clip_id={clipId} lang={stt.Language} chars={stt.Text.Length}");
                    }
                }
                else if (stt.Ok)
                {
                    Log($"stt empty clip_id={clipId} lang={stt.Language}");
                }
                else
                {
                    Log($"stt err: {stt.Error}");
                }
            }
            catch (Exception ex)
            {
                Log($"stt bg: {ex.Message}");
            }
            finally
            {
                TryDelete(copy);
            }
        });
    }

    private static void Log(string message)
    {
        try
        {
            var path = Path.Combine(AppSettings.DataDir, "audio-watch.log");
            File.AppendAllText(
                path,
                $"{DateTime.Now:yyyy-MM-dd HH:mm:ss} {message}{Environment.NewLine}");
        }
        catch { /* ignore */ }
    }

    private async Task<string?> RecordClipAsync(int seconds, CancellationToken ct)
    {
        var dir = Path.Combine(AppSettings.DataDir, "pending-audio");
        Directory.CreateDirectory(dir);
        var path = Path.Combine(dir, $"clip_{DateTime.UtcNow:yyyyMMdd_HHmmss_fff}.wav");

        // Raw 48 kHz PCM — no DSP (gates/AGC caused chop + distortion).
        const int sampleRate = 48000;
        WaveInEvent? waveIn = null;
        WaveFileWriter? writer = null;
        try
        {
            var device = PickPreferredCaptureDevice();
            waveIn = new WaveInEvent
            {
                DeviceNumber = device.Number,
                WaveFormat = new WaveFormat(sampleRate, 16, 1),
                // Larger buffer = fewer dropouts under CPU load (was 20ms → choppy).
                BufferMilliseconds = 100,
                NumberOfBuffers = 4,
            };
            Log($"mic device [{device.Number}] {device.Name}");
            writer = new WaveFileWriter(path, waveIn.WaveFormat);
            var writeGate = new object();
            waveIn.DataAvailable += (_, e) =>
            {
                if (e.BytesRecorded < 2) return;
                lock (writeGate)
                {
                    writer?.Write(e.Buffer, 0, e.BytesRecorded);
                }
            };
            waveIn.RecordingStopped += (_, e) =>
            {
                if (e.Exception != null)
                    Log($"mic stopped err: {e.Exception.Message}");
            };

            lock (_gate) _micOpen = true;
            waveIn.StartRecording();
            await Task.Delay(TimeSpan.FromSeconds(seconds), ct).ConfigureAwait(false);
            waveIn.StopRecording();
            await Task.Delay(120, CancellationToken.None).ConfigureAwait(false);
            try { writer?.Flush(); } catch { /* ignore */ }
            try { writer?.Dispose(); } catch { /* ignore */ }
            writer = null;
            // NAudio writes 18-byte fmt; Chrome audio element needs classic 44-byte PCM.
            RewriteClassicPcmWavHeader(path, sampleRate, channels: 1, bits: 16);
            return path;
        }
        catch (Exception ex)
        {
            _setStatus?.Invoke($"Mic capture failed: {ex.Message}");
            Log($"mic capture failed: {ex.Message}");
            TryDelete(path);
            return null;
        }
        finally
        {
            lock (_gate) _micOpen = false;
            try { waveIn?.Dispose(); } catch { /* ignore */ }
            try { writer?.Dispose(); } catch { /* ignore */ }
        }
    }

    /// <summary>
    /// Prefer laptop / array mic over headset (Jabra boom mute inserts
    /// "lower microphone to unmute" and silences speech → sounds broken).
    /// </summary>
    private static (int Number, string Name) PickPreferredCaptureDevice()
    {
        var count = WaveIn.DeviceCount;
        if (count <= 0) return (0, "default");

        var devices = new List<(int Number, string Name, int Score)>();
        for (var i = 0; i < count; i++)
        {
            string name;
            try { name = WaveIn.GetCapabilities(i).ProductName ?? $"Device {i}"; }
            catch { name = $"Device {i}"; }
            var n = name.ToLowerInvariant();
            var score = 0;
            if (n.Contains("array")) score += 50;
            if (n.Contains("realtek")) score += 40;
            if (n.Contains("conexant") || n.Contains("smartamp")) score += 35;
            if (n.Contains("microphone") && !n.Contains("headset")) score += 25;
            if (n.Contains("built-in") || n.Contains("internal")) score += 45;
            if (n.Contains("laptop")) score += 40;
            // Avoid headset boom / hands-free (Jabra voice prompt + mute gaps).
            if (n.Contains("jabra") || n.Contains("evolve") || n.Contains("poly") ||
                n.Contains("plantronics") || n.Contains("headset") ||
                n.Contains("hands-free") || n.Contains("handsfree") ||
                n.Contains("bluetooth"))
                score -= 100;
            devices.Add((i, name, score));
        }

        var best = devices.OrderByDescending(d => d.Score).ThenBy(d => d.Number).First();
        return (best.Number, best.Name);
    }

    /// <summary>Rewrite WAV to 44-byte PCM header so browsers can play it.</summary>
    private static void RewriteClassicPcmWavHeader(string path, int sampleRate, int channels, int bits)
    {
        try
        {
            if (!File.Exists(path)) return;
            var raw = File.ReadAllBytes(path);
            if (raw.Length < 46) return;
            if (raw[0] != (byte)'R' || raw[12] != (byte)'f') return;

            // Find data chunk
            var dataOffset = -1;
            var dataSize = 0;
            for (var i = 12; i + 8 < Math.Min(raw.Length, 128); i++)
            {
                if (raw[i] == (byte)'d' && raw[i + 1] == (byte)'a' &&
                    raw[i + 2] == (byte)'t' && raw[i + 3] == (byte)'a')
                {
                    dataSize = BitConverter.ToInt32(raw, i + 4);
                    dataOffset = i + 8;
                    if (dataOffset + dataSize > raw.Length)
                        dataSize = raw.Length - dataOffset;
                    break;
                }
            }
            if (dataOffset < 0 || dataSize <= 0) return;

            // Already classic?
            if (BitConverter.ToInt32(raw, 16) == 16 && dataOffset == 44)
                return;

            var blockAlign = channels * bits / 8;
            var byteRate = sampleRate * blockAlign;
            var outBuf = new byte[44 + dataSize];
            Buffer.BlockCopy(System.Text.Encoding.ASCII.GetBytes("RIFF"), 0, outBuf, 0, 4);
            BitConverter.GetBytes(36 + dataSize).CopyTo(outBuf, 4);
            Buffer.BlockCopy(System.Text.Encoding.ASCII.GetBytes("WAVE"), 0, outBuf, 8, 4);
            Buffer.BlockCopy(System.Text.Encoding.ASCII.GetBytes("fmt "), 0, outBuf, 12, 4);
            BitConverter.GetBytes(16).CopyTo(outBuf, 16);
            BitConverter.GetBytes((short)1).CopyTo(outBuf, 20);
            BitConverter.GetBytes((short)channels).CopyTo(outBuf, 22);
            BitConverter.GetBytes(sampleRate).CopyTo(outBuf, 24);
            BitConverter.GetBytes(byteRate).CopyTo(outBuf, 28);
            BitConverter.GetBytes((short)blockAlign).CopyTo(outBuf, 32);
            BitConverter.GetBytes((short)bits).CopyTo(outBuf, 34);
            Buffer.BlockCopy(System.Text.Encoding.ASCII.GetBytes("data"), 0, outBuf, 36, 4);
            BitConverter.GetBytes(dataSize).CopyTo(outBuf, 40);
            Buffer.BlockCopy(raw, dataOffset, outBuf, 44, dataSize);
            File.WriteAllBytes(path, outBuf);
        }
        catch (Exception ex)
        {
            Log($"wav rewrite: {ex.Message}");
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
