import "server-only";

import { spawn } from "child_process";
import path from "path";

export type ZkbioSyncResult = {
  code: number | null;
  stdout: string;
  stderr: string;
};

/**
 * Runs scripts/zkbio_sync_punches.py (reads scripts/zkbio-sync.local.env inside Python).
 */
export async function runZkbioSync(options?: { start?: string; end?: string }): Promise<ZkbioSyncResult> {
  const root = process.cwd();
  const scriptPath = path.join(root, "scripts", "zkbio_sync_punches.py");
  const scriptArgs: string[] = [];
  if (options?.start) scriptArgs.push("--start", options.start);
  if (options?.end) scriptArgs.push("--end", options.end);

  const customPython = process.env.ZKBIO_PYTHON?.trim();
  let command: string;
  let args: string[];

  if (customPython) {
    command = customPython;
    args = [scriptPath, ...scriptArgs];
  } else if (process.platform === "win32") {
    command = "py";
    args = ["-3", scriptPath, ...scriptArgs];
  } else {
    command = "python3";
    args = [scriptPath, ...scriptArgs];
  }

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    const child = spawn(command, args, {
      cwd: root,
      env: { ...process.env },
      shell: false,
      windowsHide: true,
    });
    child.stdout?.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr?.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
    child.on("error", (err) => {
      stderr += String(err);
      resolve({ code: -1, stdout, stderr });
    });
  });
}
