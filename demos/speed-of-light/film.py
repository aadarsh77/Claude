"""'Looking Back' - a cinematic-film demo (blueprint look).

One board, one camera. Every hit is keyed to a spoken word via W(line, word).

  python3 film.py --probe            one still per line -> out/probe_*.png
  python3 film.py --strip            contact strip of camera moves -> out/strip.png
  python3 film.py --cues             write out/cues.json (for sfx.py)
  python3 film.py --out out/film.mp4 full render (silent video)
"""
import argparse, json, math, subprocess
from pathlib import Path
import numpy as np
import skia

ROOT = Path(__file__).parent
OUT = ROOT / "out"; OUT.mkdir(exist_ok=True)
TIMING = json.loads((ROOT / "audio" / "timing.json").read_text())
SCRIPT = json.loads((ROOT / "script.json").read_text())
LINES = {l["id"]: l for l in TIMING["lines"]}
DUR = TIMING["duration"]
FPS = 30

# ---------------------------------------------------------------- timing
def L(line):            # line start
    return LINES[line]["start"]

def Lend(line):
    return LINES[line]["end"]

def W(line, word, nth=0):
    hits = [w["t"] for w in LINES[line]["words"] if w["w"] == word]
    if len(hits) <= nth:
        raise KeyError(f"word {word!r} not in line {line!r}")
    return hits[nth]

# ---------------------------------------------------------------- maths
def clamp(x, a=0.0, b=1.0):
    return a if x < a else b if x > b else x

def ease(x):            # smooth in-out
    x = clamp(x); return x * x * (3 - 2 * x)

def ease_out(x):
    x = clamp(x); return 1 - (1 - x) ** 3

def prog(t, a, b):
    return clamp((t - a) / max(1e-6, b - a))

def pop(t, at, dur=0.35):
    """Stamp scale: overshoot then settle. Returns (alpha, scale)."""
    if t < at: return 0.0, 1.0
    x = (t - at) / dur
    if x >= 1: return 1.0, 1.0
    s = 1.6 - 0.6 * ease_out(x) + 0.08 * math.sin(x * math.pi) * (1 - x)
    return clamp(x * 3), s

def lerp(a, b, x):
    return a + (b - a) * x

# ---------------------------------------------------------------- look
def C(hexs, a=1.0):
    h = hexs.lstrip("#")
    return skia.Color4f(int(h[0:2], 16) / 255, int(h[2:4], 16) / 255, int(h[4:6], 16) / 255, a)

BOARD = "#0B2440"; GRID_MINOR = "#14365C"; GRID_MAJOR = "#1D4A7A"
INK = "#EAF2FF"; MUTED = "#8FB3DA"; AMBER = "#FFC34D"; SKY = "#5FB0FF"

FONT_DIR = "/usr/share/fonts/opentype/inter/"
TF = {k: skia.Typeface.MakeFromFile(FONT_DIR + v) for k, v in {
    "black": "InterDisplay-Black.otf", "bold": "InterDisplay-Bold.otf",
    "semi": "Inter-SemiBold.otf", "med": "Inter-Medium.otf"}.items()}

def font(kind, size):
    f = skia.Font(TF[kind], size); f.setSubpixel(True); f.setEdging(skia.Font.Edging.kAntiAlias)
    return f

def paint(col, a=1.0, stroke=None, blur=None, dash=None):
    c = C(col, a) if isinstance(col, str) else col
    p = skia.Paint(Color=c, AntiAlias=True)
    if stroke is not None:
        p.setStyle(skia.Paint.kStroke_Style); p.setStrokeWidth(stroke); p.setStrokeCap(skia.Paint.kRound_Cap)
    if blur: p.setMaskFilter(skia.MaskFilter.MakeBlur(skia.kNormal_BlurStyle, blur))
    if dash: p.setPathEffect(skia.DashPathEffect.Make(dash[0], dash[1]))
    return p

def text(cv, s, x, y, f, p, align="center", track=0.0):
    """Draw text with optional letter tracking (in em). y is the baseline."""
    if track == 0:
        w = f.measureText(s)
        dx = {"center": -w / 2, "left": 0, "right": -w}[align]
        cv.drawString(s, x + dx, y, f, p); return w
    adv = [f.measureText(ch) + track * f.getSize() for ch in s]
    w = sum(adv) - track * f.getSize()
    cx = x + {"center": -w / 2, "left": 0, "right": -w}[align]
    for ch, a in zip(s, adv):
        cv.drawString(ch, cx, y, f, p); cx += a
    return w

