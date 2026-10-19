import {
  enforcePolicyAfterOcr,
  type KeywordAlertInput,
} from "@/lib/guard-keyword-watch";
import { getMemAvailableMb } from "@/lib/guard-screenshot-retention";

/**
 * Scale-safe ingest for Guard screenshots (100+ agents).
 *
 * Upload path must stay cheap: write JPEG to disk, return 200.
 * OCR/policy is CPU-heavy (spawns Node child) — never unbounded.
 * Staging (~2GB RAM): keep OCR capped and skip under memory pressure.
 */

/** Simultaneous raw image body receives into Node (disk write). */
const MAX_UPLOAD_INFLIGHT = Number(
  process.env.GUARD_SS_MAX_UPLOAD_INFLIGHT || 4,
);

/** Parallel OCR child processes (keep 1 on small VMs). */
const MAX_OCR_INFLIGHT = Number(process.env.GUARD_SS_MAX_OCR_INFLIGHT || 1);

/** Pending OCR jobs; older jobs dropped when full so gallery stays responsive. */
const MAX_OCR_QUEUE = Number(process.env.GUARD_SS_MAX_OCR_QUEUE || 8);

/** Skip OCR when MemAvailable below this (MB). */
const OCR_MIN_MEM_MB = Number(process.env.GUARD_SS_OCR_MIN_MEM_MB || 450);

/** Min gap between OCR starts (ms) — prevents stampede on 2GB boxes. */
const OCR_MIN_GAP_MS = Number(process.env.GUARD_SS_OCR_MIN_GAP_MS || 25_000);

let uploadInflight = 0;
let ocrInflight = 0;
let lastOcrStartedAt = 0;
const ocrQueue: KeywordAlertInput[] = [];

function ocrEnabled(): boolean {
  const v = String(process.env.GUARD_SS_OCR_ENABLED || "true").toLowerCase();
  return v !== "0" && v !== "false" && v !== "off";
}

export function tryBeginScreenshotUpload(): boolean {
  const cap = Math.max(1, Math.min(20, MAX_UPLOAD_INFLIGHT || 4));
  if (uploadInflight >= cap) return false;
  uploadInflight += 1;
  return true;
}

export function endScreenshotUpload(): void {
  uploadInflight = Math.max(0, uploadInflight - 1);
}

/**
 * Queue policy OCR after the file is already on disk.
 * Never blocks the upload HTTP response.
 */
export function enqueueScreenshotPolicyScan(job: KeywordAlertInput): void {
  if (!ocrEnabled()) return;
  const cap = Math.max(2, Math.min(80, MAX_OCR_QUEUE || 8));
  if (ocrQueue.length >= cap) {
    // Drop oldest pending scan — screenshot file remains for gallery view.
    ocrQueue.shift();
  }
  ocrQueue.push(job);
  pumpOcrQueue();
}

function pumpOcrQueue(): void {
  const parallel = Math.max(1, Math.min(2, MAX_OCR_INFLIGHT || 1));
  while (ocrInflight < parallel && ocrQueue.length > 0) {
    const now = Date.now();
    if (lastOcrStartedAt > 0 && now - lastOcrStartedAt < OCR_MIN_GAP_MS) {
      const wait = OCR_MIN_GAP_MS - (now - lastOcrStartedAt);
      setTimeout(() => pumpOcrQueue(), Math.max(500, wait));
      break;
    }

    const job = ocrQueue.shift();
    if (!job) break;

    ocrInflight += 1;
    lastOcrStartedAt = Date.now();

    void (async () => {
      try {
        const mem = await getMemAvailableMb();
        if (mem != null && mem < OCR_MIN_MEM_MB) {
          console.warn(
            `[guard-ss-ingest] OCR skipped — low memory (${mem} MB < ${OCR_MIN_MEM_MB})`,
          );
          return;
        }
        const result = await enforcePolicyAfterOcr(job);
        if (!result.ok) {
          console.warn("[guard-ss-ingest] policy check failed:", result.error);
          return;
        }
        if (!result.skipped) {
          console.log(
            "[guard-ss-ingest] policy ticket",
            result.ticketNumber,
            result.matched,
          );
        }
      } catch (err) {
        console.warn("[guard-ss-ingest] policy queue error:", err);
      } finally {
        ocrInflight = Math.max(0, ocrInflight - 1);
        pumpOcrQueue();
      }
    })();
  }
}

export function getScreenshotIngestStats() {
  return {
    uploadInflight,
    ocrInflight,
    ocrQueued: ocrQueue.length,
    maxUploadInflight: MAX_UPLOAD_INFLIGHT,
    maxOcrInflight: MAX_OCR_INFLIGHT,
    maxOcrQueue: MAX_OCR_QUEUE,
    ocrEnabled: ocrEnabled(),
  };
}
