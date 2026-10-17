// サルの種類：assets/monkeys の白黒の絵と monkeys.json（形式は SPEC.md §4）
import { G, CAT } from "./state.js";
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
    TYPES.push({ id: d.id, name: d.name, img, d, tint: null, sil: null });
  }
  await Promise.all(ready);
}

// サルの大きさ（木に対する倍率）。絵・当たり判定・手足の位置をまとめて拡大する
export function applyScale(k) {
  G.SZ = k;
  for (const t of TYPES) {
    const d = t.d, hull = d.hull.map(([x, y]) => ({ x: x * k, y: y * k })), c = Vertices.centre(hull);
    t.w = d.w * k; t.h = d.h * k; t.c = c;
    t.verts = hull.map((p) => ({ x: p.x - c.x, y: p.y - c.y }));
    t.points = d.points.map((p) => ({ x: p.x * k - c.x, y: p.y * k - c.y, kind: p.kind, grab: p.grab, hang: p.hang }));
    t.head = { x: d.head[0] * k - c.x, y: d.head[1] * k - c.y };
  }
  const ref = TYPES.find((t) => t.id === "nihonzaru") || TYPES[0];
  G.M0 = Bodies.fromVertices(0, 0, [ref.verts]).mass;
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
