"""効果音と環境音を合成して assets/audio/*.wav に書き出す（python tools/make_se.py）。
Python の標準ライブラリだけで動く。乱数の種を固定しているので、何度実行しても同じ音になる。
音を変えたいときは、各関数の周波数・長さ・減衰を書き換えて実行し直す。"""
import array, math, pathlib, random, wave

SR = 22050  # サンプリング周波数（Hz）
OUT = pathlib.Path(__file__).resolve().parent.parent / "assets" / "audio"
TAU = 2 * math.pi
rnd = random.Random(12674)


def n(sec):
    return int(sec * SR)


def noise(k):
    return [rnd.uniform(-1, 1) for _ in range(k)]


def lowpass(x, fc):
    """1次のローパス。fc は数値か、サンプルごとの周波数を返す関数"""
    y, out = 0.0, []
    for i, v in enumerate(x):
        f = fc(i) if callable(fc) else fc
        y += (1 - math.exp(-TAU * f / SR)) * (v - y)
        out.append(y)
    return out


def bandpass(x, fc, q):
    """2次のバンドパス（RBJ）。fc は数値か、サンプルごとの周波数を返す関数"""
    x1 = x2 = y1 = y2 = 0.0
    out = []
    for i, v in enumerate(x):
        f = fc(i) if callable(fc) else fc
        w = TAU * f / SR
        al = math.sin(w) / (2 * q)
        a0 = 1 + al
        y = (al * v - al * x2 + 2 * math.cos(w) * y1 - (1 - al) * y2) / a0
        x2, x1, y2, y1 = x1, v, y1, y
        out.append(y)
    return out


def tone(k, f, decay, phase_mod=None):
    """減衰する正弦波。f は数値か、サンプルごとの周波数を返す関数"""
    ph, out = 0.0, []
    for i in range(k):
        ph += TAU * (f(i) if callable(f) else f) / SR
        out.append(math.sin(ph) * math.exp(-decay * i / SR))
    return out


def mix(*parts):
    k = max(len(p) for p, _ in parts)
    out = [0.0] * k
    for p, g in parts:
        for i, v in enumerate(p):
            out[i] += v * g
    return out


def place(dst, src, at, gain=1.0):
    for i, v in enumerate(src):
        if 0 <= at + i < len(dst):
            dst[at + i] += v * gain


def room(x, wet=0.18):
    """小さな部屋の響き（短い遅れを数本足すだけ）"""
    out = x + [0.0] * n(0.25)
    for d, g in ((0.031, 0.5), (0.047, 0.4), (0.073, 0.3), (0.11, 0.2)):
        place(out, x, n(d), wet * g)
    return out


def fade_edges(x, a=0.002, b=0.01):
    ka, kb = max(1, n(a)), max(1, n(b))
    for i in range(min(ka, len(x))):
        x[i] *= i / ka
    for i in range(min(kb, len(x))):
        x[-1 - i] *= i / kb
    return x


