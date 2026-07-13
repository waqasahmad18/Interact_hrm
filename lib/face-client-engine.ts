"use client";

import type * as FaceApi from "@vladmandic/face-api";

const MODEL_URL = "/models/face-api";

type FaceApiModule = typeof FaceApi;
type TfModule = typeof import("@tensorflow/tfjs");

let faceapi: FaceApiModule | null = null;
let tf: TfModule | null = null;
let loadPromise: Promise<void> | null = null;
let runtimePreloadPromise: Promise<void> | null = null;
let modelsLoaded = false;

/** Parse tfjs + face-api JS bundles early so weight download can overlap. */
export function preloadFaceRuntime(): void {
  if (typeof window === "undefined") return;
  if (!runtimePreloadPromise) {
    runtimePreloadPromise = Promise.all([
      import("@tensorflow/tfjs"),
      import("@vladmandic/face-api"),
    ]).then(() => undefined);
  }
}

export function areFaceModelsLoaded(): boolean {
  return modelsLoaded;
}

type TinyFaceDetectorOptions = FaceApi.TinyFaceDetectorOptions;
type FaceDetection = FaceApi.FaceDetection;

let LIVE_DESCRIPTOR: TinyFaceDetectorOptions | null = null;
let LIVE_DESCRIPTOR_FALLBACK: TinyFaceDetectorOptions | null = null;
let LIVE_FACE_COUNT: TinyFaceDetectorOptions | null = null;
let FACE_COUNT_DETECTORS: TinyFaceDetectorOptions[] | null = null;
let ENROLL_DETECTORS: TinyFaceDetectorOptions[] | null = null;

export type FaceScanOutcome =
  | { status: "none" }
  | { status: "adjust" }
  | { status: "multiple"; count: number }
  | { status: "ok"; descriptor: Float32Array; coverage: number };

const MIN_FACE_AREA_RATIO = 0.03;
const ENROLL_MIN_FACE_AREA_RATIO = 0.025;
// A genuine second person (a real privacy/security concern) produces a sizable,
// high-confidence detection. Background texture — ceiling lights, wall patterns,
// reflections, glass partitions — only produces small, low-score "ghost"
// detections. Counting ignores those so one real person is never reported as
// "multiple faces".
const COUNT_MIN_FACE_AREA_RATIO = 0.045;
const COUNT_MIN_SCORE = 0.5;

let videoCanvasFull: HTMLCanvasElement | null = null;
let videoCanvasCrop: HTMLCanvasElement | null = null;
let videoCanvasWhole: HTMLCanvasElement | null = null;

async function initFaceRuntime(): Promise<void> {
  if (faceapi && tf && LIVE_DESCRIPTOR) return;

  preloadFaceRuntime();
  if (runtimePreloadPromise) await runtimePreloadPromise;

  const [faceapiMod, tfMod] = await Promise.all([
    import("@vladmandic/face-api"),
    import("@tensorflow/tfjs"),
  ]);

  faceapi = faceapiMod;
  tf = tfMod;

  LIVE_DESCRIPTOR = new faceapi.TinyFaceDetectorOptions({
    inputSize: 416,
    scoreThreshold: 0.28,
  });
  LIVE_DESCRIPTOR_FALLBACK = new faceapi.TinyFaceDetectorOptions({
    inputSize: 416,
    scoreThreshold: 0.18,
  });
  // Counting detectors run at a HIGH score threshold so background "ghost"
  // detections (lights, walls, reflections) are never mistaken for a person.
  // Only confident, real-face detections are counted.
  LIVE_FACE_COUNT = new faceapi.TinyFaceDetectorOptions({
    inputSize: 416,
    scoreThreshold: 0.5,
  });
  FACE_COUNT_DETECTORS = [
    new faceapi.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: 0.5 }),
    new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.45 }),
  ];
  ENROLL_DETECTORS = [
    new faceapi.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: 0.32 }),
    new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.24 }),
    new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.16 }),
    new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.1 }),
  ];
}

