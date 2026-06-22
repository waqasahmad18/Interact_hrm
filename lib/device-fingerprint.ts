let cachedFingerprint: string | null = null;

function bytesToHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** FNV-1a fallback when crypto.subtle is unavailable (plain HTTP). */
function fallbackFingerprintHex(parts: string): string {
  let hash = 2166136261;
  for (let i = 0; i < parts.length; i++) {
    hash ^= parts.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const seed = (hash >>> 0).toString(16).padStart(8, "0");
  let acc = seed + parts;
  for (let round = 0; round < 3; round++) {
    let h = 0;
    for (let i = 0; i < acc.length; i++) {
      h = (Math.imul(31, h) + acc.charCodeAt(i)) | 0;
    }
    acc += (h >>> 0).toString(16);
  }
  return acc.replace(/[^a-f0-9]/gi, "0").slice(0, 64).padEnd(64, "0");
}

/** Exactly 64 chars — fits DB device_key column. Survives localStorage + cookie clear. */
export async function getStableDeviceFingerprint(): Promise<string> {
  if (cachedFingerprint) return cachedFingerprint;
  if (typeof window === "undefined") return "";

  const parts = [
    navigator.userAgent,
    navigator.language,
    navigator.platform,
    String(screen.width),
    String(screen.height),
    String(screen.colorDepth),
    String(window.devicePixelRatio ?? 1),
    Intl.DateTimeFormat().resolvedOptions().timeZone ?? "",
    String(navigator.hardwareConcurrency ?? 0),
  ].join("|");

  try {
    if (window.crypto?.subtle) {
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(parts));
      cachedFingerprint = bytesToHex(digest).slice(0, 64);
      return cachedFingerprint;
    }
  } catch {
    // fall through
  }

  cachedFingerprint = fallbackFingerprintHex(parts);
  return cachedFingerprint;
}
