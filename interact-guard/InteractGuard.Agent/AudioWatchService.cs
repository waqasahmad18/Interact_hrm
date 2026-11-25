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
                    if (gapSec > 0)
                        await Task.Delay(TimeSpan.FromSeconds(gapSec), ct).ConfigureAwait(false);
                    continue;
                }

                // Upload FIRST so admin Clips tab fills even when Whisper is slow/stuck.
                _setStatus?.Invoke($"Uploading audio clip ({fi.Length / 1024} KB)…");
                var up = await _hrm.PostAudioAlertAsync(wavPath, "", null, ct).ConfigureAwait(false);
                _setStatus?.Invoke(up.Ok
                    ? $"Audio clip uploaded ({fi.Length / 1024} KB)"
                    : $"Audio upload failed: {up.Detail}");

                // Then STT (bounded) → attach transcript / policy match on same clip.
                if (up.Ok)
                {
                    using var sttCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
                    sttCts.CancelAfter(TimeSpan.FromSeconds(90));
                    try
                    {
                        var stt = await _stt.TranscribeAsync(wavPath, sttCts.Token).ConfigureAwait(false);
                        if (stt.Ok && !string.IsNullOrWhiteSpace(stt.Text))
                        {
                            _setStatus?.Invoke(
                                $"Audio STT ({stt.Language ?? "?"}): {Trim(stt.Text, 48)}");
                            if (up.ClipId is > 0)
                            {
                                await _hrm.PatchAudioClipTranscriptAsync(
                                        up.ClipId.Value, stt.Text, stt.Language, ct)
                                    .ConfigureAwait(false);
                            }
                            else
                            {
                                // Fallback: post again with transcript for policy ticket only.
                                await _hrm.PostAudioAlertAsync(wavPath, stt.Text, stt.Language, ct)
                                    .ConfigureAwait(false);
                            }
                        }
                        else if (!stt.Ok)
                        {
                            _setStatus?.Invoke($"STT skipped/error: {stt.Error}");
                        }
                        else
                        {
                            _setStatus?.Invoke("Audio clip ready (no speech / silence)");
                        }
                    }
                    catch (OperationCanceledException) when (!ct.IsCancellationRequested)
                    {
                        _setStatus?.Invoke("STT timed out (clip already uploaded)");
                    }
                }

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
            // Live boost so quiet room / laptop mic speech is audible in admin Clips.
            const float liveGain = 4.0f;
            waveIn.DataAvailable += (_, e) =>
            {
                var n = e.BytesRecorded;
                if (n < 2) return;
                var buf = e.Buffer;
                for (var i = 0; i + 1 < n; i += 2)
                {
                    var sample = (short)(buf[i] | (buf[i + 1] << 8));
                    var boosted = sample * liveGain;
                    var clipped =
                        boosted > short.MaxValue ? short.MaxValue :
                        boosted < short.MinValue ? short.MinValue :
                        (short)boosted;
                    buf[i] = (byte)(clipped & 0xff);
                    buf[i + 1] = (byte)((clipped >> 8) & 0xff);
                }
                lock (writeGate)
                {
                    writer?.Write(buf, 0, n);
                }
            };

            lock (_gate) _micOpen = true;
            waveIn.StartRecording();
            await Task.Delay(TimeSpan.FromSeconds(seconds), ct).ConfigureAwait(false);
            waveIn.StopRecording();
            await Task.Delay(80, CancellationToken.None).ConfigureAwait(false);
            try { writer?.Dispose(); } catch { /* ignore */ }
            writer = null;
            PeakNormalizeWav(path, targetPeak: 0.88f, maxGain: 12f);
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
    /// Peak-normalize 16-bit mono/stereo PCM WAV so quiet clips play loudly in admin.
    /// Skips near-silence (avoids boosting pure noise).
    /// </summary>
    private static void PeakNormalizeWav(string path, float targetPeak, float maxGain)
    {
        try
        {
            if (!File.Exists(path)) return;
            byte[] raw;
            using (var fs = File.OpenRead(path))
            {
                raw = new byte[fs.Length];
                var read = fs.Read(raw, 0, raw.Length);
                if (read < 46) return;
            }

            // Find "data" chunk (standard PCM header is 44 bytes, but be safe).
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

            var peak = 0;
            for (var i = dataOffset; i + 1 < raw.Length; i += 2)
            {
                var s = Math.Abs((short)(raw[i] | (raw[i + 1] << 8)));
                if (s > peak) peak = s;
            }
            // Near silence — leave as-is (headset boom muted / no input).
            if (peak < 80) return;

            var target = (int)(short.MaxValue * Math.Clamp(targetPeak, 0.5f, 0.95f));
            var gain = Math.Min(maxGain, (float)target / peak);
            if (gain <= 1.05f) return;

            for (var i = dataOffset; i + 1 < raw.Length; i += 2)
            {
                var sample = (short)(raw[i] | (raw[i + 1] << 8));
                var boosted = sample * gain;
                var clipped =
                    boosted > short.MaxValue ? short.MaxValue :
                    boosted < short.MinValue ? short.MinValue :
                    (short)boosted;
                raw[i] = (byte)(clipped & 0xff);
                raw[i + 1] = (byte)((clipped >> 8) & 0xff);
            }
            File.WriteAllBytes(path, raw);
        }
        catch
        {
            /* keep original clip if normalize fails */
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
