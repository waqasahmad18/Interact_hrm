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

const RIVAL_SAFETY_MARGIN = 0.1;
/** Presence / Guard: look-alikes need a clearer gap vs claimed enrollment. */
const PRESENCE_RIVAL_GAP = 0.12;

/**
 * Average of L2-normalized enrollment vectors — look-alikes may luck one photo
 * but rarely sit near the whole enrollment cloud.
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

/** Closest other enrolled employee to this probe (full gallery scan). */
export function findClosestRival(
  probe: number[],
  rivals: Array<{ employeeId: string; descriptors: number[][] }>,
  _selfBestDistance: number,
  _maxDistance: number,
  _opts?: { presenceStrict?: boolean }
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
 * Proper open-set + 1:N check:
 * 1) claimed enrollment must match (already done by caller)
 * 2) claimed must be the nearest identity in the gallery
 * 3) gap to next identity must be clear (rejects similar faces)
 * 4) probe must also sit near the enrollment centroid
 */
export function assertUniqueIdentity(
  probe: number[],
  selfBestDistance: number,
  selfDescriptors: number[][],
  rivals: Array<{ employeeId: string; descriptors: number[][] }>,
  opts: { presenceStrict?: boolean; maxDistance: number }
): { ok: true } | { ok: false; employeeId?: string; distance?: number; reason: string } {
  const presenceStrict = Boolean(opts.presenceStrict);
  const minGap = presenceStrict ? PRESENCE_RIVAL_GAP : RIVAL_SAFETY_MARGIN;
  const maxDistance = opts.maxDistance;

  const centroid = enrollmentCentroid(selfDescriptors);
  if (centroid) {
    const toCentroid = euclideanDistance(probe, centroid);
    // Slightly looser than maxDistance — centroid is stricter than best single photo
    const centroidCap = presenceStrict ? Math.min(maxDistance, 0.43) : maxDistance + 0.02;
    if (toCentroid > centroidCap) {
      return {
        ok: false,
        reason: "Face does not match the enrolled photo set closely enough (look-alike rejected).",
      };
    }
  }

  const rival = findClosestRival(probe, rivals, selfBestDistance, maxDistance, {
    presenceStrict,
  });
  if (!rival) {
    // No other enrolled faces — for desk checks require a clearer self-hit
    // so an unenrolled look-alike cannot scrape by on a loose single-photo score.
    if (presenceStrict && selfBestDistance > Math.min(maxDistance, 0.41)) {
      return {
        ok: false,
        reason: "Seat check needs a clearer match to your enrolled photos.",
      };
    }
    return { ok: true };
  }

  // Claimed person must be nearer than every other enrolled identity
  if (rival.distance <= selfBestDistance) {
    return {
      ok: false,
      employeeId: rival.employeeId,
      distance: rival.distance,
      reason: `Face is closer to employee ID ${rival.employeeId} than to your enrollment.`,
    };
  }

  // Clear separation — similar faces fail here even if both are "under threshold"
  if (rival.distance - selfBestDistance < minGap) {
    return {
      ok: false,
      employeeId: rival.employeeId,
      distance: rival.distance,
      reason: `Face is too similar to employee ID ${rival.employeeId} — only a clear unique match is allowed.`,
    };
  }

  // Presence: another person matching within accept band is always wrong
  if (presenceStrict && rival.distance <= maxDistance) {
    return {
      ok: false,
      employeeId: rival.employeeId,
      distance: rival.distance,
      reason: `Face also matches employee ID ${rival.employeeId}. Seat check blocked.`,
    };
  }

  return { ok: true };
}

/** @deprecated kept for imports — use assertUniqueIdentity */
export function getPresenceMaxMatchDistance(): number {
  return getMaxMatchDistance();
}