def save(name, x, peak=0.89, half=False):
    """half=True は 11025Hz で書き出す（高い音が少ない環境音を小さくするため）"""
    if half:
        x = [(x[i] + x[i + 1]) / 2 for i in range(0, len(x) - 1, 2)]
    m = max(abs(v) for v in x) or 1
    data = array.array("h", (int(max(-1, min(1, v * peak / m)) * 32767) for v in x))
    OUT.mkdir(parents=True, exist_ok=True)
    with wave.open(str(OUT / f"{name}.wav"), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR // 2 if half else SR)
        w.writeframes(data.tobytes())
    print(f"{name}.wav  {len(x) / (SR // 2 if half else SR):.2f}s")


# ---------- 効果音 ----------
def pon():
    """札から引っぱる・持ち上げる：木魚のような軽い「ぽん」"""
    k = n(0.22)
    body = tone(k, lambda i: 520 - 90 * min(1, i / n(0.03)), 22)
    over = tone(k, 1430, 60)
    click = bandpass(noise(n(0.008)), 1800, 1.2)
    return fade_edges(mix((body, 1), (over, 0.15), (click, 0.25)))


def clack(f=1, dur=0.12):
    """拍子木の「コッ」：硬い木の短い鳴り"""
    k = n(dur)
    hit = bandpass(noise(n(0.006)), 2400 * f, 0.8)
    p1, p2, p3 = tone(k, 1650 * f, 55), tone(k, 2730 * f, 75), tone(k, 4120 * f, 110)
    return mix((hit, 0.6), (p1, 0.9), (p2, 0.45), (p3, 0.2))


def grab():
    return fade_edges(room(clack(), 0.12))


def pluck(f, dur, r, damp=0.996):
    """弦をはじいた音（Karplus-Strong：短いノイズをくり返しながら、なまらせていく）"""
    size = max(2, round(SR / f))
    buf = lowpass([r.uniform(-1, 1) for _ in range(size)], 3500)
    out = []
    for i in range(n(dur)):
        j = i % size
        v = buf[j]
        out.append(v)
        buf[j] = damp * 0.5 * (v + buf[(j + 1) % size])
    return out


def chain():
    """鎖ボーナス：陽音階の弦を下から上へかき鳴らす「じゃらーん」＋鈴のきらめき。
    ゲームでは深いほど速く再生して音を高くする"""
    noise(n(0.03))  # 前の版（鼓）と同じだけ共通の乱数を進め、あとに作る音を変えない
    r = random.Random(29)
    notes = [293.66, 329.63, 392.0, 440.0, 493.88, 587.33, 659.25, 783.99]  # レ ミ ソ ラ シ レ ミ ソ
    x = [0.0] * n(1.8)
    for i, f in enumerate(notes):
        place(x, pluck(f, 1.6 - i * 0.05, r, 0.997 if f < 500 else 0.998), n(0.03 * i), 1 - i * 0.04)
    k = n(1.3)
    bell = mix((tone(k, 2349.3, 4), 1), (tone(k, 3136.0, 5), 0.6), (tone(k, 4698.6, 7), 0.3))
    bell = [v * min(1, i / n(0.01)) * (0.75 + 0.25 * math.sin(TAU * 6 * i / SR)) for i, v in enumerate(bell)]
    place(x, bell, n(0.24), 0.12)
    return fade_edges(room(x, 0.3), 0.002, 0.05)


def slip():
    """ずるっ：樹皮をこする音が下がっていく"""
    k = n(0.38)
    env = [math.sin(math.pi * min(1, i / k) ** 0.6) * (0.6 + 0.4 * math.sin(i / SR * TAU * 23)) for i in range(k)]
    x = bandpass(noise(k), lambda i: 2600 - 1900 * i / k, 2.5)
    return fade_edges([v * e for v, e in zip(x, env)])


def fall():
    """あっ：全部の手が離れて落ちる「ひゅーっ」"""
    k = n(0.6)
    whistle = tone(k, lambda i: 950 * (0.33 ** (i / k)) * (1 + 0.012 * math.sin(i / SR * TAU * 7)), 2.5)
    breath = bandpass(noise(k), lambda i: 1800 - 1100 * i / k, 1.5)
    env = [min(1, i / n(0.03)) * (1 - i / k) for i in range(k)]
    return fade_edges([(a * 0.8 + b * 0.35) * e for a, b, e in zip(whistle, breath, env)])


def wind():
    """風の予告：ふくらんで消える風の音"""
    k = n(1.8)
    x = lowpass(noise(k), lambda i: 350 + 900 * math.sin(math.pi * i / k) ** 2)
    x = lowpass(x, 1400)
    env = [math.sin(math.pi * i / k) ** 1.5 * (1 + 0.25 * math.sin(i / SR * TAU * 1.7)) for i in range(k)]
    return fade_edges([v * e for v, e in zip(x, env)], 0.05, 0.05)


def thud():
    """ぽとっ：地面に落ちる鈍い音"""
    k = n(0.4)
    body = tone(k, lambda i: 55 + 70 * math.exp(-i / n(0.025)), 14)
    dirt = lowpass(noise(n(0.08)), 700)
    env = [math.exp(-30 * i / SR) for i in range(len(dirt))]
    return fade_edges(mix((body, 1), ([v * e for v, e in zip(dirt, env)], 1.4)))


def result():
    """結果画面：拍子木を2つ「カン、カン」"""
    x = [0.0] * n(0.6)
    place(x, clack(1.0, 0.18), 0)
    place(x, clack(1.06, 0.25), n(0.3))
    return fade_edges(room(x, 0.25))


# ---------- 環境音（ループ） ----------
def forest(sec=12.0, xf=0.5):
    """鳥のさえずり（風に聞こえる葉ずれは入れない。風の音は風が来るときだけ）。
    最後の xf 秒を頭に重ねて、つなぎ目なくループさせる"""
    k, kx = n(sec), n(xf)
    out = [0.0] * (k + kx)
    # 鳥：2〜4声の短いさえずりを、ときどき遠くで
    t = 0.8
    while t < sec - 1.2:
        base = rnd.uniform(2600, 3800)
        for j in range(rnd.randint(2, 4)):
            d = rnd.uniform(0.05, 0.09)
            up = rnd.choice((1, -1))
            ch = tone(n(d), lambda i, b=base, d=d, up=up: b * (1 + up * 0.25 * i / n(d)), 0)
            env = [math.sin(math.pi * i / len(ch)) for i in range(len(ch))]
            place(out, [v * e for v, e in zip(ch, env)], n(t + j * rnd.uniform(0.11, 0.16)), rnd.uniform(0.08, 0.14))
        t += rnd.uniform(1.6, 3.2)
    # 終わりの xf 秒を、頭に重ねる
    for i in range(kx):
        a = i / kx
        out[i] = out[i] * a + out[k + i] * (1 - a)
    return out[:k]


if __name__ == "__main__":
    for name, f in (("se_pon", pon), ("se_grab", grab), ("se_chain", chain), ("se_slip", slip), ("se_fall", fall),
                    ("se_wind", wind), ("se_thud", thud), ("se_result", result)):
        save(name, f())
    save("amb_forest", forest(), half=True)
