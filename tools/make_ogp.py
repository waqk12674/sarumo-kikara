# OGP・バナー画像（1200x630）を作る：python tools/make_ogp.py → ogp.png
# 枝につかまって吠えるホエザル（assets/source/sheet_hanging.png のもの）の顔を大きく出し、朱の円と集中線、左に縦書きの題字。
# 絵は小さいので、拡大してから墨の濃淡をはっきりさせて線を立てる。Pillow と Windows の HG行書体を使う
import math, random
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

W, H = 1200, 630
SUMI, KINARI, SHU = (61, 56, 51), (246, 240, 226), (181, 101, 90)
FONT = "C:/Windows/Fonts/HGRGY.TTC"   # HG行書体
CROP = (926, 346, 1044, 560)          # シートの中のホエザル（名前の文字は入れない）
SCALE = 4.2                           # 拡大率（つかんだ棒が上の端に入る大きさ）
FACE = (62, 104)                      # 切り抜きの中の顔の中心
BAR = (54, 19, -0.17, 4.5)            # 切り抜きの中の、つかんでいる棒の芯（x, y）・傾き・太さ。枝はこの線の上に描く
FACE_AT = (830, 400)                  # バナーの中で顔を置く位置
random.seed(7)

# ---- サル：拡大 → 墨をはっきり → 外側の白だけ透明に ----
src = Image.open("assets/source/sheet_hanging.png").convert("L").crop(CROP)
big = src.resize((round(src.width * SCALE), round(src.height * SCALE)), Image.LANCZOS)
big = big.filter(ImageFilter.GaussianBlur(0.7))
lut = [0 if v < 70 else 255 if v > 205 else round((v - 70) / 135 * 255) for v in range(256)]
ink = big.point(lut)                               # 0=墨 255=白
mask = ink.point(lambda v: 255 if v > 200 else 0)  # 白い所
ImageDraw.floodfill(mask, (0, 0), 128)             # 外側の白だけ 128 に塗る
HOLES = [(62, 45), (62, 70), (54, 19)]  # 外とつながっていない白（腕のすき間と、絵の棒の中。棒の中を抜くと後ろの枝が見える）
for xy in [(mask.width - 1, 0), (0, mask.height - 1), (mask.width - 1, mask.height - 1)] + [(round(x * SCALE), round(y * SCALE)) for x, y in HOLES]:
    if mask.getpixel(xy) == 255: ImageDraw.floodfill(mask, xy, 128)
alpha = mask.point(lambda v: 0 if v == 128 else 255).filter(ImageFilter.GaussianBlur(1))
monkey = Image.merge("RGBA", (*[ink.point(lambda v, c=c: round(c + (k - c) * v / 255)) for c, k in zip(SUMI, KINARI)], alpha))

# ---- 背景：生成りの和紙＋薄い墨のにじみ ----
bg = Image.new("RGB", (W, H), KINARI)
noise = Image.effect_noise((W, H), 18).point(lambda v: 128 + (v - 128) // 3)
bg = Image.blend(bg, Image.merge("RGB", [noise] * 3), 0.06)
d = ImageDraw.Draw(bg, "RGBA")
fx, fy = FACE_AT
d.ellipse((fx - 250, fy - 250, fx + 250, fy + 250), fill=SHU + (235,))   # 朱の円
for _ in range(110):                                                      # 集中線
    a = random.uniform(0, math.tau)
    r0, w = random.uniform(270, 330), random.uniform(0.006, 0.02)
    p = lambda r, s: (fx + math.cos(a + s) * r, fy + math.sin(a + s) * r)
    d.polygon([p(r0, 0), p(1400, -w), p(1400, w)], fill=SUMI + (random.randint(28, 70),))

# ---- 枝：つかんでいる棒の高さで、左から右の端まで（サルの手の下になるよう、先に描く） ----
bx, by = fx + (BAR[0] - FACE[0]) * SCALE, fy - (FACE[1] - BAR[1]) * SCALE
def branch_y(x): return by + (x - bx) * BAR[2]
xs = range(430, 1201, 4)
t = lambda x: BAR[3] * SCALE * (0.75 + (x - 430) / 770 * 0.6)  # 拳のところで絵の棒と同じ太さ。左は細く、右は太く
up = [(x, branch_y(x) - t(x) / 2) for x in xs]; lo = [(x, branch_y(x) + t(x) / 2) for x in reversed(xs)]
d.polygon(up + lo, fill=(168, 148, 120)); d.line(up, fill=SUMI, width=3); d.line(lo, fill=SUMI, width=2)
d.ellipse((424, branch_y(430) - 7, 438, branch_y(430) + 7), fill=(168, 148, 120), outline=SUMI, width=2)

# ---- サルを置く（顔が FACE_AT に来るように） ----
ox, oy = round(fx - FACE[0] * SCALE), round(fy - FACE[1] * SCALE)
shadow = Image.new("RGBA", monkey.size, SUMI + (0,)); shadow.putalpha(alpha.point(lambda v: v * 60 // 255))
bg.paste(shadow, (ox + 10, oy + 12), shadow.filter(ImageFilter.GaussianBlur(8)))
bg.paste(monkey, (ox, oy), monkey)

# ---- 題字（縦書き）と一言 ----
def vtext(x, y, s, size, fill, stroke=0, gap=0.98):
    f = ImageFont.truetype(FONT, size)
    for ch in s:
        rot = ch in "ー〜"
        if rot:  # 長音は縦向きに回す
            g = Image.new("RGBA", (size, size), (0, 0, 0, 0))
            ImageDraw.Draw(g).text((size / 2, size / 2), ch, font=f, fill=fill, anchor="mm", stroke_width=stroke, stroke_fill=KINARI)
            bg.paste(g.rotate(-90), (round(x - size / 2), round(y)), g.rotate(-90))
        else:  # 句読点は縦書きでは右上に寄せる
            dx, dy = (size * 0.6, -size * 0.6) if ch in "、。" else (0, 0)
            ImageDraw.Draw(bg).text((x + dx, y + size / 2 + dy), ch, font=f, fill=fill, anchor="mm", stroke_width=stroke, stroke_fill=KINARI)
        y += size * gap

vtext(290, 36, "サルも木から", 90, SUMI, stroke=6)
vtext(185, 146, "落ちぬん", 90, SUMI, stroke=6)
vtext(80, 60, "つなげ、サルの鎖。", 36, SHU, stroke=4, gap=1.05)
# 落款ふうの印
d = ImageDraw.Draw(bg)
d.rounded_rectangle((157, 548, 213, 604), 6, fill=SHU)
d.text((185, 576), "猿", font=ImageFont.truetype(FONT, 40), fill=KINARI, anchor="mm")

bg.save("ogp.png", optimize=True)
print("ogp.png", bg.size)