/**
 * Run the full detection pipeline once on a blank canvas so the WebGL/TF.js
 * shaders compile during preload instead of on the first real scan. Without
 * this the first live verification is noticeably slow ("cold start").
 */
async function warmUpInference(): Promise<void> {
  if (!faceapi || !LIVE_DESCRIPTOR) return;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 320;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#7f7f7f";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Detector runs on every frame — compile its shaders.
    await faceapi.detectAllFaces(canvas, LIVE_DESCRIPTOR);

    // Landmark + recognition nets only run once a face is found. Invoke them
    // directly on the blank canvas so their shaders are also pre-compiled,
    // making the first real "verifying" step fast instead of a cold start.
    await faceapi.nets.faceLandmark68TinyNet.detectLandmarks(canvas);
    await faceapi.nets.faceRecognitionNet.computeFaceDescriptor(canvas);
  } catch {
    // Warm-up is best-effort; a failure here must not block real scans.
  }
}

export async function ensureFaceModelsLoaded(opts?: {
  /** WebView2 often returns garbage face embeddings on WebGL — CPU is slower but reliable. */
  preferCpu?: boolean;
}): Promise<void> {
  if (typeof window === "undefined") return;
  if (modelsLoaded) return;
  if (loadPromise) return loadPromise;

  preloadFaceRuntime();

  const preferCpu = Boolean(opts?.preferCpu);

  loadPromise = (async () => {
    await initFaceRuntime();
    if (!tf || !faceapi) return;

    if (preferCpu) {
      await tf.setBackend("cpu");
      await tf.ready();
    } else {
      try {
        await tf.setBackend("webgl");
        await tf.ready();
      } catch {
        await tf.setBackend("cpu");
        await tf.ready();
      }
    }

    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);

    modelsLoaded = true;

    const runWarmUp = () => void warmUpInference();
    if (typeof requestIdleCallback !== "undefined") {
      requestIdleCallback(runWarmUp, { timeout: 4000 });
    } else {
      setTimeout(runWarmUp, 50);
    }
  })();

  return loadPromise;
}

export function resetFaceModelsForRetry(): void {
  loadPromise = null;
  modelsLoaded = false;
}

function minArea(canvas: HTMLCanvasElement, ratio: number): number {
  return canvas.width * canvas.height * ratio;
}

/**
 * Count only GENUINE faces: each detection must be both large enough (a real
 * person, not a tiny background artefact) and confident enough (high score, not
 * a low-confidence hallucination on wall/light/glass texture). This is what
 * stops a single person being reported as "multiple faces".
 */
function filterRealFaces(
  canvas: HTMLCanvasElement,
  detections: FaceDetection[],
  ratio: number
): FaceDetection[] {
  const area = minArea(canvas, ratio);
  return detections.filter(
    (d) => d.box.width * d.box.height >= area && d.score >= COUNT_MIN_SCORE
  );
}

type WithDescriptor = {
  detection: FaceDetection;
  descriptor: Float32Array;
};

function drawVideoToCanvas(
  video: HTMLVideoElement,
  target: "full" | "crop",
  maxSize = 320
): HTMLCanvasElement | null {
  if (video.readyState < 2 || video.videoWidth < 64) return null;

  const cropRatio = target === "full" ? 1 : 0.92;
  const cropSize = Math.min(video.videoWidth, video.videoHeight) * cropRatio;
  const sx = (video.videoWidth - cropSize) / 2;
  const sy = (video.videoHeight - cropSize) / 2;
  const size = Math.min(maxSize, Math.max(224, Math.round(cropSize)));

  const canvas = target === "full" ? videoCanvasFull : videoCanvasCrop;
  const el = canvas ?? document.createElement("canvas");
  if (target === "full") videoCanvasFull = el;
  else videoCanvasCrop = el;

  el.width = size;
  el.height = size;
  const ctx = el.getContext("2d");
  if (!ctx) return null;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.translate(size, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, sx, sy, cropSize, cropSize, 0, 0, size, size);
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  return el;
}

