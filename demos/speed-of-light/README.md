# Looking Back: a cinematic-film demo

A 28-second science explainer made with the method in the `cinematic-film` skill: one board, one camera, every hit landing on the narrator's word.

The skill's own scripts (`engine.py`, `render.py`, …) are not in this repo, so `film.py` is a small engine written for this demo that follows the skill's rules.

## Rebuild

Needs `pip install skia-python numpy pillow`, `apt-get install libegl1 espeak-ng ffmpeg`.

```bash
python3 voice.py                      # scratch voice -> audio/narration.wav + audio/timing.json
python3 film.py --probe --strip       # self-review stills -> out/
python3 film.py --cues && python3 sfx.py
python3 film.py --out out/film_silent.mp4
ffmpeg -i out/film_silent.mp4 -i audio/mix.m4a -c:v libx264 -crf 24 -tune grain -c:a copy -shortest out/looking-back.mp4
```

To use a different voice, replace `voice.py` and rerun. Every item is timed with `W(line, word)`, so the scene re-times itself.

## Facts used

| Claim | Source value |
| --- | --- |
| 299,792 km/s | 299,792.458 km/s, exact (SI definition of the metre) |
| 7.5 laps of Earth per second | 299,792 / 40,075 km equatorial circumference = 7.48 |
| Sunlight takes 8 minutes | 149.6 million km / c = 499 s = 8 min 19 s |
| Nearest other star: over 4 years | Proxima Centauri, 4.24 light-years (≈ 40 trillion km) |

Everything is drawn in code. There are no images, so there is nothing to credit or license.