def scaled(cv, x, y, s):
    cv.save(); cv.translate(x, y); cv.scale(s, s); cv.translate(-x, -y)

# ---------------------------------------------------------------- world layout
POS = {
    "title":   (0, 0),
    "counter": (1500, -160),
    "earth":   (3000, 160),
    "sun":     (4650, -330),
    "proxima": (6900, 560),
}
ROUTE = ["title", "counter", "earth"]   # the string the camera follows early on

# ---------------------------------------------------------------- camera + spotlight
def build_camera():
    keys = []          # (t_start, t_end, cx, cy, zoom)
    keys.append((0.0, 0.01, -60, 10, 0.92))
    keys.append((0.0, L("speed") - 0.1, 0, 0, 1.04))                       # slow push on title
    def move(line, cx, cy, z, dur=1.1, lead=0.35):
        keys.append((L(line) - lead, L(line) - lead + dur, cx, cy, z))
    move("speed", 1500, -150, 1.0)
    move("earth", 2830, 230, 1.0)
    move("sun", 3890, -60, 0.56, dur=1.3)
    move("proxima", 5110, 330, 0.25, dur=1.4)
    move("past", 3360, 60, 0.148, dur=2.4, lead=0.2)
    keys.sort(key=lambda k: k[0])
    return keys

CAM = build_camera()

def camera(t):
    cx, cy, z = CAM[0][2], CAM[0][3], CAM[0][4]
    for (a, b, x, y, zz) in CAM:
        if t <= a: break
        k = ease(prog(t, a, b))
        # zoom interpolated in log space so pull-backs feel even
        cx, cy = lerp(cx, x, k), lerp(cy, y, k)
        z = math.exp(lerp(math.log(z), math.log(zz), k))
    return cx, cy, z

HERO_OF = {l["id"]: l["hero"] for l in SCRIPT["lines"]}
ORDER = [l["id"] for l in SCRIPT["lines"]]

def hero_at(t):
    h = HERO_OF[ORDER[0]]
    for lid in ORDER:
        if t >= L(lid) - 0.35: h = HERO_OF[lid]
    return h

def spot(name, t):
    """Spotlight: hero cluster full, others dimmed; eased across 0.6s."""
    def level(tt):
        h = hero_at(tt)
        if h == "all": return 0.62 if tt < W("past", "past") else 0.40
        if name == h: return 1.0
        if h == "sun" and name == "earth": return 0.9          # earth is the sun's target
        if h == "proxima" and name == "earth": return 0.8
        return 0.28
    return sum(level(t - 0.6 * i / 6) for i in range(7)) / 7

# ---------------------------------------------------------------- board
def draw_board(cv, cx, cy, z, Wd, Hd):
    cv.clear(C(BOARD))
    x0, x1 = cx - Wd / 2 / z, cx + Wd / 2 / z
    y0, y1 = cy - Hd / 2 / z, cy + Hd / 2 / z
    for step, col, sw in ((50, GRID_MINOR, 1.0), (250, GRID_MAJOR, 1.6)):
        if step * z < 10: continue
        p = paint(col, 1.0, stroke=sw / z)
        gx = math.floor(x0 / step) * step
        while gx <= x1:
            cv.drawLine(gx, y0, gx, y1, p); gx += step
        gy = math.floor(y0 / step) * step
        while gy <= y1:
            cv.drawLine(x0, gy, x1, gy, p); gy += step

def draw_route(cv, t):
    """Fine dashed string between early clusters, drawn as the camera travels."""
    segs = [("title", "counter", L("speed") - 0.35), ("counter", "earth", L("earth") - 0.35)]
    fade = 1 - 0.75 * prog(t, L("sun") - 0.5, L("sun") + 0.5)       # strings fade after their beat
    for a, b, t0 in segs:
        k = ease(prog(t, t0, t0 + 1.0))
        if k <= 0: continue
        (ax, ay), (bx, by) = POS[a], POS[b]
        ax += 380
        if b == "earth": bx, by = bx - 120, by - 240
        else: bx -= 380
        p = paint(MUTED, 0.55 * fade, stroke=3, dash=([14, 12], 0))
        cv.drawLine(ax, ay, lerp(ax, bx, k), lerp(ay, by, k), p)
        cv.drawCircle(ax, ay, 7, paint(MUTED, 0.8 * fade))
        if k >= 1: cv.drawCircle(bx, by, 7, paint(MUTED, 0.8 * fade))

