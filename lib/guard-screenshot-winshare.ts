import fs from "fs/promises";
import path from "path";

/**
 * Optional mirror of guard screenshots onto a Windows CIFS share (staging winshare).
 * Never blocks or fails the HRM upload path — fire-and-forget with a small queue.
 *
 * Env:
 *   GUARD_SCREENSHOT_WINSHARE_DIR=/root/winshare/guard-screenshots
 * Empty / unset = mirroring disabled.
 */

const MAX_QUEUE = 40;
const MAX_INFLIGHT = 1; // CIFS is slow; keep HRM free
const COPY_TIMEOUT_MS = 20_000;

let inflight = 0;
const queue: Array<{ absolutePath: string; relativePath: string }> = [];

export function winshareMirrorRoot(): string {
  return String(process.env.GUARD_SCREENSHOT_WINSHARE_DIR || "").trim();
}

export function isWinshareMirrorEnabled(): boolean {
  return Boolean(winshareMirrorRoot());
}

/**
 * Schedule a best-effort copy to winshare. Safe to call from upload handler —
 * returns immediately; failures are swallowed.
 */
export function enqueueScreenshotWinshareMirror(opts: {
  absolutePath: string;
  relativePath: string;
}): void {
  const root = winshareMirrorRoot();
  if (!root) return;
  const abs = String(opts.absolutePath || "").trim();
  const rel = String(opts.relativePath || "")
    .trim()
    .replace(/\\/g, "/");
  if (!abs || !rel || rel.includes("..")) return;

  if (queue.length >= MAX_QUEUE) {
    // Drop oldest pending mirror — HRM already has the file; share can catch up later.
    queue.shift();
  }
  queue.push({ absolutePath: abs, relativePath: rel });
  void pump();
}

async function pump(): Promise<void> {
  if (inflight >= MAX_INFLIGHT) return;
  const next = queue.shift();
  if (!next) return;
  inflight += 1;
  try {
    await copyOne(next.absolutePath, next.relativePath);
  } catch {
    /* never surface to HRM */
  } finally {
    inflight -= 1;
    if (queue.length > 0) {
      setImmediate(() => {
        void pump();
      });
    }
  }
}

async function copyOne(absolutePath: string, relativePath: string): Promise<void> {
  const root = winshareMirrorRoot();
  if (!root) return;

  const dest = path.join(root, ...relativePath.split("/").filter(Boolean));
  const destDir = path.dirname(dest);

  const work = (async () => {
    await fs.mkdir(destDir, { recursive: true });
    await fs.copyFile(absolutePath, dest);
  })();

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("winshare copy timeout")),
          COPY_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** One-shot backfill of existing local gallery files onto winshare (admin/ops). */
export async function backfillScreenshotsToWinshare(opts?: {
  limit?: number;
}): Promise<{ copied: number; skipped: number; failed: number }> {
  const root = winshareMirrorRoot();
  if (!root) return { copied: 0, skipped: 0, failed: 0 };

  const { GUARD_SCREENSHOTS_ROOT } = await import("@/lib/guard-screenshots");
  const limit = Math.max(1, Math.min(opts?.limit ?? 5000, 20000));
  let copied = 0;
  let skipped = 0;
  let failed = 0;

  async function walk(dir: string, relParts: string[]): Promise<void> {
    if (copied + failed + skipped >= limit) return;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (copied + failed + skipped >= limit) return;
      const abs = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        await walk(abs, [...relParts, ent.name]);
        continue;
      }
      if (!ent.isFile()) continue;
      if (!/\.(jpe?g|png)$/i.test(ent.name)) continue;
      const rel = [...relParts, ent.name].join("/");
      try {
        const dest = path.join(root, ...rel.split("/"));
        try {
          await fs.access(dest);
          skipped += 1;
          continue;
        } catch {
          /* not present — copy */
        }
        await fs.mkdir(path.dirname(dest), { recursive: true });
        await fs.copyFile(abs, dest);
        copied += 1;
        // Yield so event loop / HRM stay responsive during large backfill
        if (copied % 5 === 0) {
          await new Promise((r) => setTimeout(r, 50));
        }
      } catch {
        failed += 1;
      }
    }
  }

  await walk(GUARD_SCREENSHOTS_ROOT, []);
  return { copied, skipped, failed };
}
