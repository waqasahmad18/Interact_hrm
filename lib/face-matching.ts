import { DESCRIPTOR_LENGTH } from "@/lib/face-types";

export function isFaceVerificationEnabled(): boolean {
  return process.env.FACE_VERIFICATION_ENABLED !== "false";
}

/**
 * Max euclidean distance for same person (lower = stricter). face-api's loose
 * "default" is 0.6, but for 1:1 attendance that lets look-alikes through. 0.45
 * is security-first: it rejects other people while still admitting the genuine
 * person when they are enrolled with a few clear, varied photos.
 */
export function getMaxMatchDistance(): number {
  const raw = process.env.FACE_MATCH_MAX_DISTANCE;
  const parsed = raw ? parseFloat(raw) : 0.45;
  // Hard upper clamp 0.52 so misconfiguration can never make it dangerously loose.
  return Number.isFinite(parsed) ? Math.min(0.52, Math.max(0.35, parsed)) : 0.45;
}

export function getMinMatchingPhotos(totalEnrolled: number): number {
  const raw = process.env.FACE_MIN_MATCH_PHOTOS;
  // Default 2: at least two independent enrolled photos must agree. A single
  // close match is too easy for a look-alike to trigger by chance — requiring
  // corroboration from a second photo is the main guard against false accepts.
  const configured = raw ? parseInt(raw, 10) : 2;
  const want = Number.isFinite(configured) && configured > 0 ? configured : 2;
  return Math.min(totalEnrolled, Math.max(1, want));
}

/** Minimum similarity score stored on biometric token (derived from distance). */
export function getSimilarityMin(): number {
  const maxDist = getMaxMatchDistance();
  return Math.max(0.35, 1 - maxDist / 0.65);
}

export function isValidDescriptor(descriptor: unknown): descriptor is number[] {
  return (
    Array.isArray(descriptor) &&
    descriptor.length === DESCRIPTOR_LENGTH &&
    descriptor.every((n) => typeof n === "number" && Number.isFinite(n))
  );
}

/** L2-normalize to unit length so the metric is identical for every descriptor:
 * raw enrolled photos, single-frame probes, and averaged multi-frame probes. */
function l2normalize(d: number[]): number[] {
  let norm = 0;
  for (let i = 0; i < DESCRIPTOR_LENGTH; i++) norm += d[i] * d[i];
  norm = Math.sqrt(norm) || 1;
  const out = new Array<number>(DESCRIPTOR_LENGTH);
  for (let i = 0; i < DESCRIPTOR_LENGTH; i++) out[i] = d[i] / norm;
  return out;
}

export function euclideanDistance(a: number[], b: number[]): number {
  const na = l2normalize(a);
  const nb = l2normalize(b);
  let sum = 0;
  for (let i = 0; i < DESCRIPTOR_LENGTH; i++) {
    const d = na[i] - nb[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

export function distanceToSimilarity(distance: number): number {
  const scale = 0.65;
  return Math.max(0, Math.min(1, 1 - distance / scale));
}

export type SelfMatchResult = {
  pass: boolean;
  bestDistance: number;
  avgDistance: number;
  matchCount: number;
  similarity: number;
};

export function matchProbeToDescriptors(
  probe: number[],
  enrolled: number[][],
  maxDistance: number,
  minMatchingPhotos: number
): SelfMatchResult {
  if (!enrolled.length) {
    return { pass: false, bestDistance: 99, avgDistance: 99, matchCount: 0, similarity: 0 };
  }

  const distances = enrolled.map((d) => euclideanDistance(probe, d));
  const sorted = [...distances].sort((a, b) => a - b);
  const bestDistance = sorted[0];
  const matchCount = distances.filter((d) => d <= maxDistance).length;
  // Average of the two CLOSEST enrolled photos — both must be genuinely close.
  const k = Math.min(2, sorted.length);
  const avgDistance = sorted.slice(0, k).reduce((a, b) => a + b, 0) / k;

  // Security-first decision: ALL of the following must hold.
  //  1. the single closest enrolled photo is a clear match,
  //  2. the closest-two average is also within the threshold (no slack), and
  //  3. at least `minMatchingPhotos` enrolled photos individually match.
  const pass =
    bestDistance <= maxDistance &&
    avgDistance <= maxDistance &&
    matchCount >= minMatchingPhotos;

  return {
    pass,
    bestDistance,
    avgDistance,
    matchCount,
    similarity: distanceToSimilarity(bestDistance),
  };
}

/** How much closer the self match must be than any OTHER enrolled person. If a
 * different person is within this margin the result is ambiguous and rejected. */
const RIVAL_SAFETY_MARGIN = 0.1;

export function findClosestRival(
  probe: number[],
  rivals: Array<{ employeeId: string; descriptors: number[][] }>,
  selfBestDistance: number,
  maxDistance: number
): { employeeId: string; distance: number } | null {
  let best: { employeeId: string; distance: number } | null = null;

  // Consider rivals a little beyond the accept threshold too, so an enrolled
  // look-alike sitting just outside the threshold still triggers the ambiguity
  // guard instead of being silently ignored.
  const considerCap = maxDistance + 0.15;

  for (const rival of rivals) {
    if (!rival.descriptors.length) continue;
    const dist = Math.min(...rival.descriptors.map((d) => euclideanDistance(probe, d)));
    if (dist > considerCap) continue;
    if (!best || dist < best.distance) {
      best = { employeeId: rival.employeeId, distance: dist };
    }
  }

  if (!best) return null;
  // Reject when another enrolled person is closer, equal, OR merely comparably
  // close (within the safety margin) to the self match.
  if (best.distance <= selfBestDistance + RIVAL_SAFETY_MARGIN) return best;
  return null;
}
