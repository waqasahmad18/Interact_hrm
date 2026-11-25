import { spawn } from "node:child_process";
import fs from "fs/promises";
import path from "node:path";

export type GuardSttResult = {
  ok: boolean;
  text: string;
  language: string | null;
  error?: string;
};

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/** Run local faster-whisper sidecar (same as Interact Guard agent). */
export async function transcribeWavWithSidecar(
  wavAbs: string,
  opts?: { timeoutMs?: number; model?: string }
): Promise<GuardSttResult> {
  const pythonCandidates = [
    String(process.env.GUARD_STT_PYTHON || "").trim(),
    path.join(process.cwd(), "interact-guard", "stt-sidecar", ".venv", "Scripts", "python.exe"),
    path.join(process.cwd(), "interact-guard", "stt-sidecar", ".venv", "bin", "python"),
    path.join(process.cwd(), "stt-sidecar", ".venv", "Scripts", "python.exe"),
    path.join(process.cwd(), "stt-sidecar", ".venv", "bin", "python"),
  ].filter(Boolean);

  let python: string | null = null;
  for (const c of pythonCandidates) {
    if (await fileExists(c)) {
      python = c;
      break;
    }
  }

  const scriptCandidates = [
    String(process.env.GUARD_STT_SCRIPT || "").trim(),
    path.join(process.cwd(), "interact-guard", "stt-sidecar", "transcribe.py"),
    path.join(process.cwd(), "stt-sidecar", "transcribe.py"),
  ].filter(Boolean);

  let script: string | null = null;
  for (const c of scriptCandidates) {
    if (await fileExists(c)) {
      script = c;
      break;
    }
  }

  if (!python || !script) {
    return {
      ok: false,
      text: "",
      language: null,
      error: "STT sidecar not available on this host",
    };
  }
  if (!(await fileExists(wavAbs))) {
    return { ok: false, text: "", language: null, error: "wav not found" };
  }

  const model = String(opts?.model || process.env.GUARD_STT_MODEL || "small").trim() || "small";
  const timeoutMs = Math.max(30_000, opts?.timeoutMs ?? 240_000);

  return new Promise((resolve) => {
    const child = spawn(
      python!,
      [script!, "--wav", wavAbs, "--model", model, "--device", "cpu", "--compute-type", "int8"],
      {
        windowsHide: true,
        env: {
          ...process.env,
          PYTHONIOENCODING: "utf-8",
          PYTHONUTF8: "1",
        },
      }
    );
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        /* ignore */
      }
      resolve({
        ok: false,
        text: "",
        language: null,
        error: "STT timed out",
      });
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (d) => {
      stdout += String(d);
    });
    child.stderr.on("data", (d) => {
      stderr += String(d);
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        ok: false,
        text: "",
        language: null,
        error: err.message,
      });
    });
    child.on("close", () => {
      clearTimeout(timer);
      const line =
        stdout
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter((l) => l.startsWith("{"))
          .pop() || "";
      if (!line) {
        resolve({
          ok: false,
          text: "",
          language: null,
          error: (stderr || "empty STT output").slice(0, 240),
        });
        return;
      }
      try {
        const parsed = JSON.parse(line) as {
          ok?: boolean;
          text?: string;
          language?: string;
          error?: string;
        };
        resolve({
          ok: !!parsed.ok,
          text: String(parsed.text || "").trim(),
          language: parsed.language ? String(parsed.language) : null,
          error: parsed.ok ? undefined : String(parsed.error || stderr || "STT failed").slice(0, 240),
        });
      } catch (err) {
        resolve({
          ok: false,
          text: "",
          language: null,
          error: err instanceof Error ? err.message : "STT JSON parse failed",
        });
      }
    });
  });
}
