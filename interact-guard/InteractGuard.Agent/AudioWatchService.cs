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
                using var sttCts = new CancellationTokenSource(TimeSpan.FromSeconds(90));
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
                    }
                }
                else if (!stt.Ok)
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

        // 48 kHz capture = clearer speech for admin playback (Whisper still accepts it).
        const int sampleRate = 48000;
        WaveInEvent? waveIn = null;
        WaveFileWriter? writer = null;
        try
        {
            waveIn = new WaveInEvent
            {
                WaveFormat = new WaveFormat(sampleRate, 16, 1),
                BufferMilliseconds = 20,
            };
            writer = new WaveFileWriter(path, waveIn.WaveFormat);
            var writeGate = new object();
            // No live gain — boosting in real-time made hiss loud. Clean in EnhanceSpeechWav.
            waveIn.DataAvailable += (_, e) =>
            {
                if (e.BytesRecorded < 2) return;
                lock (writeGate)
                {
                    writer?.Write(e.Buffer, 0, e.BytesRecorded);
                }
            };

            lock (_gate) _micOpen = true;
            waveIn.StartRecording();
            await Task.Delay(TimeSpan.FromSeconds(seconds), ct).ConfigureAwait(false);
            waveIn.StopRecording();
            await Task.Delay(80, CancellationToken.None).ConfigureAwait(false);
            try { writer?.Dispose(); } catch { /* ignore */ }
            writer = null;
            EnhanceSpeechWav(path, sampleRate);
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
            lock (_gate) _micOpen = false;
            try { waveIn?.Dispose(); } catch { /* ignore */ }
            try { writer?.Dispose(); } catch { /* ignore */ }
        }
    }

    /// <summary>
    /// Clean 16-bit mono PCM: high-pass, noise gate, gentle speech AGC (no harsh peak boost).
    /// </summary>
    private static void EnhanceSpeechWav(string path, int sampleRate)
    {
        try
        {
            if (!File.Exists(path)) return;
            byte[] raw;
            using (var fs = File.OpenRead(path))
            {
                raw = new byte[fs.Length];
                if (fs.Read(raw, 0, raw.Length) < 46) return;
            }

            var dataOffset = 44;
            for (var i = 12; i + 8 < Math.Min(raw.Length, 200); i++)
            {
                if (raw[i] == (byte)'d' && raw[i + 1] == (byte)'a' &&
                    raw[i + 2] == (byte)'t' && raw[i + 3] == (byte)'a')
                {
                    dataOffset = i + 8;
                    break;
                }
            }
            if (dataOffset + 4 > raw.Length) return;

            var sampleCount = (raw.Length - dataOffset) / 2;
            if (sampleCount < sampleRate / 4) return; // under 0.25s

            var samples = new float[sampleCount];
            for (var i = 0; i < sampleCount; i++)
            {
                var o = dataOffset + i * 2;
                samples[i] = (short)(raw[o] | (raw[o + 1] << 8)) / 32768f;
            }

            // 1) High-pass ~120 Hz — kill rumble / AC hum before gain.
            var hp = Math.Exp(-2.0 * Math.PI * 120.0 / sampleRate);
            float prevX = 0, prevY = 0;
            for (var i = 0; i < sampleCount; i++)
            {
                var x = samples[i];
                var y = (float)((x - prevX) + hp * prevY);
                prevX = x;
                prevY = y;
                samples[i] = y;
            }

            // 2) Frame RMS → estimate noise floor from quietest frames.
            const int frameMs = 20;
            var frameLen = Math.Max(80, sampleRate * frameMs / 1000);
            var frameCount = Math.Max(1, sampleCount / frameLen);
            var frameRms = new float[frameCount];
            for (var f = 0; f < frameCount; f++)
            {
                double acc = 0;
                var start = f * frameLen;
                var end = Math.Min(sampleCount, start + frameLen);
                var n = end - start;
                for (var i = start; i < end; i++)
                    acc += samples[i] * samples[i];
                frameRms[f] = n > 0 ? (float)Math.Sqrt(acc / n) : 0;
            }

            var sorted = (float[])frameRms.Clone();
            Array.Sort(sorted);
            var noiseFloor = sorted[Math.Clamp(sorted.Length / 10, 0, sorted.Length - 1)];
            noiseFloor = Math.Max(noiseFloor, 1e-5f);
            var gateOpen = noiseFloor * 2.8f;
            var gateClose = noiseFloor * 1.6f;

            // 3) Noise gate + measure speech RMS (only open frames).
            double speechAcc = 0;
            var speechN = 0;
            var open = false;
            var gated = new float[sampleCount];
            for (var f = 0; f < frameCount; f++)
            {
                var rms = frameRms[f];
                if (!open && rms >= gateOpen) open = true;
                else if (open && rms < gateClose) open = false;

                var start = f * frameLen;
                var end = Math.Min(sampleCount, start + frameLen);
                if (open)
                {
                    for (var i = start; i < end; i++)
                    {
                        gated[i] = samples[i];
                        speechAcc += samples[i] * samples[i];
                        speechN++;
                    }
                }
                else
                {
                    // Attenuate noise floor instead of boosting it.
                    for (var i = start; i < end; i++)
                        gated[i] = samples[i] * 0.15f;
                }
            }

            // 4) Gentle AGC toward comfortable speech level (not peak of clicks/noise).
            var speechRms = speechN > 200
                ? (float)Math.Sqrt(speechAcc / speechN)
                : 0f;
            float gain = 1f;
            if (speechRms > 1e-4f)
            {
                const float targetRms = 0.12f; // clear but not harsh
                gain = Math.Clamp(targetRms / speechRms, 0.85f, 2.8f);
            }

            // 5) Soft limiter
            for (var i = 0; i < sampleCount; i++)
            {
                var s = gated[i] * gain;
                // tanh soft-clip
                s = (float)Math.Tanh(s * 1.15);
                var pcm = (int)Math.Round(s * 32767.0);
                if (pcm > short.MaxValue) pcm = short.MaxValue;
                if (pcm < short.MinValue) pcm = short.MinValue;
                var o = dataOffset + i * 2;
                raw[o] = (byte)(pcm & 0xff);
                raw[o + 1] = (byte)((pcm >> 8) & 0xff);
            }

            File.WriteAllBytes(path, raw);
        }
        catch
        {
            /* keep original clip if enhance fails */
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
