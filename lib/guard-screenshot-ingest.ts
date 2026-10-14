import {
  enforcePolicyAfterOcr,
  type KeywordAlertInput,
} from "@/lib/guard-keyword-watch";

/**
 * Scale-safe ingest for Guard screenshots (100+ agents).
 *
 * Upload path must stay cheap: write JPEG to disk, return 200.
 * OCR/policy is CPU-heavy (spawns Node child ~448MB) — never unbounded.
 */

/** Simultaneous raw image body receives into Node (disk write). */
const MAX_UPLOAD_INFLIGHT = Number(
  process.env.GUARD_SS_MAX_UPLOAD_INFLIGHT || 10
);

/** Parallel OCR child processes (keep low — each is heavy). */
const MAX_OCR_INFLIGHT = Number(process.env.GUARD_SS_MAX_OCR_INFLIGHT || 1);

/** Pending OCR jobs; older jobs dropped when full so gallery stays responsive. */
const MAX_OCR_QUEUE = Number(process.env.GUARD_SS_MAX_OCR_QUEUE || 40);

let uploadInflight = 0;
let ocrInflight = 0;
const ocrQueue: KeywordAlertInput[] = [];

export function tryBeginScreenshotUpload(): boolean {
  const cap = Math.max(2, Math.min(32, MAX_UPLOAD_INFLIGHT || 10));
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
  const cap = Math.max(5, Math.min(200, MAX_OCR_QUEUE || 40));
  if (ocrQueue.length >= cap) {
    // Drop oldest pending scan — screenshot file remains for gallery view.
    ocrQueue.shift();
  }
  ocrQueue.push(job);
  pumpOcrQueue();
}

function pumpOcrQueue(): void {
  const parallel = Math.max(1, Math.min(4, MAX_OCR_INFLIGHT || 1));
  while (ocrInflight < parallel && ocrQueue.length > 0) {
    const job = ocrQueue.shift();
    if (!job) break;
    ocrInflight += 1;
    void enforcePolicyAfterOcr(job)
      .then((result) => {
        if (!result.ok) {
          console.warn("[guard-ss-ingest] policy check failed:", result.error);
          return;
        }
        if (!result.skipped) {
          console.log(
            "[guard-ss-ingest] policy ticket",
            result.ticketNumber,
            result.matched
          );
        }
      })
      .catch((err) => {
        console.warn("[guard-ss-ingest] policy queue error:", err);
      })
      .finally(() => {
        ocrInflight = Math.max(0, ocrInflight - 1);
        pumpOcrQueue();
      });
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
  };
}
