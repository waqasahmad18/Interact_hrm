/**
 * NAudio often writes PCM WAV with 18-byte fmt (WAVEFORMATEX + cbSize=0).
 * Chrome audio element then shows 0:00 / 0:00. Rewrite to classic 44-byte PCM header.
 */
export function ensureClassicPcmWav(buf: Buffer): Buffer {
  if (buf.length < 44) return buf;
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") {
    return buf;
  }

  // Already classic: fmt size 16 at offset 16
  const fmtSize = buf.readUInt32LE(16);
  if (buf.toString("ascii", 12, 16) === "fmt " && fmtSize === 16) {
    return buf;
  }

  // Find fmt + data chunks
  let offset = 12;
  let audioFormat = 1;
  let channels = 1;
  let sampleRate = 16000;
  let bitsPerSample = 16;
  let dataOffset = -1;
  let dataSize = 0;

  while (offset + 8 <= buf.length) {
    const id = buf.toString("ascii", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === "fmt " && size >= 16 && body + 16 <= buf.length) {
      audioFormat = buf.readUInt16LE(body);
      channels = buf.readUInt16LE(body + 2);
      sampleRate = buf.readUInt32LE(body + 4);
      bitsPerSample = buf.readUInt16LE(body + 14);
    } else if (id === "data") {
      dataOffset = body;
      dataSize = Math.min(size, buf.length - body);
      break;
    }
    offset = body + size + (size % 2); // word align
  }

  if (dataOffset < 0 || audioFormat !== 1) return buf;

  const blockAlign = (channels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const out = Buffer.alloc(44 + dataSize);
  out.write("RIFF", 0);
  out.writeUInt32LE(36 + dataSize, 4);
  out.write("WAVE", 8);
  out.write("fmt ", 12);
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20); // PCM
  out.writeUInt16LE(channels, 22);
  out.writeUInt32LE(sampleRate, 24);
  out.writeUInt32LE(byteRate, 28);
  out.writeUInt16LE(blockAlign, 32);
  out.writeUInt16LE(bitsPerSample, 34);
  out.write("data", 36);
  out.writeUInt32LE(dataSize, 40);
  buf.copy(out, 44, dataOffset, dataOffset + dataSize);
  return out;
}
