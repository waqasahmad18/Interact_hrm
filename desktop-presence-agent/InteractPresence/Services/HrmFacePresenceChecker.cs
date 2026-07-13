using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Text;
using System.Text.Json;

namespace InteractPresence;

/// <summary>
/// Face check via real Chrome/Edge (same engine path as clock/break).
/// WebView2 was returning garbage 0% descriptors; Chrome app window is reliable.
/// </summary>
public sealed class HrmFacePresenceChecker
{
    private readonly AppSettings _settings;
    private static readonly HttpClient Http = CreateHttp();

    private static HttpClient CreateHttp()
    {
        // Staging nginx often uses a self-signed cert on :8443.
        var handler = new HttpClientHandler
        {
            ServerCertificateCustomValidationCallback =
                HttpClientHandler.DangerousAcceptAnyServerCertificateValidator,
        };
        return new HttpClient(handler) { Timeout = TimeSpan.FromSeconds(60) };
    }

    public HrmFacePresenceChecker(AppSettings settings)
    {
        _settings = settings;
    }

    public sealed class FaceCheckResult
    {
        public bool CameraOk { get; init; }
        public bool FacePresent { get; init; }
        public string? Error { get; init; }
        public string? Code { get; init; }
    }

    public Task<FaceCheckResult> CheckFacePresentAsync()
    {
        var tcs = new TaskCompletionSource<FaceCheckResult>(TaskCreationOptions.RunContinuationsAsynchronously);

        _ = Task.Run(async () =>
        {
            try
            {
                var result = await RunChromeBridgeAsync().ConfigureAwait(false);
                tcs.TrySetResult(result);
            }
            catch (Exception ex)
            {
                tcs.TrySetResult(new FaceCheckResult
                {
                    CameraOk = false,
                    FacePresent = false,
                    Error = ex.Message,
                    Code = "error",
                });
            }
        });

        return tcs.Task;
    }

    private async Task<FaceCheckResult> RunChromeBridgeAsync()
    {
        var employeeId = (_settings.EmployeeId ?? "").Trim();
        if (string.IsNullOrEmpty(employeeId))
        {
            return new FaceCheckResult
            {
                CameraOk = false,
                FacePresent = false,
                Error = "Set Employee ID in tray menu first",
                Code = "error",
            };
        }

        var baseUrl = (_settings.HrmBaseUrl ?? "http://localhost:3000").TrimEnd('/');

        // 1) Create session the Chrome page will complete
        string checkId;
        try
        {
            var createBody = JsonSerializer.Serialize(new { employee_id = employeeId });
            using var createReq = new HttpRequestMessage(HttpMethod.Post, $"{baseUrl}/api/biometric/presence-session")
            {
                Content = new StringContent(createBody, Encoding.UTF8, "application/json"),
            };
            using var createRes = await Http.SendAsync(createReq).ConfigureAwait(false);
            var createJson = await createRes.Content.ReadAsStringAsync().ConfigureAwait(false);
            using var createDoc = JsonDocument.Parse(createJson);
            if (!createDoc.RootElement.TryGetProperty("check_id", out var idEl))
            {
                return new FaceCheckResult
                {
                    CameraOk = false,
                    FacePresent = false,
                    Error = "Could not create presence session. Is HRM reachable at HrmBaseUrl?",
                    Code = "error",
                };
            }
            checkId = idEl.GetString() ?? "";
        }
        catch (Exception ex)
        {
            return new FaceCheckResult
            {
                CameraOk = false,
                FacePresent = false,
                Error = $"HRM unreachable: {ex.Message}",
                Code = "error",
            };
        }

        if (string.IsNullOrEmpty(checkId))
        {
            return new FaceCheckResult
            {
                CameraOk = false,
                FacePresent = false,
                Error = "Empty check_id",
                Code = "error",
            };
        }

        var pageUrl =
            $"{baseUrl}/presence-silent?employeeId={Uri.EscapeDataString(employeeId)}" +
            $"&checkId={Uri.EscapeDataString(checkId)}" +
            (string.IsNullOrWhiteSpace(_settings.EmployeeName)
                ? ""
                : $"&employeeName={Uri.EscapeDataString(_settings.EmployeeName)}");

        var browser = FindBrowser();
        if (browser == null)
        {
            return new FaceCheckResult
            {
                CameraOk = false,
                FacePresent = false,
                Error = "Chrome/Edge not found. Install Chrome for face check (same as break).",
                Code = "error",
            };
        }

        // Stable profile so camera permission is remembered (not wiped each check)
        var userData = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "InteractPresence",
            "ChromeProfile");
        Directory.CreateDirectory(userData);

