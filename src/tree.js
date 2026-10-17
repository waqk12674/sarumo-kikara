// 木：根元は固定。幹と枝が重さと風でしなる（物理エンジンの剛体ではなく、自前のばねで動かす）
import { G, cfg, P, DT, CAT, TREE_SET } from "./state.js";
import { clamp, dist } from "./util.js";
const { Bodies, Body, Composite, Vector } = Matter;

const C = cfg.TREE;
export const TRUNK_X = C.TRUNK_X, GROUND_Y = C.GROUND_Y, LT = C.GROUND_Y - C.TOP_Y;
const TRUNK_SEGS = 16;

// 枝の定義に、幹の上の位置 s・全体の長さ・向き（左-1／右+1）を足す。
// 点は根元からのずれ off で持つ（mid があれば「への字」の山を通って先端へ。なければまっすぐ）
export const BR = ((TREE_SET && C.BRANCH_SETS[TREE_SET]) || C.BRANCHES).map((b) => {
  const s = (GROUND_Y - b.y) / LT;
  const off = [...(b.mid ? [b.mid] : []), b.tip].map(([x, y]) => ({ x: x - TRUNK_X, y: y - b.y }));
  let len = 0, prev = { x: 0, y: 0 };
  for (const o of off) { len += dist(o, prev); prev = o; }
  return { ...b, s, off, len, sg: Math.sign(off[off.length - 1].x) };
});

export const trunkPt = (s) => ({ x: TRUNK_X + G.tr.U * s * s, y: GROUND_Y - LT * s });
export const trunkTilt = (s) => Math.atan2(2 * G.tr.U * s, LT); // 鉛直からの傾き（右に倒れると正）
export const trunkW = (s) => 36 - 26 * s;
// 枝 j のいまの点（根元・山・先端）。幹の傾きとしなりの分だけ、根元を中心に回す
export function branchPts(j) {
  const b = BR[j], a = trunkPt(b.s), rot = trunkTilt(b.s) + G.tr.d[j] * b.sg;
  return [a, ...b.off.map((o) => Vector.add(a, Vector.rotate(o, rot)))];
}

export function buildTree() {
  G.tr = { U: 0, Uv: 0, d: BR.map(() => 0), dv: BR.map(() => 0) };
  G.pieces = [];
  const opt = { isStatic: true, friction: 0.9, label: "tree", collisionFilter: { category: CAT.T, mask: CAT.M } };
  for (let k = 0; k < TRUNK_SEGS; k++) {
    const s0 = k / TRUNK_SEGS, s1 = (k + 1) / TRUNK_SEGS, t = trunkW((s0 + s1) / 2);
    G.pieces.push({ kind: "trunk", s0, s1, t, body: Bodies.rectangle(0, 0, LT / TRUNK_SEGS, t, opt) });
  }
  // 枝は、折れ線の1区間ごとに当たり判定を1つ（seg＝根元から何番目の区間か）
  BR.forEach((b, j) => {
    const pts = branchPts(j);
    for (let k = 0; k < pts.length - 1; k++)
      G.pieces.push({ kind: "branch", j, seg: k, t: b.t, body: Bodies.rectangle(0, 0, dist(pts[k], pts[k + 1]), b.t, opt) });
  });
  Composite.add(G.world, G.pieces.map((p) => p.body));
  placeTree();
}

// 計算した形に合わせて、幹と枝の当たり判定を置き直す
function placeTree() {
  for (const p of G.pieces) {
    let a, b;
    if (p.kind === "trunk") { a = trunkPt(p.s0); b = trunkPt(p.s1); }
    else { const pts = branchPts(p.j); a = pts[p.seg]; b = pts[p.seg + 1]; }
    p.a = a; p.b = b;
    Body.setPosition(p.body, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    Body.setAngle(p.body, Math.atan2(b.y - a.y, b.x - a.x));
  }
}

// しなりを1ステップ進める。treeLoads は木をつかんでいる手ごとの {g, p, lx, ly}
export function stepTree(treeLoads) {
  const tr = G.tr;
  const wb = C.WIND_BEND; // 風でしなる割合（サルが受けた横風 lx も、木に伝わる分はこれだけにする）
  let M = G.wind.w * C.WIND_ON_TREE * wb; // 木そのものが受ける風
  const tau = BR.map(() => 0);
  for (const L of treeLoads) {
    M += L.ly * (L.p.x - TRUNK_X) + L.lx * wb * (GROUND_Y - L.p.y) * 0.35;
    if (L.g.piece.kind === "branch") {
      const j = L.g.piece.j, b = trunkPt(BR[j].s); // 枝の根元まわりのモーメント
      tau[j] += ((L.p.x - b.x) * L.ly - (L.p.y - b.y) * L.lx * wb) * BR[j].sg;
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
