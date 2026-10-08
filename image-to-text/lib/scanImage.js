/**
 * Shared scan used by the standalone tool and Interact HRM screenshot cards.
 * summary = vision paragraphs (Gemini/OpenAI). Other modes = local Tesseract OCR.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { createWorker } = require("tesseract.js");
const { cleanOcrText } = require("./cleanText");
const { summarizeImage, loadEnvFile } = require("./summarize");

const MODES = new Set(["summary", "raw", "clean", "paragraph"]);

async function ocrBuffer(data, filename, lang, mode) {
  const worker = await createWorker(lang, 1, { logger: () => {} });
  const ext = path.extname(filename || "").toLowerCase();
  const safeExt = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"].includes(ext)
    ? ext
    : ".png";
  const tmpFile = path.join(
    os.tmpdir(),
    `hrm-i2t-${Date.now()}-${Math.random().toString(16).slice(2)}${safeExt}`,
  );
  try {
    fs.writeFileSync(tmpFile, data);
    await worker.setParameters({
      tessedit_pageseg_mode: "6",
      preserve_interword_spaces: "1",
    });
    const {
      data: { text },
    } = await worker.recognize(tmpFile);
    return cleanOcrText(text, mode);
  } finally {
    await worker.terminate();
    fs.unlink(tmpFile, () => {});
  }
}

/**
 * @param {Buffer} data
 * @param {string} filename
 * @param {{ mode?: string, lang?: string, fallbackToOcr?: boolean }} [opts]
 * @returns {Promise<{ text: string, mode: string, provider: string, note?: string }>}
 */
async function scanImageBuffer(data, filename, opts = {}) {
  loadEnvFile();
  const requested = MODES.has(opts.mode) ? opts.mode : "summary";
  const lang = String(opts.lang || "eng").trim() || "eng";

  if (requested === "summary") {
    try {
      const { text, provider } = await summarizeImage(data, filename);
      return { text, mode: "summary", provider };
    } catch (err) {
      if (!opts.fallbackToOcr) throw err;
      const text = await ocrBuffer(data, filename, lang, "paragraph");
      return {
        text,
        mode: "paragraph",
        provider: "tesseract",
        note: err && err.message ? err.message : String(err),
      };
    }
  }

  const text = await ocrBuffer(data, filename, lang, requested);
  return { text, mode: requested, provider: "tesseract" };
}

module.exports = { scanImageBuffer };
