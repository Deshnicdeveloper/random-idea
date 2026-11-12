"""Selah voice service: free, local text-to-speech with Kokoro (Apache 2.0).

Run:   npm run voice          (or: voice-service/.venv/bin/python voice-service/server.py)
API:   GET  /health  -> {"ok": true, "voices": [...]}
       POST /tts     {"text": "...", "voice": "am_michael", "lang": "en-us", "speed": 0.95} -> audio/mpeg

Paragraphs (blank-line separated) are spoken one by one with a short pause between them, then
encoded as a 64 kbps mono MP3 (about 0.5 MB per minute).
"""

import json
import os
import re
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import lameenc
import numpy as np
from kokoro_onnx import Kokoro

HERE = Path(__file__).parent
# The full model is ~3x faster than the int8 one on Intel CPUs (2.7x vs 0.9x real time, tested Nov 2026)
# and sounds slightly cleaner. Set KOKORO_MODEL to the int8 file only if memory is tight.
MODEL = Path(os.environ.get("KOKORO_MODEL", HERE / "models" / "kokoro-v1.0.onnx"))
VOICES = Path(os.environ.get("KOKORO_VOICES", HERE / "models" / "voices-v1.0.bin"))
HOST = os.environ.get("HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", "8880"))
MAX_TEXT = 6000
PARAGRAPH_PAUSE = 0.6  # seconds of silence between paragraphs
LANGS = {"en-us", "en-gb", "fr-fr"}

print(f"Loading Kokoro from {MODEL.name} ...", flush=True)
kokoro = Kokoro(str(MODEL), str(VOICES))
VOICE_LIST = sorted(kokoro.get_voices())
lock = threading.Lock()  # one synthesis at a time keeps CPU use predictable
print(f"Ready: {len(VOICE_LIST)} voices on http://{HOST}:{PORT}", flush=True)


def voice_style(spec: str):
    """A voice name ("am_michael") or a blend ("am_onyx:0.6+am_michael:0.4")."""
    if "+" not in spec and ":" not in spec:
        return spec
    style = None
    for part in spec.split("+"):
        name, _, weight = part.partition(":")
        vec = kokoro.get_voice_style(name.strip()) * float(weight or 1)
        style = vec if style is None else style + vec
    return style


def valid_voice(spec: str) -> bool:
    try:
        return all(p.partition(":")[0].strip() in VOICE_LIST and float(p.partition(":")[2] or 1) > 0 for p in spec.split("+"))
    except ValueError:
        return False


def synthesize(text: str, voice: str, lang: str, speed: float, pause_after: bool = False) -> tuple[bytes, float]:
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    chunks: list[np.ndarray] = []
    sample_rate = 24000
    with lock:
        for i, para in enumerate(paragraphs):
            samples, sample_rate = kokoro.create(para, voice=voice_style(voice), speed=speed, lang=lang)
            chunks.append(samples)
            if i < len(paragraphs) - 1 or pause_after:
                chunks.append(np.zeros(int(sample_rate * PARAGRAPH_PAUSE), dtype=np.float32))
    audio = np.concatenate(chunks) if chunks else np.zeros(1, dtype=np.float32)
    pcm = (np.clip(audio, -1.0, 1.0) * 32767).astype(np.int16).tobytes()
    enc = lameenc.Encoder()
    enc.set_bit_rate(64)
    enc.set_in_sample_rate(sample_rate)
    enc.set_channels(1)
    enc.set_quality(2)
    mp3 = enc.encode(pcm) + enc.flush()
    return mp3, len(audio) / sample_rate


class Handler(BaseHTTPRequestHandler):
    def _json(self, status: int, body: dict) -> None:
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/health":
            return self._json(200, {"ok": True, "voices": VOICE_LIST})
        self._json(404, {"error": "not found"})

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/tts":
            return self._json(404, {"error": "not found"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            body = json.loads(self.rfile.read(min(length, 100_000)) or b"{}")
        except (ValueError, json.JSONDecodeError):
            return self._json(400, {"error": "invalid JSON"})
        text = str(body.get("text", "")).strip()
        voice = str(body.get("voice", "am_michael"))
        lang = str(body.get("lang", "en-us"))
        speed = float(body.get("speed", 1.0))
        if not text or len(text) > MAX_TEXT:
            return self._json(400, {"error": f"text must be 1 to {MAX_TEXT} characters"})
        if not valid_voice(voice):
            return self._json(400, {"error": f"unknown voice {voice}"})
        if lang not in LANGS:
            return self._json(400, {"error": f"lang must be one of {sorted(LANGS)}"})
        started = time.time()
        try:
            mp3, seconds = synthesize(text, voice, lang, max(0.5, min(speed, 1.5)), bool(body.get("pause_after")))
        except Exception as err:  # keep the service alive on a bad input
            print(f"synthesis failed: {err}", flush=True)
            return self._json(500, {"error": "synthesis failed"})
        took = time.time() - started
        print(f"{voice} {lang}: {len(text)} chars -> {seconds:.1f}s audio in {took:.1f}s", flush=True)
        self.send_response(200)
        self.send_header("Content-Type", "audio/mpeg")
        self.send_header("Content-Length", str(len(mp3)))
        self.send_header("X-Audio-Seconds", f"{seconds:.2f}")
        self.end_headers()
        self.wfile.write(mp3)

    def log_message(self, *_args) -> None:  # quiet default request logging
        pass


if __name__ == "__main__":
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
