// つかむ・離す・木の上の場所取り・鎖の深さと点数（理由は SPEC.md §2・§5）
import { G, cfg, P, T, COLOR, pop } from "./state.js";
import { dist, closest, now, fill } from "./util.js";
import { pointW, localPt } from "./monkeys.js";
const { Body, Composite, Constraint, Vector } = Matter;

const C = cfg.GRAB;

// 自分の下にぶら下がっている仲間（子孫）
function descendants(m, set = new Set()) {
  for (const c of m.hangBy) if (c && !set.has(c.mon)) { set.add(c.mon); descendants(c.mon, set); }
  return set;
}

// つかんでいる先の、いまの位置
export function grabWorld(m, i) {
  const g = m.grabs[i];
  if (g.kind === "tree") return Vector.add(g.piece.body.position, Vector.rotate(g.local, g.piece.body.angle));
  return pointW(g.mon, g.pi);
}

// 手 i がつかめる先を探す（枝か、ほかのサルの空いている hang 点）
export function findTarget(m, i, range) {
  const hp = pointW(m, i);
  let best = null, bd = range;
  // 2本目の手（や尻尾）は、1本目と同じもの（木なら木、サルならそのサル）しかつかまない
  const first = m.grabs.find(Boolean);
  const onlyMon = first && first.kind === "mon" ? first.mon : null, onlyTree = first && first.kind === "tree";
  // 2本目は、1本目のつかみ位置から「手と手の間かく」に近い場所だけ（体がねじれないように）
  let fit = () => true;
  if (first) {
    const fi = m.grabs.indexOf(first), span = dist(m.type.points[fi], m.type.points[i]), fp = grabWorld(m, fi);
    fit = (q) => Math.abs(dist(q, fp) - span) <= C.SECOND_FIT;
  }
  if (onlyTree) {
    // 枝なら「1本目のつかみ位置＋今の手と手のずれ」ぴったりの位置に添える
    const fi = m.grabs.indexOf(first), q = Vector.add(grabWorld(m, fi), Vector.sub(hp, pointW(m, fi)));
    const pc = first.piece, c0 = closest(q, pc.a, pc.b);
    if (dist(q, c0) - pc.t / 2 <= C.SECOND_ON_BRANCH && dist(hp, q) < range && dist(c0, pc.a) >= C.BASE_CLEAR)
      return { kind: "tree", piece: pc, point: q, second: true };
    return null;
  }
  if (!onlyMon) {
    // 木の上で、ほかのサルの手がすでにある場所はつかめない。少しずらして空いているところを探す
    const taken = [];
    for (const o of G.monkeys) {
      if (o === m) continue;
      o.grabs.forEach((g) => { if (g && g.kind === "tree") taken.push(Vector.add(g.piece.body.position, Vector.rotate(g.local, g.piece.body.angle))); });
    }
    const free = (q) => taken.every((t) => dist(t, q) >= C.GAP * G.SZ);
    for (const p of G.pieces) {
      if (p.kind !== "branch") continue; // 幹はつかめない。枝だけ
      const q0 = closest(hp, p.a, p.b), len = dist(p.a, p.b), ux = (p.b.x - p.a.x) / len, uy = (p.b.y - p.a.y) / len;
      for (let k = 0; k <= C.SLIDE_TRIES; k++) {
        const off = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * C.SLIDE_STEP;
        const t = (q0.x - p.a.x) * ux + (q0.y - p.a.y) * uy + off;
        if (t < C.BASE_CLEAR || t > len) continue; // 幹のそばの付け根はつかめない
        const q = { x: p.a.x + ux * t, y: p.a.y + uy * t }, d = dist(hp, q) - p.t / 2;
        if (d >= bd) continue;
        if (!free(q) || !fit(q)) continue;
        bd = d; best = { kind: "tree", piece: p, point: q };
        break;
      }
    }
  }
  const below = descendants(m); // 自分の下の仲間はつかまない（輪になるのを防ぐ）
  for (const o of G.monkeys) {
    if (o === m || o.held || below.has(o) || (onlyMon && o !== onlyMon)) continue;
    o.type.points.forEach((pt, j) => {
      if (!pt.hang || o.hangBy[j] || o.grabs[j]) return;
      const fp = pointW(o, j), d = dist(hp, fp);
      if (d < bd && fit(fp)) { bd = d; best = { kind: "mon", mon: o, pi: j, point: fp }; }
    });
  }
  return best;
}