# ---------------------------------------------------------------- items
def draw_title(cv, t):
    x, y = POS["title"]; s = spot("title", t)
    a, sc = pop(t, W("open", "light"), 0.55)
    if a <= 0: return
    # light streak behind the word, fired on "fastest"
    k = prog(t, W("open", "fastest"), W("open", "fastest") + 0.45)
    if k > 0:
        hx = lerp(x - 700, x + 700, ease_out(k))
        tail = max(x - 700, hx - 900)
        sh = skia.GradientShader.MakeLinear([skia.Point(tail, 0), skia.Point(hx, 0)],
                                            [C(AMBER, 0).toColor(), C(AMBER, 0.9 * s).toColor()])
        p = paint(AMBER, 1, stroke=6); p.setShader(sh); cv.drawLine(tail, y + 60, hx, y + 60, p)
        p2 = paint(AMBER, 0.5 * s, stroke=18, blur=10); p2.setShader(sh); cv.drawLine(tail, y + 60, hx, y + 60, p2)
    scaled(cv, x, y, sc)
    text(cv, "LIGHT", x, y + 20, font("black", 250), paint(INK, a * s), track=0.04)
    cv.restore()
    text(cv, "EXPLAINER  ·  NO. 01", x, y - 200, font("semi", 30), paint(MUTED, a * s), track=0.25)

def card(cv, x, y, w, h, s, accent=SKY):
    r = skia.RRect.MakeRectXY(skia.Rect.MakeXYWH(x - w / 2, y - h / 2, w, h), 22, 22)
    cv.drawRRect(r, paint("#0F2F52", 0.92 * s))
    cv.drawRRect(r, paint(accent, 0.55 * s, stroke=2.5))
    # registration ticks, blueprint style
    for (px, py, dx, dy) in ((x - w / 2, y - h / 2, 1, 1), (x + w / 2, y - h / 2, -1, 1),
                             (x - w / 2, y + h / 2, 1, -1), (x + w / 2, y + h / 2, -1, -1)):
        cv.drawLine(px - 18 * dx, py, px - 4 * dx, py, paint(accent, 0.7 * s, stroke=2))
        cv.drawLine(px, py - 18 * dy, px, py - 4 * dy, paint(accent, 0.7 * s, stroke=2))

def draw_counter(cv, t):
    x, y = POS["counter"]; s = spot("counter", t)
    t_in, t_land = L("speed") + 0.2, W("speed", "second")
    a = ease(prog(t, t_in - 0.3, t_in))
    if a <= 0: return
    card(cv, x, y, 760, 420, a * s)
    k = ease_out(prog(t, W("speed", "about"), t_land))
    n = int(round(299792 * k))
    a2, sc = pop(t, t_land, 0.3)
    scaled(cv, x, y, 1 + 0.12 * (sc - 1))
    col = AMBER if t >= t_land else INK
    text(cv, f"{n:,}", x, y + 55, font("black", 170), paint(col, a * s))
    cv.restore()
    la, _ = pop(t, t_land, 0.3)
    text(cv, "KM  EVERY  SECOND", x, y + 135, font("bold", 44), paint(SKY, la * s), track=0.18)
    text(cv, "SPEED OF LIGHT · VACUUM", x, y - 130, font("semi", 26), paint(MUTED, a * s), track=0.22)

def draw_earth(cv, t, x, y, r, s, a):
    cv.drawCircle(x, y, r + 26, paint(SKY, 0.25 * a * s, blur=28))
    cv.drawCircle(x, y, r, paint("#164E86", a * s))
    cv.save()
    clip = skia.Path(); clip.addCircle(x, y, r); cv.clipPath(clip, doAntiAlias=True)
    for i in range(-3, 4):                                       # latitudes
        yy = y + i * r / 3.6
        hw = math.sqrt(max(0, r * r - (yy - y) ** 2))
        cv.drawLine(x - hw, yy, x + hw, yy, paint(SKY, 0.35 * a * s, stroke=2))
    rot = (t * 0.25) % 1
    for i in range(6):                                           # longitudes
        ph = (i / 6 + rot) % 1
        ew = abs(math.cos(ph * math.pi)) * r
        cv.drawOval(skia.Rect.MakeXYWH(x - ew, y - r, 2 * ew, 2 * r), paint(SKY, 0.3 * a * s, stroke=2))
    cv.restore()
    cv.drawCircle(x, y, r, paint(INK, 0.75 * a * s, stroke=3))

