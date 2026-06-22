let cachedFingerprint: string | null = null;

/** Stable browser/device id — survives localStorage + cookie clear on same PC/browser. */
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

  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(parts));
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  cachedFingerprint = `fp_${hex}`;
  return cachedFingerprint;
}
