/**
 * Extract FileVersion from a Windows PE (.exe) buffer (cross-platform).
 * Looks for VS_FIXEDFILEINFO signature 0xFEEF04BD.
 */
export function extractExeFileVersion(buf: Buffer): string | null {
  if (!buf || buf.length < 64) return null;
  if (buf[0] !== 0x4d || buf[1] !== 0x5a) return null; // MZ

  const sig = Buffer.from([0xbd, 0x04, 0xef, 0xfe]); // little-endian 0xFEEF04BD
  let from = 0;
  while (from < buf.length - 52) {
    const idx = buf.indexOf(sig, from);
    if (idx < 0) break;
    // Need room for FixedFileInfo (52 bytes minimum for version fields)
    if (idx + 16 <= buf.length) {
      const ms = buf.readUInt32LE(idx + 8);
      const ls = buf.readUInt32LE(idx + 12);
      const major = (ms >>> 16) & 0xffff;
      const minor = ms & 0xffff;
      const build = (ls >>> 16) & 0xffff;
      const revision = ls & 0xffff;
      // Sanity: reject nonsense versions
      if (major < 1000 && minor < 1000 && build < 100000 && revision < 100000) {
        // Prefer 3-part if revision is 0 (matches our assembly style 0.4.0)
        if (revision === 0) return `${major}.${minor}.${build}`;
        return `${major}.${minor}.${build}.${revision}`;
      }
    }
    from = idx + 1;
  }

  // Fallback: Unicode "FileVersion" string table value
  const fromString = extractFromVersionString(buf);
  return fromString;
}

function extractFromVersionString(buf: Buffer): string | null {
  // UTF-16LE "FileVersion\0"
  const key = Buffer.from("F\0i\0l\0e\0V\0e\0r\0s\0i\0o\0n\0\0\0", "binary");
  const idx = buf.indexOf(key);
  if (idx < 0) return null;
  let p = idx + key.length;
  // skip padding / length fields — scan forward for digit.digit pattern in UTF-16
  const end = Math.min(buf.length, p + 128);
  let s = "";
  for (let i = p; i + 1 < end; i += 2) {
    const code = buf.readUInt16LE(i);
    if (code === 0) {
      if (s) break;
      continue;
    }
    if (code >= 32 && code < 127) s += String.fromCharCode(code);
  }
  const m = s.match(/(\d+\.\d+(?:\.\d+){0,2})/);
  return m ? m[1] : null;
}
