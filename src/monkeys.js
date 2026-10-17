// サルの種類：assets/monkeys の白黒の絵と monkeys.json（形式は SPEC.md §4）
import { G, CAT, cfg, LANG } from "./state.js";
const { Bodies, Body, Vertices, Vector } = Matter;

export const TYPES = [];

// 絵とデータを1回だけ読む
export async function loadMonkeys() {
  const res = await fetch("assets/monkeys/monkeys.json");
  if (!res.ok) throw new Error("monkeys.json " + res.status);
  const ready = [];
  for (const d of await res.json()) {
    const img = new Image();
    // decode() は画面が描かれていないと終わらないことがあるので、load を待つ
    ready.push(new Promise((ok, ng) => { img.onload = ok; img.onerror = () => ng(new Error(d.file)); }));
    img.src = "assets/monkeys/" + d.file;
    TYPES.push({ id: d.id, name: LANG === "en" ? d.en || d.name : d.name, img, d, tint: null, sil: null });
  }
  await Promise.all(ready);
  for (const t of TYPES) t.ink = inkArea(t);
}

// 絵の墨の面積（大きさ1倍の世界座標で）。重さはこれで決める（見た目の大きさで重さが分かるように）
function inkArea(t) {
  const { naturalWidth: w, naturalHeight: h } = t.img, cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const c = cv.getContext("2d", { willReadFrequently: true });
  c.drawImage(t.img, 0, 0);
  const a = c.getImageData(0, 0, w, h).data;
  let n = 0;
  for (let i = 3; i < a.length; i += 4) if (a[i] > 128) n++;
  return (n / (w * h)) * t.d.w * t.d.h;
}

// サルの大きさ（木に対する倍率）。絵・当たり判定・手足の位置をまとめて拡大する。
// 種ごとの倍率 SPECIES_SIZE も掛ける。重さ wt（ニホンザル＝1）は絵の墨の面積に比例（大きく見えるほど重く、握力も強い）
export function applyScale(k) {
  G.SZ = k;
  for (const t of TYPES) {
    const s = cfg.SPECIES_SIZE[t.id], k = (t.k = G.SZ * (s > 0 ? s : 1)), d = t.d, hull = d.hull.map(([x, y]) => ({ x: x * k, y: y * k })), c = Vertices.centre(hull);
    t.w = d.w * k; t.h = d.h * k; t.c = c;
    t.verts = hull.map((p) => ({ x: p.x - c.x, y: p.y - c.y }));
    t.points = d.points.map((p) => ({ x: p.x * k - c.x, y: p.y * k - c.y, kind: p.kind, grab: p.grab, hang: p.hang }));
    t.head = { x: d.head[0] * k - c.x, y: d.head[1] * k - c.y };
  }
  const ref = TYPES.find((t) => t.id === "nihonzaru") || TYPES[0];
  G.M0 = Bodies.fromVertices(0, 0, [ref.verts]).mass;
  for (const t of TYPES) t.wt = (t.ink * t.k * t.k) / (ref.ink * ref.k * ref.k);
}

// 24種からランダム（直前と同じ種は出さない）
export function randType() {
  let t;
  do t = TYPES[Math.floor(G.rand() * TYPES.length)]; while (t === G.lastType && TYPES.length > 1);
  G.lastType = t;
  return t;
}

export function makeMonkey(type, x, y) {
  const b = Bodies.fromVertices(x, y, [type.verts], {
    friction: 0.6, frictionAir: 0.03, restitution: 0, label: "monkey",
    collisionFilter: { category: CAT.M, mask: CAT.G }, // サル同士・木とはぶつからない（ぶら下がりの引っぱり合いで震えるのを防ぐ）
  });
  const shift = Vertices.centre(type.verts);
  Body.setPosition(b, { x, y });
  Body.setMass(b, G.M0 * type.wt);
  const n = type.points.length;
  const m = {
    type, body: b, shift, grabs: Array(n).fill(null), hangBy: Array(n).fill(null), held: false, releasedAt: 0,
    vis: { sweat: 0, flush: 0, shake: 0 }, strain: 0, fatigue: 0, ratio: 1, stam: Array(n).fill(1), numb: Array(n).fill(0),
  };
  b.monkey = m;
  return m;
}

export const localPt = (m, lp) => Vector.rotate(Vector.sub(lp, m.shift), m.body.angle);
export const pointW = (m, i) => Vector.add(m.body.position, localPt(m, m.type.points[i]));