// 鎖の何番目か：枝につかまっていれば1、そのサルの下なら2…（木につながっていなければ0）
function chainDepth(m, seen = new Set()) {
  if (seen.has(m)) return 0;
  seen.add(m);
  let best = 0;
  for (const g of m.grabs) {
    if (!g) continue;
    if (g.kind === "tree") return 1;
    const d = chainDepth(g.mon, seen);
    if (d && (!best || d + 1 < best)) best = d + 1;
  }
  return best;
}

// 新しく連れてきたサルが、はじめて木につながったときだけ点を入れる（置きなおしでは入らない）
const scoreEl = document.getElementById("cnt");
function scoreNew(m) {
  if (m.scored || G.state !== "play") return;
  const k = chainDepth(m);
  if (!k) return;
  m.scored = true; G.score += k;
  const p = m.body.position, top = p.y - m.type.h * 0.55;
  if (k >= 2) {
    G.rings.push({ x: p.x, y: top + m.type.h * 0.2, t: now(), k });
    pop(p.x, top - 6 * G.SZ, fill(T.CHAIN, { k }), 30 + Math.min(k, 8) * 2, true, COLOR.SHU);
    pop(p.x + 26 * G.SZ, top - 38 * G.SZ, fill(T.PLUS, { k }), 26, false, COLOR.SHU);
    G.shake = Math.min(14, 4 + k * 1.5);
  } else pop(p.x, top - 10 * G.SZ, fill(T.PLUS, { k }), 22, false, COLOR.SUMI);
  scoreEl.textContent = G.score;
  const box = scoreEl.closest(".cnt");
  box.classList.remove("bump", "bumpBig"); void box.offsetWidth; box.classList.add(k >= 2 ? "bumpBig" : "bump");
}

function grab(m, i, t) {
  const pA = localPt(m, m.type.points[i]);
  let c, g;
  if (t.kind === "tree") {
    const bd = t.piece.body, local = Vector.rotate(Vector.sub(t.point, bd.position), -bd.angle);
    c = Constraint.create({ bodyA: m.body, pointA: pA, bodyB: bd, pointB: Vector.rotate(local, bd.angle), length: 0, stiffness: C.STIFFNESS, damping: C.DAMPING });
    g = { c, kind: "tree", piece: t.piece, local };
  } else {
    const o = t.mon;
    c = Constraint.create({ bodyA: m.body, pointA: pA, bodyB: o.body, pointB: localPt(o, o.type.points[t.pi]), length: 0, stiffness: C.STIFFNESS, damping: C.DAMPING });
    g = { c, kind: "mon", mon: o, pi: t.pi };
    o.hangBy[t.pi] = { mon: m, i };
  }
  g.stamina = m.stam[i]; g.strain = 0; g.at = G.simT;
  c.length = Math.max(C.MIN_LEN, dist(pointW(m, i), t.point)); // いきなり引き寄せず、たぐり寄せる（長さ0は暴れる）
  if (m.grabs.some(Boolean)) { c.stiffness = C.SECOND_STIFFNESS; c.damping = C.SECOND_DAMPING; } // 2本目は添えるだけ
  Composite.add(G.world, c);
  m.grabs[i] = g;
  scoreNew(m);
  Body.setVelocity(m.body, Vector.mult(m.body.velocity, C.CATCH_SLOW));
  Body.setAngularVelocity(m.body, m.body.angularVelocity * C.CATCH_SLOW);
  if (!G.firstGrabAt) { G.firstGrabAt = G.simT; G.wind.next = G.simT + cfg.WIND.FIRST_MIN + G.rand() * cfg.WIND.FIRST_RAND; }
}

// 手 i を離す。quiet は持ち上げたとき（擬音も撮影もなし）
export function release(m, i, quiet) {
  const g = m.grabs[i];
  if (!g) return;
  const wasOnTree = !quiet && attached(m); // 木につながっていたサルが手をはなしたときだけ、落ちはじめを撮る
  Composite.remove(G.world, g.c);
  if (g.kind === "mon" && g.mon.hangBy[g.pi] && g.mon.hangBy[g.pi].mon === m) g.mon.hangBy[g.pi] = null;
  m.stam[i] = Math.max(0, g.stamina); // 体力はつかみ直しても引き継ぐ
  if (g.stamina <= 0.05) m.numb[i] = G.simT + C.NUMB_SEC; // 力尽きた手はしびれてつかめない
  m.grabs[i] = null;
  if (quiet) return;
  const p = pointW(m, i);
  pop(p.x, p.y - 10, m.grabs.some(Boolean) ? T.POP_ZURU : T.POP_A, 24);
  if (wasOnTree && !m.grabs.some(Boolean) && G.state === "play")
    G.fallPlan = { at: G.simT + cfg.END.FALL_SHOT_DELAY, m, from: g.kind === "mon" ? g.mon : null, hand: p };
}

