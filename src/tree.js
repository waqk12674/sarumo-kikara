// 木：根元は固定。幹と枝が重さと風でしなる（物理エンジンの剛体ではなく、自前のばねで動かす）
import { G, cfg, P, DT, CAT } from "./state.js";
import { clamp } from "./util.js";
const { Bodies, Body, Composite, Vector } = Matter;

const C = cfg.TREE;
export const TRUNK_X = C.TRUNK_X, GROUND_Y = C.GROUND_Y, LT = C.GROUND_Y - C.TOP_Y;
const TRUNK_SEGS = 16;

// 枝の定義に、幹の上の位置 s・長さ・向きを足す
export const BR = C.BRANCHES.map((b) => {
  const s = (GROUND_Y - b.y) / LT, dx = b.tip[0] - TRUNK_X, dy = b.tip[1] - b.y;
  return { ...b, s, len: Math.hypot(dx, dy), phi: Math.atan2(dy, dx), sg: Math.sign(dx) };
});

export const trunkPt = (s) => ({ x: TRUNK_X + G.tr.U * s * s, y: GROUND_Y - LT * s });
export const trunkTilt = (s) => Math.atan2(2 * G.tr.U * s, LT); // 鉛直からの傾き（右に倒れると正）
export const trunkW = (s) => 36 - 26 * s;
export function branchEnds(j) {
  const b = BR[j], a = trunkPt(b.s), ang = b.phi + trunkTilt(b.s) + G.tr.d[j] * b.sg;
  return { a, b: { x: a.x + Math.cos(ang) * b.len, y: a.y + Math.sin(ang) * b.len }, ang };
}

export function buildTree() {
  G.tr = { U: 0, Uv: 0, d: BR.map(() => 0), dv: BR.map(() => 0) };
  G.pieces = [];
  const opt = { isStatic: true, friction: 0.9, label: "tree", collisionFilter: { category: CAT.T, mask: CAT.M } };
  for (let k = 0; k < TRUNK_SEGS; k++) {
    const s0 = k / TRUNK_SEGS, s1 = (k + 1) / TRUNK_SEGS, t = trunkW((s0 + s1) / 2);
    G.pieces.push({ kind: "trunk", s0, s1, t, body: Bodies.rectangle(0, 0, LT / TRUNK_SEGS, t, opt) });
  }
  BR.forEach((b, j) => G.pieces.push({ kind: "branch", j, t: b.t, body: Bodies.rectangle(0, 0, b.len, b.t, opt) }));
  Composite.add(G.world, G.pieces.map((p) => p.body));
  placeTree();
}

// 計算した形に合わせて、幹と枝の当たり判定を置き直す
function placeTree() {
  for (const p of G.pieces) {
    let a, b;
    if (p.kind === "trunk") { a = trunkPt(p.s0); b = trunkPt(p.s1); }
    else { const e = branchEnds(p.j); a = e.a; b = e.b; }
    p.a = a; p.b = b;
    Body.setPosition(p.body, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    Body.setAngle(p.body, Math.atan2(b.y - a.y, b.x - a.x));
  }
}

// しなりを1ステップ進める。treeLoads は木をつかんでいる手ごとの {g, p, lx, ly}
export function stepTree(treeLoads) {
  const tr = G.tr;
  let M = G.wind.w * C.WIND_ON_TREE; // 木そのものが受ける風
  const tau = BR.map(() => 0);
  for (const L of treeLoads) {
    M += L.ly * (L.p.x - TRUNK_X) + L.lx * (GROUND_Y - L.p.y) * 0.35;
    if (L.g.piece.kind === "branch") {
      const j = L.g.piece.j, b = L.g.piece.a;
      tau[j] += ((L.p.x - b.x) * L.ly - (L.p.y - b.y) * L.lx) * BR[j].sg;
    }
  }
  const f = 1 / P.FUNBARI;
  const Ueq = clamp(M * C.TRUNK_K * f, -C.TRUNK_MAX, C.TRUNK_MAX);
  const wT = C.TRUNK_OMEGA, zT = C.TRUNK_ZETA;
  tr.Uv += (wT * wT * (Ueq - tr.U) - 2 * zT * wT * tr.Uv) * DT; tr.U += tr.Uv * DT;
  BR.forEach((b, j) => {
    const eq = clamp(tau[j] * C.BRANCH_K * Math.pow(14 / b.t, 2) * f, C.BRANCH_MIN, C.BRANCH_MAX);
    const w = C.BRANCH_OMEGA, z = C.BRANCH_ZETA;
    tr.dv[j] += (w * w * (eq - tr.d[j]) - 2 * z * w * tr.dv[j]) * DT; tr.d[j] += tr.dv[j] * DT;
  });
  placeTree();
  // 枝をつかんでいるつなぎ目も、枝と一緒に動かす
  for (const m of G.monkeys) for (const g of m.grabs) if (g && g.kind === "tree") {
    g.c.pointB = Vector.rotate(g.local, g.piece.body.angle); g.c.angleB = g.piece.body.angle;
  }
}
