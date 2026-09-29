import { DESCRIPTOR_LENGTH } from "@/lib/face-types";

export function isFaceVerificationEnabled(): boolean {
  return process.env.FACE_VERIFICATION_ENABLED !== "false";
}

/**
 * Max euclidean distance for same person (lower = stricter).
 * Default 0.38 — look-alikes often land ~0.40–0.50; genuine enrolled matches
 * are typically well under 0.38 with a few clear photos.
 */
export function getMaxMatchDistance(): number {
  const raw = process.env.FACE_MATCH_MAX_DISTANCE;
  const parsed = raw ? parseFloat(raw) : 0.38;
  // Hard upper clamp 0.40 so misconfiguration (e.g. old .env 0.45) cannot loosen.
  return Number.isFinite(parsed) ? Math.min(0.4, Math.max(0.3, parsed)) : 0.38;
}

export function getMinMatchingPhotos(totalEnrolled: number): number {
  const raw = process.env.FACE_MIN_MATCH_PHOTOS;
  // Default 3: look-alikes may luck one/two close photos; three agreements is harder.
  const configured = raw ? parseInt(raw, 10) : 3;
  const want = Number.isFinite(configured) && configured > 0 ? configured : 3;
  return Math.min(totalEnrolled, Math.max(1, want));
}

/** Minimum similarity score stored on biometric token (derived from distance). */
export function getSimilarityMin(): number {
  const maxDist = getMaxMatchDistance();
  return Math.max(0.4, 1 - maxDist / 0.65);
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
  // Average of the closest 2–3 enrolled photos — all must be genuinely close.
  const k = Math.min(Math.max(2, minMatchingPhotos), sorted.length);
  const avgDistance = sorted.slice(0, k).reduce((a, b) => a + b, 0) / k;

  // Security-first decision: ALL of the following must hold.
  //  1. the single closest enrolled photo is a clear match,
  //  2. the closest-k average is also within the threshold (no slack), and
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

/** How much closer self must be than any OTHER enrolled person. */
const RIVAL_SAFETY_MARGIN = 0.18;

/** Hard clarity cap — even if env is loosened, never accept a weak best hit. */
const ABSOLUTE_BEST_CAP = 0.36;

/**
 * Average of L2-normalized enrollment vectors. Look-alikes may luck one photo
 * but rarely sit near the whole enrollment set.
 */
export function enrollmentCentroid(descriptors: number[][]): number[] | null {
  if (!descriptors.length) return null;
  const acc = new Array<number>(DESCRIPTOR_LENGTH).fill(0);
  for (const d of descriptors) {
    const n = l2normalize(d);
    for (let i = 0; i < DESCRIPTOR_LENGTH; i++) acc[i] += n[i];
  }
  const inv = 1 / descriptors.length;
  for (let i = 0; i < DESCRIPTOR_LENGTH; i++) acc[i] *= inv;
  return l2normalize(acc);
}

export type RivalHit = { employeeId: string; distance: number };

/** Closest other enrolled employee (full gallery). */
export function findClosestRival(
  probe: number[],
  rivals: Array<{ employeeId: string; descriptors: number[][] }>,
  _selfBestDistance?: number,
  _maxDistance?: number
): RivalHit | null {
  let best: RivalHit | null = null;
  for (const rival of rivals) {
    if (!rival.descriptors.length) continue;
    const dist = Math.min(...rival.descriptors.map((d) => euclideanDistance(probe, d)));
    if (!best || dist < best.distance) {
      best = { employeeId: rival.employeeId, distance: dist };
    }
  }
  return best;
}

/**
 * After a self-match passes the distance threshold, confirm identity:
 * - probe near enrollment centroid (blocks one-photo luck)
 * - claimed person is nearest in the gallery
 * - clear gap vs next identity (blocks look-alikes)
 * - no other enrolled person within the accept / near-accept band
 */
export function assertUniqueIdentity(
  probe: number[],
  selfBestDistance: number,
  selfDescriptors: number[][],
  rivals: Array<{ employeeId: string; descriptors: number[][] }>,
  maxDistance: number
): { ok: true } | { ok: false; reason: string; employeeId?: string } {
  const centroid = enrollmentCentroid(selfDescriptors);
  if (centroid) {
    const toCentroid = euclideanDistance(probe, centroid);
    // No slack — look-alikes that luck one photo fail the full-set check
    if (toCentroid > maxDistance) {
      return {
        ok: false,
        reason:
          "Face does not match your enrolled photo set closely enough (look-alike rejected).",
      };
    }
  }

  // Absolute clarity: best hit must be clearly the enrolled person
  if (selfBestDistance > Math.min(maxDistance, ABSOLUTE_BEST_CAP)) {
    return {
      ok: false,
      reason: "Face match is too weak — only a clear match to enrolled photos is allowed.",
    };
  }

  // Median distance to enrollment set — blocks partial / angled look-alike hits
  if (selfDescriptors.length >= 3) {
    const all = selfDescriptors
      .map((d) => euclideanDistance(probe, d))
      .sort((a, b) => a - b);
    const mid = all[Math.floor(all.length / 2)];
    if (mid > maxDistance + 0.04) {
      return {
        ok: false,
        reason:
          "Face only partially matches enrollment photos — look-alike or poor capture rejected.",
      };
    }
  }

  const rival = findClosestRival(probe, rivals);
  if (!rival) return { ok: true };

  if (rival.distance <= selfBestDistance) {
    return {
      ok: false,
      employeeId: rival.employeeId,
      reason: `Face is closer to employee ID ${rival.employeeId} than to your enrollment.`,
    };
  }

  if (rival.distance - selfBestDistance < RIVAL_SAFETY_MARGIN) {
    return {
      ok: false,
      employeeId: rival.employeeId,
      reason: `Face is too similar to employee ID ${rival.employeeId} — only a unique match can proceed.`,
    };
  }

  // Reject if another enrolled person is inside accept band OR near it
  if (rival.distance <= maxDistance + RIVAL_SAFETY_MARGIN * 0.5) {
    return {
      ok: false,
      employeeId: rival.employeeId,
      reason: `Face also matches employee ID ${rival.employeeId}. Action blocked.`,
    };
  }

  return { ok: true };
}