function tryGrabAll(m) {
  let got = 0;
  m.type.points.forEach((pt, i) => {
    if (!pt.grab || m.grabs[i] || m.hangBy[i] || G.simT < m.numb[i]) return;
    const t = findTarget(m, i, P.RANGE);
    if (t) { grab(m, i, t); got++; }
  });
  return got;
}

// 毎ステップ、つかめる点が近くにあれば自動でつかむ
export function autoGrab() {
  for (const m of G.monkeys) {
    if (m.held) continue;
    if (m.grabs.some(Boolean) && G.simT - (m.lastLetGo ?? -9) < C.REGRAB_WAIT) continue;
    const got = tryGrabAll(m);
    if (got && now() - m.releasedAt < 4000 && !m.popped) {
      m.popped = true;
      pop(m.body.position.x, m.body.position.y - 60, T.POP_HOI, 22);
      if (++G.placedSinceHint >= 3) document.getElementById("hint").classList.add("fade");
    }
  }
}

// 重なったサルは、ゆっくり左右に押し合ってずれる（つながっている相手とは押し合わない）。
// ぶつかり判定は使わず、弱い力だけにする（強いと前の暴れが戻る）
export function separate() {
  const ms = G.monkeys.filter((m) => !m.held);
  if (ms.length < 2) return;
  const g = G.engine.gravity, linked = new Set();
  for (const m of ms) for (const gr of m.grabs) if (gr && gr.kind === "mon") {
    linked.add(m.body.id + "-" + gr.mon.body.id); linked.add(gr.mon.body.id + "-" + m.body.id);
  }
  for (let i = 0; i < ms.length; i++) for (let j = i + 1; j < ms.length; j++) {
    const a = ms[i], b = ms[j];
    if (linked.has(a.body.id + "-" + b.body.id)) continue;
    const dx = b.body.position.x - a.body.position.x, dy = b.body.position.y - a.body.position.y;
    const want = (a.type.w + b.type.w) * 0.42;
    if (Math.abs(dy) > (a.type.h + b.type.h) * 0.35) continue;
    const d = Math.abs(dx);
    if (d >= want) continue;
    const dir = dx > 0.5 ? 1 : dx < -0.5 ? -1 : a.body.id < b.body.id ? 1 : -1;
    const k = C.SEP_K * (1 - d / want) * g.scale * g.y;
    Body.applyForce(a.body, a.body.position, { x: -dir * k * a.body.mass, y: 0 });
    Body.applyForce(b.body, b.body.position, { x: dir * k * b.body.mass, y: 0 });
  }
}

// ---------- 群れの計算 ----------
// つながっている仲間（手・足・尻尾でつながったサル）をたどる
export function componentOf(start) {
  const seen = new Set([start]), q = [start];
  while (q.length) {
    const m = q.pop();
    const nb = [...m.grabs.filter((g) => g && g.kind === "mon").map((g) => g.mon), ...m.hangBy.filter(Boolean).map((h) => h.mon)];
    for (const o of nb) if (!o.held && !seen.has(o)) { seen.add(o); q.push(o); }
  }
  return [...seen];
}
export const attached = (x) => componentOf(x).some((y) => y.grabs.some((g) => g && g.kind === "tree"));

// onTree：木につながっているサルの数。bestOn：木につながっている、いちばん大きな群れの匹数
export function groups() {
  const ms = G.monkeys.filter((m) => !m.held), idx = new Map(ms.map((m, i) => [m, i]));
  const par = ms.map((_, i) => i), f = (i) => (par[i] === i ? i : (par[i] = f(par[i])));
  const adj = ms.map(() => []), roots = new Set();
  ms.forEach((m, i) => m.grabs.forEach((g) => {
    if (!g) return;
    if (g.kind === "tree") { roots.add(i); return; }
    const j = idx.get(g.mon);
    if (j === undefined) return;
    par[f(i)] = f(j); adj[i].push(j); adj[j].push(i);
  }));
  const seen = new Set(roots), q = [...roots];
  while (q.length) { const i = q.pop(); for (const j of adj[i]) if (!seen.has(j)) { seen.add(j); q.push(j); } }
  const ac = new Map();
  seen.forEach((i) => { const r = f(i); ac.set(r, (ac.get(r) || 0) + 1); });
  let bestOn = 0;
  ac.forEach((n) => { if (n > bestOn) bestOn = n; });
  return { bestOn, onTree: seen.size };
}