def draw_earth_cluster(cv, t):
    x, y = POS["earth"]; s = spot("earth", t)
    a = ease(prog(t, L("earth") - 0.4, L("earth") + 0.2))
    if a <= 0: return
    R = 150; orbit = 215
    draw_earth(cv, t, x, y, R, s, a)
    cv.drawCircle(x, y, orbit, paint(MUTED, 0.35 * a * s, stroke=2, dash=([6, 10], 0)))
    t0, t1 = W("earth", "circle"), W("earth", "half") + 0.25
    k = prog(t, t0, t1)
    if k > 0:
        laps = 7.5 * k
        ang = -math.pi / 2 + laps * 2 * math.pi
        # comet tail
        for i in range(24):
            aa = ang - i * 0.07
            cv.drawCircle(x + orbit * math.cos(aa), y + orbit * math.sin(aa), 9 - i * 0.3,
                          paint(AMBER, (1 - i / 24) * 0.8 * s))
        cv.drawCircle(x + orbit * math.cos(ang), y + orbit * math.sin(ang), 16, paint(AMBER, 0.6 * s, blur=8))
    la, sc = pop(t, W("earth", "seven"), 0.35)
    if la > 0:
        la *= 1 - prog(t, L("sun") - 0.4, L("sun") + 0.4)        # old label leaves before the sun shot
        lx, ly = x - orbit - 50, y + 10                            # left side: away from beam and star line
        scaled(cv, lx, ly, sc)
        text(cv, "7.5×", lx, ly + 40, font("black", 150), paint(AMBER, la * s), align="right")
        cv.restore()
        text(cv, "LAPS OF EARTH", lx - 6, ly + 100, font("bold", 40), paint(INK, la * s), align="right", track=0.16)
        text(cv, "IN ONE SECOND", lx - 6, ly + 148, font("semi", 32), paint(MUTED, la * s), align="right", track=0.16)
    text(cv, "EARTH", x, y + orbit + 70, font("bold", 40), paint(MUTED, a * s), track=0.3)

def draw_sun(cv, t):
    x, y = POS["sun"]; s = spot("sun", t)
    a = ease(prog(t, L("sun") - 0.5, L("sun") + 0.3))
    if a <= 0: return
    R = 300
    sh = skia.GradientShader.MakeRadial(skia.Point(x, y), R * 2.2,
                                        [C(AMBER, 0.45 * a * s).toColor(), C(AMBER, 0).toColor()], [0.35, 1])
    p = skia.Paint(AntiAlias=True); p.setShader(sh); cv.drawCircle(x, y, R * 2.2, p)
    cv.drawCircle(x, y, R, paint(AMBER, a * s))
    cv.drawCircle(x, y, R * 0.78, paint("#FFE29A", 0.5 * a * s, blur=40))
    text(cv, "SUN", x, y + R + 120, font("bold", 64), paint(AMBER, a * s), track=0.3)
    # beam: sun edge -> earth edge, travels across the line, arrives on "reach"
    ex, ey = POS["earth"]
    ang = math.atan2(ey - y, ex - x)
    sx0, sy0 = x + R * math.cos(ang), y + R * math.sin(ang)
    ex0, ey0 = ex - 190 * math.cos(ang), ey - 190 * math.sin(ang)
    k = ease(prog(t, W("sun", "sunlight"), W("sun", "reach")))
    if k > 0:
        hx, hy = lerp(sx0, ex0, k), lerp(sy0, ey0, k)
        cv.drawLine(sx0, sy0, hx, hy, paint(AMBER, 0.85 * s, stroke=7))
        cv.drawLine(sx0, sy0, hx, hy, paint(AMBER, 0.35 * s, stroke=26, blur=14))
        if k < 1: cv.drawCircle(hx, hy, 22, paint("#FFF1C9", 0.9 * s, blur=8))
    la, sc = pop(t, W("sun", "eight"), 0.35)
    if la > 0:
        mx, my = lerp(sx0, ex0, 0.5), lerp(sy0, ey0, 0.5) - 190    # label above the beam
        scaled(cv, mx, my, sc)
        text(cv, "8 MIN", mx, my, font("black", 190), paint(INK, la * s))
        cv.restore()
        text(cv, "150 MILLION KM", mx, my + 70, font("bold", 50), paint(AMBER, la * s), track=0.16)

