"""Scratch voice: one espeak-ng clip per line -> audio/narration.wav + audio/timing.json.

Word times are estimated inside each clip by character position across the
voiced span (leading/trailing silence trimmed). Good enough for a scratch
draft; a final TTS with word timestamps would replace this file only.
"""
import json, subprocess, wave
from pathlib import Path
import numpy as np

ROOT = Path(__file__).parent
AUD = ROOT / "audio"; AUD.mkdir(exist_ok=True)
SR = 22050
LEAD, GAP, TAIL = 0.8, 0.45, 2.2

def read_wav(p):
    with wave.open(str(p)) as w:
        assert w.getframerate() == SR
        return np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768

def voiced_span(x, thr=0.02):
    idx = np.nonzero(np.abs(x) > thr)[0]
    return (idx[0], idx[-1]) if len(idx) else (0, len(x))

script = json.loads((ROOT / "script.json").read_text())
out = [np.zeros(int(LEAD * SR), np.float32)]
t = LEAD
timing = []
for i, ln in enumerate(script["lines"]):
    p = AUD / f"line{i}.wav"
    subprocess.run(["espeak-ng", "-v", "en-us", "-s", "145", "-p", "38", "-g", "2",
                    "-w", str(p), ln["spoken"]], check=True)
    x = read_wav(p)
    a, b = voiced_span(x)
    x = x[a:b + 1]
    dur = len(x) / SR
    words, pos, text = [], 0, ln["spoken"]
    n = len(text)
    for w in text.split():
        start = text.index(w, pos)
        words.append({"w": w.strip(".,").lower(),
                      "t": round(t + dur * start / n, 3),
                      "end": round(t + dur * (start + len(w)) / n, 3)})
        pos = start + len(w)
    timing.append({"id": ln["id"], "start": round(t, 3), "end": round(t + dur, 3), "words": words})
    out += [x, np.zeros(int(GAP * SR), np.float32)]
    t += dur + GAP
out.append(np.zeros(int(TAIL * SR), np.float32))
y = np.concatenate(out)
y = (y / max(1e-6, np.abs(y).max()) * 0.89 * 32767).astype(np.int16)
with wave.open(str(AUD / "narration.wav"), "wb") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(y.tobytes())
json.dump({"duration": round(len(y) / SR, 3), "lines": timing},
          open(AUD / "timing.json", "w"), indent=1)
print(f"narration {len(y)/SR:.2f}s")
for ln in timing:
    print(f"  {ln['id']:8s} {ln['start']:6.2f}-{ln['end']:6.2f}")
