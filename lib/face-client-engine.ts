"use client";

import type * as FaceApi from "@vladmandic/face-api";

const MODEL_URL = "/models/face-api";

type FaceApiModule = typeof FaceApi;
type TfModule = typeof import("@tensorflow/tfjs");

let faceapi: FaceApiModule | null = null;
let tf: TfModule | null = null;
let loadPromise: Promise<void> | null = null;

type TinyFaceDetectorOptions = FaceApi.TinyFaceDetectorOptions;
type FaceDetection = FaceApi.FaceDetection;

let LIVE_DESCRIPTOR: TinyFaceDetectorOptions | null = null;
let LIVE_DESCRIPTOR_FALLBACK: TinyFaceDetectorOptions | null = null;
let LIVE_FACE_COUNT: TinyFaceDetectorOptions | null = null;
let FACE_COUNT_DETECTORS: TinyFaceDetectorOptions[] | null = null;
let ENROLL_DETECTORS: TinyFaceDetectorOptions[] | null = null;

export type FaceScanOutcome =
  | { status: "none" }
  | { status: "multiple"; count: number }
  | { status: "ok"; descriptor: Float32Array };

const MIN_FACE_AREA_RATIO = 0.05;
const ENROLL_MIN_FACE_AREA_RATIO = 0.025;
const COUNT_MIN_FACE_AREA_RATIO = 0.035;

let videoCanvasFull: HTMLCanvasElement | null = null;
let videoCanvasCrop: HTMLCanvasElement | null = null;

async function initFaceRuntime(): Promise<void> {
  if (faceapi && tf && LIVE_DESCRIPTOR) return;

  const [faceapiMod, tfMod] = await Promise.all([
    import("@vladmandic/face-api"),
    import("@tensorflow/tfjs"),
  ]);

  faceapi = faceapiMod;
  tf = tfMod;

  LIVE_DESCRIPTOR = new faceapi.TinyFaceDetectorOptions({
    inputSize: 320,
    scoreThreshold: 0.38,
  });
  LIVE_DESCRIPTOR_FALLBACK = new faceapi.TinyFaceDetectorOptions({
    inputSize: 384,
    scoreThreshold: 0.3,
  });
  LIVE_FACE_COUNT = new faceapi.TinyFaceDetectorOptions({
    inputSize: 384,
    scoreThreshold: 0.26,
  });
  FACE_COUNT_DETECTORS = [
    new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.28 }),
    new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.2 }),
    new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.15 }),
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

export async function ensureFaceModelsLoaded(): Promise<void> {
  if (typeof window === "undefined") return;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    await initFaceRuntime();
    if (!tf || !faceapi) return;

    try {
      await tf.setBackend("webgl");
      await tf.ready();
    } catch {
      await tf.setBackend("cpu");
      await tf.ready();
    }

    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);

    await warmUpInference();
  })();

  return loadPromise;
}

export function resetFaceModelsForRetry(): void {
  loadPromise = null;
}

function minArea(canvas: HTMLCanvasElement, ratio: number): number {
  return canvas.width * canvas.height * ratio;
}

function filterByArea(
  canvas: HTMLCanvasElement,
  detections: FaceDetection[],
  ratio: number
): FaceDetection[] {
  const area = minArea(canvas, ratio);
  return detections.filter((d) => d.box.width * d.box.height >= area);
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
    const count = filterByArea(canvas, detections, COUNT_MIN_FACE_AREA_RATIO).length;
    if (count > maxCount) maxCount = count;
    if (maxCount >= 2) return maxCount;
  }

  return maxCount;
}

/** Fast live check — one detector, full frame (used right before verify). */
export async function quickCountFacesInVideo(video: HTMLVideoElement): Promise<number> {
  await ensureFaceModelsLoaded();
  if (!faceapi || !LIVE_FACE_COUNT) return 0;

  const full = drawVideoToCanvas(video, "full", 384);
  if (!full) return 0;
  const detections = await faceapi.detectAllFaces(full, LIVE_FACE_COUNT);
  return filterByArea(full, detections, COUNT_MIN_FACE_AREA_RATIO).length;
}

export async function countFacesInVideo(video: HTMLVideoElement): Promise<number> {
  await ensureFaceModelsLoaded();
  const full = drawVideoToCanvas(video, "full", 384);
  const crop = drawVideoToCanvas(video, "crop", 320);
  const counts = await Promise.all([
    full ? countFacesOnCanvas(full) : Promise.resolve(0),
    crop ? countFacesOnCanvas(crop) : Promise.resolve(0),
  ]);
  return Math.max(counts[0], counts[1]);
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
      return { status: "ok", descriptor: significant[0].descriptor };
    }
  }

  if (maxMultiple >= 2) return { status: "multiple", count: maxMultiple };
  return { status: "none" };
}

export async function scanVideoFrame(video: HTMLVideoElement): Promise<FaceScanOutcome> {
  await ensureFaceModelsLoaded();
  if (!LIVE_DESCRIPTOR || !LIVE_DESCRIPTOR_FALLBACK) return { status: "none" };

  const cropCanvas = drawVideoToCanvas(video, "crop", 320);
  if (!cropCanvas) return { status: "none" };

  for (const detector of [LIVE_DESCRIPTOR, LIVE_DESCRIPTOR_FALLBACK]) {
    const { significant } = await detectWithDescriptors(
      cropCanvas,
      detector,
      MIN_FACE_AREA_RATIO
    );
    if (significant.length >= 2) {
      return { status: "multiple", count: significant.length };
    }
    if (significant.length === 1 && significant[0].descriptor) {
      return { status: "ok", descriptor: significant[0].descriptor };
    }
  }

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
