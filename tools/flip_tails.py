"""尻尾を「腕と逆」（下向き）にする（python tools/flip_tails.py）。
assets/source/tails/<id>.png（加工前の絵）から尻尾だけを多角形で切り出し、付け根の高さ pivot_y を軸に上下反転して
assets/monkeys/<id>.png に書き出す。絵が下に伸びたぶん monkeys.json の h を直し、尻尾の点を新しい尻尾の先へ移して
「仲間がぶら下がれる点」（grab=False, hang=True）にする。加工前の絵から作るので、何度実行しても同じ結果になる。
座標はすべて加工前の絵のピクセル。"""
import json, pathlib
from PIL import Image, ImageDraw

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC, OUT = ROOT / "assets" / "source" / "tails", ROOT / "assets" / "monkeys"

TAILS = {
    # poly：尻尾を囲む多角形（体や腕にかからないように）。pivot_y：付け根の高さ。tip：加工前の尻尾の先
    "kumozaru": {"poly": [(0, 48), (47, 48), (47, 160), (0, 160)], "pivot_y": 142, "tip": (28, 72)},
    "hoezaru": {"poly": [(104, 55), (150, 55), (150, 150), (98, 150), (98, 129), (104, 129)], "pivot_y": 138, "tip": (126, 78)},
    "risuzaru": {"poly": [(184, 188), (268, 188), (268, 392), (186, 392), (186, 345), (200, 300), (200, 240), (184, 236)], "pivot_y": 370, "tip": (200, 219)},
}


def flip(id_, poly, pivot_y):
    im = Image.open(SRC / f"{id_}.png").convert("RGBA")
    w, h = im.size
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).polygon(poly, fill=255)
    tail = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    tail.paste(im, (0, 0), mask)
    body = im.copy()
    body.paste((0, 0, 0, 0), (0, 0), mask)  # 尻尾のあったところは透明に
    x0, y0, x1, y1 = tail.getbbox()
    piece = tail.crop((x0, y0, x1, y1)).transpose(Image.FLIP_TOP_BOTTOM)
    ny0 = 2 * pivot_y - y1  # 反転後の上端（付け根の高さはそのまま）
    nh = max(h, ny0 + (y1 - y0))
    out = Image.new("RGBA", (w, nh), (0, 0, 0, 0))
    out.paste(body, (0, 0))
    out.alpha_composite(piece, (x0, ny0))
    out.save(OUT / f"{id_}.png")
    return w, nh


if __name__ == "__main__":
    path = OUT / "monkeys.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    for d in data:
        cfg = TAILS.get(d["id"])
        if not cfg:
            continue
        w, nh = flip(d["id"], cfg["poly"], cfg["pivot_y"])
        s = Image.open(SRC / f"{d['id']}.png").width / d["w"]  # ピクセル / 世界の単位
        d["h"] = round(nh / s, 1)
        tx, ty = cfg["tip"]
        for p in d["points"]:
            if p["kind"] == "tail":
                p["x"], p["y"] = round(tx / s, 1), round((2 * cfg["pivot_y"] - ty) / s, 1)
                p["grab"], p["hang"] = False, True
        print(f"{d['id']}: {w}x{nh}px  h={d['h']}  tail=({tx / s:.1f}, {(2 * cfg['pivot_y'] - ty) / s:.1f})")
    # 元の形式のまま（1字下げ・改行は LF・末尾に改行なし）
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(json.dumps(data, ensure_ascii=False, indent=1))
