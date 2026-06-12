import { DESCRIPTOR_LENGTH } from "@/lib/face-types";

export function isFaceVerificationEnabled(): boolean {
  return process.env.FACE_VERIFICATION_ENABLED !== "false";
}

/** Max euclidean distance for same person (lower = stricter). Typical face-api: 0.6 */
export function getMaxMatchDistance(): number {
  const raw = process.env.FACE_MATCH_MAX_DISTANCE;
  const parsed = raw ? parseFloat(raw) : 0.55;
  return Number.isFinite(parsed) ? Math.min(0.75, Math.max(0.35, parsed)) : 0.55;
}

export function getMinMatchingPhotos(totalEnrolled: number): number {
  const raw = process.env.FACE_MIN_MATCH_PHOTOS;
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

export function euclideanDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < DESCRIPTOR_LENGTH; i++) {
    const d = a[i] - b[i];
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
  const usedForAvg = sorted.slice(0, Math.min(3, sorted.length));
  const avgDistance = usedForAvg.reduce((a, b) => a + b, 0) / usedForAvg.length;

  const pass =
    matchCount >= minMatchingPhotos &&
    bestDistance <= maxDistance &&
    avgDistance <= maxDistance * 1.08;

  return {
    pass,
    bestDistance,
    avgDistance,
    matchCount,
    similarity: distanceToSimilarity(bestDistance),
  };
}

export function findClosestRival(
  probe: number[],
  rivals: Array<{ employeeId: string; descriptors: number[][] }>,
  selfBestDistance: number,
  maxDistance: number
): { employeeId: string; distance: number } | null {
  let best: { employeeId: string; distance: number } | null = null;

  for (const rival of rivals) {
    if (!rival.descriptors.length) continue;
    const dist = Math.min(...rival.descriptors.map((d) => euclideanDistance(probe, d)));
    if (dist > maxDistance) continue;
    if (!best || dist < best.distance) {
      best = { employeeId: rival.employeeId, distance: dist };
    }
  }

  if (!best) return null;
  if (best.distance + 0.04 < selfBestDistance) return best;
  return null;
}
