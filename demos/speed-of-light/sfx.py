"""Synthesise every sound effect from out/cues.json (no samples, nothing to license),
then mix voice + effects, ducked under the voice, normalised to -16 LUFS."""
import json, subprocess, wave
from pathlib import Path
import numpy as np

ROOT = Path(__file__).parent
SR = 44100
cues = json.loads((ROOT / "out/cues.json").read_text())
dur = json.loads((ROOT / "audio/timing.json").read_text())["duration"]
rng = np.random.default_rng(3)
bus = np.zeros(int(dur * SR) + SR)

def env(n, a, r):
    e = np.ones(n); na, nr = int(a * SR), int(r * SR)
    e[:na] = np.linspace(0, 1, na) ** 2
    e[-nr:] *= np.linspace(1, 0, nr) ** 2
    return e

def lowpass(x, k):                       # cheap one-pole, k in 0..1
    y = np.empty_like(x); acc = 0.0
    for i, v in enumerate(x):
        acc += k * (v - acc); y[i] = acc
    return y

def add(t, x, gain):
    i = int(t * SR); bus[i:i + len(x)] += gain * x[: len(bus) - i]

def whoosh(d):
    n = int((d + 0.4) * SR)
    x = rng.normal(0, 1, n)
    sweep = np.linspace(0.02, 0.18, n) ** 1.0
    sweep = np.concatenate([sweep[: n // 2], sweep[: n - n // 2][::-1]])
    y = np.empty(n); acc = 0.0
    for i in range(n):
        acc += sweep[i] * (x[i] - acc); y[i] = acc
    return y * np.sin(np.linspace(0, np.pi, n)) ** 2 * 2.2

def thud():
    n = int(0.7 * SR); tt = np.arange(n) / SR
    body = np.sin(2 * np.pi * (70 * tt + 40 * (1 - np.exp(-tt * 30)) / 30)) * np.exp(-tt * 7)
    click = lowpass(rng.normal(0, 1, n), 0.25) * np.exp(-tt * 60) * 0.8
    return body + click

def boom():
    n = int(2.2 * SR); tt = np.arange(n) / SR
    low = np.sin(2 * np.pi * 48 * tt) * np.exp(-tt * 1.8)
    air = lowpass(rng.normal(0, 1, n), 0.04) * np.exp(-tt * 1.5) * 3
    return (low + air) * env(n, 0.01, 1.2)

def zip_():
    n = int(0.5 * SR); tt = np.arange(n) / SR
    f = 600 + 2600 * (tt / tt[-1]) ** 2
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.05, 0.25) * 0.35

def ticks(d):
    n = int(d * SR); y = np.zeros(n); k = 0.0
    while k < d:
        i = int(k * SR); m = min(400, n - i)
        y[i:i + m] += np.sin(2 * np.pi * 2400 * np.arange(m) / SR) * np.exp(-np.arange(m) / 60)
        k += 0.035 + 0.11 * (k / d) ** 2          # ticks slow down as the counter lands
    return y * 0.5

def hum(d):
    n = int(d * SR); tt = np.arange(n) / SR
    y = sum(np.sin(2 * np.pi * f * tt) / (i + 1) for i, f in enumerate((110, 165, 220, 330)))
    return y * env(n, d * 0.6, 0.3) * 0.3

for c in cues:
    k = c["kind"]
    if k == "whoosh": add(c["t"], whoosh(c["dur"]), 0.22)
    elif k == "thud": add(c["t"] - 0.01, thud(), 0.55)
    elif k == "boom": add(c["t"] - 0.02, boom(), 0.45)
    elif k == "zip": add(c["t"], zip_(), 0.5)
    elif k == "ticks": add(c["t"], ticks(c["dur"]), 0.25)
    elif k == "hum": add(c["t"], hum(c["dur"]), 0.35)

bus = bus[: int(dur * SR)]
bus = np.tanh(bus * 1.2) / 1.2
st = np.stack([bus, bus], 1)
with wave.open(str(ROOT / "audio/sfx.wav"), "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((np.clip(st, -1, 1) * 32767 * 0.9).astype(np.int16).tobytes())

# voice + sfx, sfx ducked by the voice (sidechain), then loudness-normalised
subprocess.run(["ffmpeg", "-y", "-loglevel", "error",
    "-i", str(ROOT / "audio/narration.wav"), "-i", str(ROOT / "audio/sfx.wav"),
    "-filter_complex",
    "[0:a]aresample=44100,pan=stereo|c0=c0|c1=c0,asplit=2[v][sc];"
    "[1:a][sc]sidechaincompress=threshold=0.05:ratio=6:attack=15:release=250[d];"
    "[v][d]amix=inputs=2:weights=1 0.8:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11",
    "-ar", "44100", "-c:a", "aac", "-b:a", "192k", str(ROOT / "audio/mix.m4a")], check=True)
print("wrote audio/sfx.wav and audio/mix.m4a")