/**
 * Draw the ENTIRE video frame (no square crop) preserving aspect ratio. Used
 * for multi-face counting so a person standing at the left/right edge is not
 * cropped away — the squared "full"/"crop" canvases lose the side regions.
 */
function drawWholeFrameCanvas(
  video: HTMLVideoElement,
  maxSize = 420
): HTMLCanvasElement | null {
  if (video.readyState < 2 || video.videoWidth < 64) return null;

  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const scale = Math.min(1, maxSize / Math.max(vw, vh));
  const w = Math.max(64, Math.round(vw * scale));
  const h = Math.max(64, Math.round(vh * scale));

  const el = videoCanvasWhole ?? document.createElement("canvas");
  videoCanvasWhole = el;
  el.width = w;
  el.height = h;
  const ctx = el.getContext("2d");
  if (!ctx) return null;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(video, 0, 0, vw, vh, 0, 0, w, h);
  return el;
}

function scaleImageToCanvas(
  img: HTMLImageElement,
  maxDim: number,
  cropRatio = 1
): HTMLCanvasElement | null {
  const sw = img.naturalWidth;
  const sh = img.naturalHeight;
  if (!sw || !sh) return null;

  const cropSize = Math.min(sw, sh) * cropRatio;
  const sx = (sw - cropSize) / 2;
  const sy = (sh - cropSize) / 2;
  const scale = Math.min(1, maxDim / cropSize);
  const size = Math.max(224, Math.round(cropSize * scale));

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img, sx, sy, cropSize, cropSize, 0, 0, size, size);
  return canvas;
}