        Process? proc = null;
        try
        {
            // Place near bottom-right like a small check window
            var work = System.Windows.Forms.Screen.PrimaryScreen?.WorkingArea
                       ?? new System.Drawing.Rectangle(0, 0, 1280, 720);
            var left = Math.Max(0, work.Right - 460);
            var top = Math.Max(0, work.Bottom - 400);

            var args =
                $"--user-data-dir=\"{userData}\" " +
                $"--window-size=420,360 " +
                $"--window-position={left},{top} " +
                "--disable-features=TranslateUI " +
                "--no-first-run --no-default-browser-check " +
                // Staging self-signed HTTPS (192.168.10.6:8443) — allow camera page to load
                "--ignore-certificate-errors --allow-insecure-localhost " +
                $"--app=\"{pageUrl}\"";

            proc = Process.Start(new ProcessStartInfo
            {
                FileName = browser,
                Arguments = args,
                UseShellExecute = false,
                CreateNoWindow = true,
            });

            // 2) Poll until Chrome page posts result
            var deadline = DateTime.UtcNow.AddSeconds(55);
            while (DateTime.UtcNow < deadline)
            {
                await Task.Delay(700).ConfigureAwait(false);
                try
                {
                    using var pollRes = await Http.GetAsync(
                        $"{baseUrl}/api/biometric/presence-session?check_id={Uri.EscapeDataString(checkId)}"
                    ).ConfigureAwait(false);
                    var pollJson = await pollRes.Content.ReadAsStringAsync().ConfigureAwait(false);
                    using var pollDoc = JsonDocument.Parse(pollJson);
                    var root = pollDoc.RootElement;
                    if (root.TryGetProperty("pending", out var pending) && pending.GetBoolean())
                        continue;
                    if (root.TryGetProperty("result", out var resultEl))
                    {
                        return new FaceCheckResult
                        {
                            CameraOk = resultEl.TryGetProperty("cameraOk", out var c) && c.GetBoolean(),
                            FacePresent = resultEl.TryGetProperty("atSeat", out var a) && a.GetBoolean(),
                            Code = resultEl.TryGetProperty("code", out var code) ? code.GetString() : null,
                            Error = resultEl.TryGetProperty("error", out var err) && err.ValueKind != JsonValueKind.Null
                                ? err.GetString()
                                : null,
                        };
                    }
                }
                catch
                {
                    /* retry poll */
                }
            }

            return new FaceCheckResult
            {
                CameraOk = false,
                FacePresent = false,
                Error = "Face check timed out (Chrome). Allow camera if prompted.",
                Code = "timeout",
            };
        }
        finally
        {
            try
            {
                if (proc is { HasExited: false })
                    proc.Kill(entireProcessTree: true);
            }
            catch { /* ignore */ }
            try { proc?.Dispose(); } catch { /* ignore */ }
        }
    }

    private static string? FindBrowser()
    {
        var candidates = new[]
        {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                @"Google\Chrome\Application\chrome.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
                @"Google\Chrome\Application\chrome.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
                @"Google\Chrome\Application\chrome.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
                @"Microsoft\Edge\Application\msedge.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
                @"Microsoft\Edge\Application\msedge.exe"),
        };
        return candidates.FirstOrDefault(File.Exists);
    }
}