def draw_proxima(cv, t):
    x, y = POS["proxima"]; s = spot("proxima", t)
    a = ease(prog(t, L("proxima") - 0.6, L("proxima") + 0.2))
    if a <= 0: return
    tw = 0.85 + 0.15 * math.sin(t * 7)
    cv.drawCircle(x, y, 150, paint("#FF8A65", 0.35 * a * s * tw, blur=60))
    cv.drawCircle(x, y, 46, paint("#FFB199", a * s))
    for ang in (0, math.pi / 2):
        dx, dy = math.cos(ang) * 230 * tw, math.sin(ang) * 230 * tw
        cv.drawLine(x - dx, y - dy, x + dx, y + dy, paint("#FFD3C4", 0.6 * a * s, stroke=5))
    text(cv, "PROXIMA CENTAURI", x, y + 270, font("bold", 88), paint(INK, a * s), track=0.14)
    ex, ey = POS["earth"]
    ang = math.atan2(ey - y, ex - x)
    sx0, sy0 = x + 70 * math.cos(ang), y + 70 * math.sin(ang)
    ex0, ey0 = ex - 250 * math.cos(ang), ey - 250 * math.sin(ang)
    k = ease(prog(t, W("proxima", "light"), W("proxima", "four") + 0.2))
    if k > 0:
        hx, hy = lerp(sx0, ex0, k), lerp(sy0, ey0, k)
        cv.drawLine(sx0, sy0, hx, hy, paint("#FFB199", 0.9 * s, stroke=10, dash=([40, 30], -t * 120)))
    la, sc = pop(t, W("proxima", "four"), 0.35)
    if la > 0:
        mx, my = lerp(sx0, ex0, 0.45), lerp(sy0, ey0, 0.45) + 380   # below the line, away from the sun
        scaled(cv, mx, my, sc)
        text(cv, "4.2 YEARS", mx, my, font("black", 330), paint(INK, la * s))
        cv.restore()
        text(cv, "40 TRILLION KM AWAY", mx, my + 130, font("bold", 90), paint("#FFB199", la * s), track=0.16)

# ---------------------------------------------------------------- screen-space layers
def draw_final_stamp(cv, t, Wd, Hd):
    a, sc = pop(t, W("past", "past"), 0.4)
    if a <= 0: return
    x, y = Wd / 2, Hd * 0.30
    scaled(cv, x, y, sc)
    f = font("black", Hd * 0.17)
    w = f.measureText("THE PAST")
    r = skia.Rect.MakeXYWH(x - w / 2 - Hd * 0.05, y - Hd * 0.14, w + Hd * 0.1, Hd * 0.18)
    cv.save(); cv.rotate(-3, x, y)
    cv.drawRect(r, paint(BOARD, 0.75 * a))
    cv.drawRect(r, paint(AMBER, a, stroke=Hd * 0.008))
    text(cv, "THE PAST", x, y, f, paint(AMBER, a))
    cv.restore(); cv.restore()

def draw_captions(cv, t, Wd, Hd):
    for ln, sl in zip(TIMING["lines"], SCRIPT["lines"]):
        a = min(prog(t, ln["start"] - 0.15, ln["start"]), 1 - prog(t, ln["end"] + 0.25, ln["end"] + 0.4))
        if a <= 0: continue
        f = font("semi", Hd * 0.042)
        s = sl["text"]
        w = f.measureText(s)
        y = Hd * 0.91
        r = skia.RRect.MakeRectXY(skia.Rect.MakeXYWH(Wd / 2 - w / 2 - 18, y - Hd * 0.042, w + 36, Hd * 0.06), 8, 8)
        cv.drawRRect(r, paint("#000000", 0.55 * a))
        text(cv, s, Wd / 2, y, f, paint("#FFFFFF", a))

def film_finish(cv, t, Wd, Hd):
    sh = skia.GradientShader.MakeRadial(skia.Point(Wd / 2, Hd / 2), Wd * 0.75,
                                        [skia.Color4f(0, 0, 0, 0).toColor(), skia.Color4f(0, 0, 0, 0.55).toColor()],
                                        [0.45, 1.0])
    p = skia.Paint(); p.setShader(sh); cv.drawRect(skia.Rect.MakeWH(Wd, Hd), p)
    fade = max(1 - prog(t, 0, 0.6), prog(t, DUR - 1.0, DUR - 0.1))
    if fade > 0: cv.drawRect(skia.Rect.MakeWH(Wd, Hd), paint("#000000", fade))

# ---------------------------------------------------------------- frame
_GRAIN = None

