# Interact Guard STT sidecar (faster-whisper small)

Offline speech-to-text for EN + Urdu/Hindi. Agent records mic chunks and calls this script.

## Staging setup (one PC)

```bat
cd interact-guard\stt-sidecar
py -3.11 -m venv .venv
.venv\Scripts\pip install -r requirements.txt
.venv\Scripts\python transcribe.py --wav test.wav --model small
```

First run downloads the `small` model (~500MB) into the Hugging Face cache.

## Agent env

Set `GUARD_STT_PYTHON` to the venv python, e.g.:

`C:\...\interact-guard\stt-sidecar\.venv\Scripts\python.exe`
