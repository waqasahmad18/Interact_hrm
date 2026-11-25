#!/usr/bin/env python3
"""
Interact Guard — offline speech-to-text sidecar (faster-whisper small).

Office audio is EN / Urdu / Hindi. Output is always English text
(Whisper task=translate) so Convert never lands on Chinese/etc.

Usage:
  python transcribe.py --wav path/to/clip.wav [--model small] [--device cpu]

Stdout (JSON only):
  {"ok": true, "text": "...", "language": "en", "source_language": "ur", ...}
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time

ALLOWED_LANGS = ("en", "ur", "hi")
HALLUCINATION_RE = re.compile(
    r"(please subscribe|thanks for watching|thank you for watching|"
    r"like and subscribe|click the bell)",
    re.I,
)


def emit(payload: dict) -> None:
    """Write JSON to stdout as UTF-8. Windows cp1252 consoles break on Urdu/Hindi."""
    line = json.dumps(payload, ensure_ascii=False) + "\n"
    try:
        sys.stdout.buffer.write(line.encode("utf-8"))
        sys.stdout.buffer.flush()
    except Exception:
        sys.stdout.write(json.dumps(payload, ensure_ascii=True) + "\n")
        sys.stdout.flush()


def language_probs(model, wav: str) -> dict[str, float]:
    try:
        from faster_whisper.audio import decode_audio

        audio = decode_audio(wav, sampling_rate=16000)
        detected = model.detect_language(audio)
        probs: dict[str, float] = {}
        if isinstance(detected, tuple) and len(detected) >= 3 and detected[2]:
            for item in detected[2]:
                if isinstance(item, (list, tuple)) and len(item) >= 2:
                    probs[str(item[0])] = float(item[1])
        return probs
    except Exception:
        return {}


def candidate_source_langs(probs: dict[str, float]) -> list[str]:
    """Pick en/ur/hi candidates. Never Chinese. Prefer ur when tied with hi."""
    scored = [(code, float(probs.get(code, 0.0) or 0.0)) for code in ALLOWED_LANGS]
    scored.sort(key=lambda x: x[1], reverse=True)
    top_code, top_p = scored[0]
    cands = [top_code]
    # Near-ties: try second language too (common ur≈hi confusion).
    if len(scored) > 1 and scored[1][1] >= max(0.15, top_p - 0.08):
        cands.append(scored[1][0])
    # Prefer including ur for PK office when both South-Asian are plausible.
    ur_p = float(probs.get("ur", 0.0) or 0.0)
    hi_p = float(probs.get("hi", 0.0) or 0.0)
    if ur_p >= 0.25 and hi_p >= 0.25 and "ur" not in cands:
        cands.append("ur")
    # Keep order unique
    out: list[str] = []
    for c in cands:
        if c not in out:
            out.append(c)
    return out or ["en"]


def score_transcript(text: str, avg_logprobs: list[float]) -> float:
    text = (text or "").strip()
    if not text:
        return -99.0
    words = text.lower().split()
    n = max(1, len(words))
    uniq = len(set(words)) / n
    # Heavy repetition (same phrase loop) → low score
    rep_pen = 0.0
    if n >= 8:
        # ratio of most common word
        from collections import Counter

        common = Counter(words).most_common(1)[0][1] / n
        if common > 0.35:
            rep_pen -= 2.0
    hall = -3.0 if HALLUCINATION_RE.search(text) else 0.0
    lp = sum(avg_logprobs) / len(avg_logprobs) if avg_logprobs else -1.0
    # Prefer some content length, but not endless loops
    len_bonus = min(1.5, n / 20.0)
    return lp + uniq + hall + len_bonus + rep_pen


def transcribe_english(model, wav: str, source_lang: str, task: str):
    segments, info = model.transcribe(
        wav,
        language=source_lang,
        task=task,
        vad_filter=True,
        vad_parameters={
            "min_silence_duration_ms": 500,
            "speech_pad_ms": 200,
        },
        beam_size=5,
        best_of=5,
        temperature=0.0,
        initial_prompt="Office conversation in English, Urdu, or Hindi.",
    )
    parts: list[str] = []
    lps: list[float] = []
    for seg in segments:
        t = (seg.text or "").strip()
        if t:
            parts.append(t)
        try:
            if seg.avg_logprob is not None:
                lps.append(float(seg.avg_logprob))
        except Exception:
            pass
    text = " ".join(parts).strip()
    return text, info, score_transcript(text, lps)


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
        sys.stderr.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    except Exception:
        pass

    parser = argparse.ArgumentParser(description="Offline Whisper STT for Interact Guard")
    parser.add_argument("--wav", required=True, help="Path to WAV / audio file")
    parser.add_argument("--model", default="small", help="Whisper model size (default: small)")
    parser.add_argument("--device", default="cpu", choices=("cpu", "cuda"), help="Inference device")
    parser.add_argument(
        "--compute-type",
        default="int8",
        help="faster-whisper compute type (cpu: int8, cuda: float16)",
    )
    parser.add_argument(
        "--task",
        default="translate",
        choices=("translate", "transcribe"),
        help="translate=always English text (default); transcribe=source script",
    )
    args = parser.parse_args()

    wav = args.wav
    try:
        from faster_whisper import WhisperModel
    except Exception as exc:  # noqa: BLE001
        emit({"ok": False, "error": f"faster-whisper import failed: {exc}"})
        return 2

    t0 = time.time()
    try:
        model = WhisperModel(
            args.model,
            device=args.device,
            compute_type=args.compute_type if args.device == "cpu" else "float16",
        )
        probs = language_probs(model, wav)
        candidates = candidate_source_langs(probs)

        best_text = ""
        best_source = candidates[0]
        best_score = -999.0
        best_info = None
        for lang in candidates:
            text, info, score = transcribe_english(model, wav, lang, args.task)
            if score > best_score:
                best_score = score
                best_text = text
                best_source = lang
                best_info = info

        out_lang = "en" if args.task == "translate" else (
            getattr(best_info, "language", None) if best_info else best_source
        ) or best_source
        out = {
            "ok": True,
            "text": best_text,
            "language": out_lang,
            "source_language": best_source,
            "source_language_probability": round(float(probs.get(best_source, 0.0) or 0.0), 4),
            "language_probability": getattr(best_info, "language_probability", None) if best_info else None,
            "duration_sec": round(time.time() - t0, 2),
            "model": args.model,
            "task": args.task,
            "candidates": candidates,
        }
        emit(out)
        return 0
    except Exception as exc:  # noqa: BLE001
        emit({"ok": False, "error": str(exc)})
        return 1


if __name__ == "__main__":
    sys.exit(main())