/** Brighten shadows — helps dim / backlit webcam photos. */
function brightenCanvas(source: HTMLCanvasElement, gamma = 0.72): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext("2d");
  const srcCtx = source.getContext("2d");
  if (!ctx || !srcCtx) return source;

  const imageData = srcCtx.getImageData(0, 0, source.width, source.height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.min(255, Math.pow(data[i] / 255, gamma) * 255);
    data[i + 1] = Math.min(255, Math.pow(data[i + 1] / 255, gamma) * 255);
    data[i + 2] = Math.min(255, Math.pow(data[i + 2] / 255, gamma) * 255);
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

function enrollmentCanvases(img: HTMLImageElement): HTMLCanvasElement[] {
  const full = scaleImageToCanvas(img, 640, 1);
  const crop = scaleImageToCanvas(img, 640, 0.82);
  const list: HTMLCanvasElement[] = [];
  if (full) {
    list.push(full);
    list.push(brightenCanvas(full));
  }
  if (crop) list.push(crop);
  return list;
}

/** Max face count across sensitive passes — catches background / side faces. */
export async function countFacesOnCanvas(canvas: HTMLCanvasElement): Promise<number> {
  await ensureFaceModelsLoaded();
  if (!faceapi || !FACE_COUNT_DETECTORS) return 0;

  let maxCount = 0;

  for (const detector of FACE_COUNT_DETECTORS) {
    const detections = await faceapi.detectAllFaces(canvas, detector);
    const count = filterRealFaces(canvas, detections, COUNT_MIN_FACE_AREA_RATIO).length;
    if (count > maxCount) maxCount = count;
    if (maxCount >= 2) return maxCount;
  }

  return maxCount;
}

/** Fast live check — whole frame (full width, no side crop) used every scan. */
export async function quickCountFacesInVideo(video: HTMLVideoElement): Promise<number> {
  await ensureFaceModelsLoaded();
  if (!faceapi || !LIVE_FACE_COUNT) return 0;

  const whole = drawWholeFrameCanvas(video, 640);
  if (!whole) return 0;
  const detections = await faceapi.detectAllFaces(whole, LIVE_FACE_COUNT);
  return filterRealFaces(whole, detections, COUNT_MIN_FACE_AREA_RATIO).length;
}

export async function countFacesInVideo(video: HTMLVideoElement): Promise<number> {
  await ensureFaceModelsLoaded();
  // Use the WHOLE frame (full width) so edge/side faces are never cropped out.
  const whole = drawWholeFrameCanvas(video, 720);
  if (!whole) return 0;
  return countFacesOnCanvas(whole);
}

async function detectWithDescriptors(
  canvas: HTMLCanvasElement,
  detector: TinyFaceDetectorOptions,
  minAreaRatio: number
): Promise<{ significant: WithDescriptor[] }> {
  if (!faceapi) return { significant: [] };

  const results = (await faceapi
    .detectAllFaces(canvas, detector)
    .withFaceLandmarks(true)
    .withFaceDescriptors()) as WithDescriptor[];

  const significant = results.filter(
    (r) =>
      r.detection.box.width * r.detection.box.height >= minArea(canvas, minAreaRatio)
  );

  return { significant };
}

/**
 * Try to pull a single usable descriptor from a set of candidate canvases.
 * Returns an "ok"/"multiple" outcome, or null if nothing usable was found so
 * the caller can try another set (e.g. brightness-normalized) before giving up.
 */
async function descriptorFromCanvases(
  canvases: (HTMLCanvasElement | null)[]
): Promise<FaceScanOutcome | null> {
  if (!LIVE_DESCRIPTOR || !LIVE_DESCRIPTOR_FALLBACK) return null;

  for (const canvas of canvases) {
    if (!canvas) continue;
    for (const detector of [LIVE_DESCRIPTOR, LIVE_DESCRIPTOR_FALLBACK]) {
      const { significant } = await detectWithDescriptors(
        canvas,
        detector,
        MIN_FACE_AREA_RATIO
      );

      // Only treat as "multiple" when at least two CONFIDENT faces are found.
      // The fallback detector runs at a low score threshold to rescue a single
      // dim / off-centre face, so its low-confidence extra detections (glass /
      // background ghosts) must not trigger a false multi-face block.
      const confident = significant.filter(
        (r) => r.detection.score >= COUNT_MIN_SCORE
      );
      if (confident.length >= 2) {
        return { status: "multiple", count: confident.length };
      }

      if (significant.length === 1 && significant[0].descriptor) {
        const box = significant[0].detection.box;
        // Linear height ratio is far more stable than area across the square
        // crop vs the rectangular whole frame, giving consistent distance hints.
        const coverage = box.height / canvas.height;
        return { status: "ok", descriptor: significant[0].descriptor, coverage };
      }
    }
  }

  return null;
}

async function analyzeEnrollCanvas(canvas: HTMLCanvasElement): Promise<FaceScanOutcome> {
  if (!ENROLL_DETECTORS) return { status: "none" };

  let maxMultiple = 0;

  for (const detector of ENROLL_DETECTORS) {
    const { significant } = await detectWithDescriptors(
      canvas,
      detector,
      ENROLL_MIN_FACE_AREA_RATIO
    );

    if (significant.length >= 2) {
      maxMultiple = Math.max(maxMultiple, significant.length);
      continue;
    }
    if (significant.length === 1 && significant[0].descriptor) {
      const box = significant[0].detection.box;
      const coverage = (box.width * box.height) / (canvas.width * canvas.height);
      return { status: "ok", descriptor: significant[0].descriptor, coverage };
    }
  }

  if (maxMultiple >= 2) return { status: "multiple", count: maxMultiple };
  return { status: "none" };
}

export async function scanVideoFrame(video: HTMLVideoElement): Promise<FaceScanOutcome> {
  await ensureFaceModelsLoaded();
  if (!LIVE_DESCRIPTOR || !LIVE_DESCRIPTOR_FALLBACK) return { status: "none" };

  // The descriptor pass works on a centre crop, which can miss a second face
  // near the frame edge. Check the FULL frame first so two people are blocked
  // even when only one is centred.
  const fullFaceCount = await quickCountFacesInVideo(video);
  if (fullFaceCount >= 2) {
    return { status: "multiple", count: fullFaceCount };
  }

  // Descriptor extraction runs on the WHOLE frame first (full width, no side
  // crop). A 16:9 webcam frame squared to a centre crop loses roughly the left
  // and right edges, so a person standing a little off-centre gets cropped out
  // and falsely reads as "no face". The whole frame keeps off-centre faces
  // intact; the tighter centre crop is only a fallback for close-up framing.
  const wholeCanvas = drawWholeFrameCanvas(video, 480);
  const cropCanvas = drawVideoToCanvas(video, "crop", 320);

  const primary = await descriptorFromCanvases([wholeCanvas, cropCanvas]);
  if (primary) return primary;

  // RESCUE PASS — the biggest cause of a false "no face detected" is a dark /
  // backlit face (window or light behind the person). Brighten the frame and
  // try again so the detector can actually see the under-exposed face.
  const brightWhole = wholeCanvas ? brightenCanvas(wholeCanvas, 0.6) : null;
  const brightCrop = cropCanvas ? brightenCanvas(cropCanvas, 0.6) : null;
  const rescued = await descriptorFromCanvases([brightWhole, brightCrop]);
  if (rescued) return rescued;

  // A face was counted in the frame but we couldn't extract a usable descriptor
  // — ask the user to adjust rather than claiming there is no face at all.
  if (fullFaceCount >= 1) return { status: "adjust" };

  return { status: "none" };
}

export async function scanBlob(blob: Blob): Promise<FaceScanOutcome> {
  await ensureFaceModelsLoaded();
  if (!faceapi) return { status: "none" };

  const url = URL.createObjectURL(blob);
  try {
    const img = await faceapi.fetchImage(url);
    const canvases = enrollmentCanvases(img);
    if (!canvases.length) return { status: "none" };

    let maxMultiple = 0;
    for (const canvas of canvases) {
      const result = await analyzeEnrollCanvas(canvas);
      if (result.status === "ok") return result;
      if (result.status === "multiple") {
        maxMultiple = Math.max(maxMultiple, result.count);
      }
    }

    if (maxMultiple >= 2) return { status: "multiple", count: maxMultiple };
    return { status: "none" };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** @deprecated Prefer scanVideoFrame */
export async function descriptorFromVideoFrame(
  video: HTMLVideoElement
): Promise<Float32Array | null> {
  const result = await scanVideoFrame(video);
  return result.status === "ok" ? result.descriptor : null;
}

/** @deprecated Prefer scanBlob */
export async function descriptorFromBlob(blob: Blob): Promise<Float32Array | null> {
  const result = await scanBlob(blob);
  return result.status === "ok" ? result.descriptor : null;
}

export function descriptorToJson(descriptor: Float32Array): number[] {
  return Array.from(descriptor);
}

/** L2-normalize a descriptor to unit length (face-api embeddings are unit-norm). */
export function normalizeDescriptor(d: number[] | Float32Array): number[] {
  let norm = 0;
  for (let i = 0; i < d.length; i++) norm += d[i] * d[i];
  norm = Math.sqrt(norm) || 1;
  const out = new Array<number>(d.length);
  for (let i = 0; i < d.length; i++) out[i] = d[i] / norm;
  return out;
}

/**
 * Combine several per-frame descriptors into one stable embedding. face-api
 * descriptors are unit-length, so we take the mean and re-normalize to get the
 * "mean direction". Averaging cancels per-frame noise (slight pose changes,
 * lighting, glasses glare, momentary blur) — a big accuracy gain that costs
 * almost nothing (pure math, no extra model inference).
 */
export function averageDescriptors(
  list: Array<number[] | Float32Array>
): number[] {
  const valid = list.filter((d) => d && d.length === 128);
  if (!valid.length) return [];
  if (valid.length === 1) return normalizeDescriptor(valid[0]);

  const sum = new Array<number>(128).fill(0);
  for (const d of valid) {
    for (let i = 0; i < 128; i++) sum[i] += d[i];
  }
  for (let i = 0; i < 128; i++) sum[i] /= valid.length;
  return normalizeDescriptor(sum);
}
