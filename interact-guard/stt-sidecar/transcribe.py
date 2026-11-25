#!/usr/bin/env python3
"""
Interact Guard — offline speech-to-text sidecar (faster-whisper small).

Usage:
  python transcribe.py --wav path/to/clip.wav [--model small] [--device cpu]

Stdout (JSON only):
  {"ok": true, "text": "...", "language": "ur", "duration_sec": 24.1}
"""

from __future__ import annotations

import argparse
import json
import sys
import time


def main() -> int:
    parser = argparse.ArgumentParser(description="Offline Whisper STT for Interact Guard")
    parser.add_argument("--wav", required=True, help="Path to 16kHz mono WAV (or any ffmpeg-readable audio)")
    parser.add_argument("--model", default="small", help="Whisper model size (default: small)")
    parser.add_argument("--device", default="cpu", choices=("cpu", "cuda"), help="Inference device")
    parser.add_argument(
        "--compute-type",
        default="int8",
        help="faster-whisper compute type (cpu: int8, cuda: float16)",
    )
    args = parser.parse_args()

    wav = args.wav
    try:
        from faster_whisper import WhisperModel
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"ok": False, "error": f"faster-whisper import failed: {exc}"}))
        return 2

    t0 = time.time()
    try:
        model = WhisperModel(
            args.model,
            device=args.device,
            compute_type=args.compute_type if args.device == "cpu" else "float16",
        )
        # language=None → auto-detect (EN / Urdu / Hindi / mixed)
        segments, info = model.transcribe(
            wav,
            language=None,
            task="transcribe",
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 400},
            beam_size=5,
            best_of=5,
            temperature=0.0,
        )
        parts: list[str] = []
        for seg in segments:
            text = (seg.text or "").strip()
            if text:
                parts.append(text)
        text = " ".join(parts).strip()
        out = {
            "ok": True,
            "text": text,
            "language": getattr(info, "language", None),
            "language_probability": getattr(info, "language_probability", None),
            "duration_sec": round(time.time() - t0, 2),
            "model": args.model,
        }
        print(json.dumps(out, ensure_ascii=False))
        return 0
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"ok": False, "error": str(exc)}))
        return 1


if __name__ == "__main__":
    sys.exit(main())