def render_frame(t, Wd=1280, Hd=720, grain=True, captions=True):
    global _GRAIN
    surf = skia.Surface(Wd, Hd); cv = surf.getCanvas()
    cx, cy, z = camera(t)
    zs = z * Wd / 1280                       # world units are defined at 1280 wide
    cv.save()
    cv.translate(Wd / 2, Hd / 2); cv.scale(zs, zs); cv.translate(-cx, -cy)
    draw_board(cv, cx, cy, zs, Wd, Hd)
    draw_route(cv, t)
    draw_title(cv, t)
    draw_counter(cv, t)
    draw_earth_cluster(cv, t)
    draw_sun(cv, t)
    draw_proxima(cv, t)
    cv.restore()
    draw_final_stamp(cv, t, Wd, Hd)
    if captions: draw_captions(cv, t, Wd, Hd)
    film_finish(cv, t, Wd, Hd)
    img = surf.makeImageSnapshot().toarray(colorType=skia.kRGBA_8888_ColorType)[:, :, :3]
    if grain:
        if _GRAIN is None or _GRAIN.shape[1:3] != img.shape[:2]:
            rng = np.random.default_rng(7)
            _GRAIN = rng.normal(0, 4.5, (6, Hd, Wd, 1)).astype(np.int16)
        img = np.clip(img.astype(np.int16) + _GRAIN[int(t * FPS) % 6], 0, 255).astype(np.uint8)
    return img

def save_png(img, path):
    from PIL import Image
    Image.fromarray(img).save(path)

# ---------------------------------------------------------------- cues for the sound pass
def cues():
    c = []
    for (a, b, *_ ) in CAM[2:]:
        c.append({"t": round(a, 3), "kind": "whoosh", "dur": round(b - a, 3)})
    for line, word, kind in (("open", "light", "boom"), ("open", "fastest", "zip"),
                             ("speed", "second", "thud"), ("earth", "seven", "thud"),
                             ("sun", "eight", "thud"), ("proxima", "four", "thud"),
                             ("past", "past", "boom")):
        c.append({"t": W(line, word), "kind": kind})
    c.append({"t": W("speed", "about"), "kind": "ticks", "dur": round(W("speed", "second") - W("speed", "about"), 3)})
    c.append({"t": W("sun", "sunlight"), "kind": "hum", "dur": round(W("sun", "reach") - W("sun", "sunlight"), 3)})
    return sorted(c, key=lambda x: x["t"])

# ---------------------------------------------------------------- cli
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--probe", action="store_true")
    ap.add_argument("--strip", action="store_true")
    ap.add_argument("--cues", action="store_true")
    ap.add_argument("--at", type=float, nargs="*")
    ap.add_argument("--out")
    ap.add_argument("--size", default="1280x720")
    a = ap.parse_args()
    Wd, Hd = map(int, a.size.split("x"))
    if a.cues:
        json.dump(cues(), open(OUT / "cues.json", "w"), indent=1); print(len(cues()), "cues")
    if a.probe:
        # one still per line, just after its last hit has settled
        for ln in TIMING["lines"]:
            t = min(ln["end"] + 0.3, DUR - 1.2)
            save_png(render_frame(t, Wd, Hd), OUT / f"probe_{ln['id']}.png"); print("probe", ln["id"], round(t, 2))
    if a.at:
        for t in a.at:
            save_png(render_frame(t, Wd, Hd), OUT / f"at_{t:05.2f}.png")
    if a.strip:
        from PIL import Image
        ts = []
        for (s, e, *_ ) in CAM[2:]:
            ts += [s + (e - s) * f for f in (0.0, 0.33, 0.66, 1.0)]
        th = [Image.fromarray(render_frame(t, 320, 180, grain=False, captions=False)) for t in ts]
        sheet = Image.new("RGB", (320 * 4, 180 * (len(th) // 4)))
        for i, im in enumerate(th): sheet.paste(im, ((i % 4) * 320, (i // 4) * 180))
        sheet.save(OUT / "strip.png"); print("strip", len(th), "frames")
    if a.out:
        n = int(DUR * FPS)
        ff = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
                               "-s", f"{Wd}x{Hd}", "-r", str(FPS), "-i", "-", "-c:v", "libx264",
                               "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", str(ROOT / a.out)],
                              stdin=subprocess.PIPE)
        for i in range(n):
            ff.stdin.write(render_frame(i / FPS, Wd, Hd).tobytes())
            if i % 150 == 0: print(f"  frame {i}/{n}", flush=True)
        ff.stdin.close(); ff.wait(); print("wrote", a.out)

if __name__ == "__main__":
    main()
