// 入力：右上の札からサルを連れてくる／置いたサルを持ち上げて置きなおす（SPEC.md §1）
import { G, cfg, T, pop } from "./state.js";
import { now, dist } from "./util.js";
import { makeMonkey, randType, pointW } from "./monkeys.js";
import { release } from "./grab.js";
import { toWorld, clampHeld } from "./camera.js";
const { Body, Composite, Vertices, Vector } = Matter;

const cv = document.getElementById("cv");
const nextBox = document.getElementById("nextBox");
const nextCv = document.getElementById("nextCv"), nctx = nextCv.getContext("2d");
let trail = [], lift = 0, fromBox = false;

// 右上の札に、次に出てくるサルを描く
export function updateNext() {
  const t = G.nextType;
  document.getElementById("nextName").textContent = t.name;
  nctx.setTransform(1, 0, 0, 1, 0, 0); nctx.clearRect(0, 0, 80, 104);
  const k = Math.min(72 / t.w, 98 / t.h);
  nctx.drawImage(t.img, 40 - (t.w * k) / 2, 52 - (t.h * k) / 2, t.w * k, t.h * k);
}

// ---------- 出す・はなす ----------
function spawnHeld(x, y) {
  const m = makeMonkey(G.nextType, x, y);
  Body.setStatic(m.body, true); m.body.isSensor = true; m.held = true;
  G.held = m; G.monkeys.push(m); Composite.add(G.world, m.body);
  G.nextType = randType(); updateNext();
}
function releaseHeld() {
  const m = G.held;
  if (!m) return;
  G.held = null; m.held = false; m.picked = false;
  Body.setStatic(m.body, false); m.body.isSensor = false; Body.setAngle(m.body, 0); Body.setAngularVelocity(m.body, 0);
  // 運んでいた勢いを少しだけ残す
  let v = { x: 0, y: 0 };
  if (trail.length > 1) {
    const f = trail[0], l = trail[trail.length - 1], dt = (l.t - f.t) / 16.67;
    if (dt > 0.3) {
      v = { x: (l.x - f.x) / dt, y: (l.y - f.y) / dt };
      const sp = Math.hypot(v.x, v.y), max = cfg.GRAB.THROW_MAX;
      if (sp > max) v = { x: (v.x / sp) * max, y: (v.y / sp) * max };
    }
  }
  Body.setVelocity(m.body, v);
  m.releasedAt = now();
  G.canSpawnAt = now() + 300;
}
// 運んでいるサルを、なかったことにする（札に戻す）
export function dropHeldSilently() {
  const h = G.held;
  if (!h) return;
  Composite.remove(G.world, h.body);
  G.monkeys = G.monkeys.filter((m) => m !== h);
  G.nextType = h.type; G.held = null; updateNext();
}

// ---------- 置いたサルを選ぶ・持ち上げる ----------
// 押した場所にいるサルを、手前（あとから置いた・最後に動かした）から順に並べる
function hitAll(p) {
  const s = Math.max(0.35, G.view.s), tol = 14 / s, near = 22 / s, out = [];
  for (let k = G.monkeys.length - 1; k >= 0; k--) {
    const m = G.monkeys[k];
    if (m.held) continue;
    if (Vertices.contains(m.body.vertices, p) || m.type.points.some((pt, i) => pt.grab && dist(pointW(m, i), p) < tol) ||
      dist(m.body.position, p) < near) out.push(m);
  }
  return out;
}
// 選んでいるサル：押すと朱の縁で光る。動かさずに同じ場所を押しなおすと、下のサルに切り替わる
let sel = null;     // {cands, idx, t, sx, sy}
let pending = null; // 押したが、まだ動かしていない {m, p, sx, sy}
const SEL_KEEP = 1800, MOVE_PX = 7, SAME_PX = 30;
// 光らせるサルと、候補の何番目か
export function selection() {
  if (!sel || !(pending || now() - sel.t < SEL_KEEP)) return null;
  return { m: sel.cands[sel.idx], i: sel.idx, n: sel.cands.length };
}
export function clearInput() { sel = null; pending = null; fromBox = false; nextBox.classList.remove("pulling"); }

// 置いたサルを持ち上げる。ぶら下がっている仲間はついてくる
function pickUp(m, p) {
  if (G.held && !G.held.picked) dropHeldSilently();
  m.grabs.forEach((g, i) => { if (g) release(m, i, true); });
  Body.setStatic(m.body, true); m.body.isSensor = true; m.held = true; m.picked = true; m.popped = true;
  G.held = m; G.dragging = true; lift = 0;
  G.monkeys.splice(G.monkeys.indexOf(m), 1); G.monkeys.push(m); // 手前に出す
  m.pickOff = Vector.sub(m.body.position, p);
  trail = [{ x: m.body.position.x, y: m.body.position.y, t: now() }];
  pop(m.body.position.x, m.body.position.y - 60, T.POP_YOISHO, 20);
}

cv.addEventListener("pointerdown", (e) => {
  if (G.state !== "play") return;
  try { cv.setPointerCapture(e.pointerId); } catch {}
  if (G.held) return;
  const p = toWorld(e), cands = hitAll(p);
  if (!cands.length) { sel = null; return; } // 何もないところを押しても、サルは出ない（右上の札から連れてくる）
  const same = sel && now() - sel.t < SEL_KEEP && Math.hypot(e.clientX - sel.sx, e.clientY - sel.sy) < SAME_PX &&
    sel.cands.length === cands.length && cands.every((m) => sel.cands.includes(m));
  if (same) sel.idx = (sel.idx + 1) % cands.length;
  else sel = { cands, idx: 0 };
  sel.t = now(); sel.sx = e.clientX; sel.sy = e.clientY;
  pending = { m: sel.cands[sel.idx], p, sx: e.clientX, sy: e.clientY };
});

// 右上の札からドラッグして、サルを連れてくる。指の少し上についてくる（指で隠れないように）
nextBox.addEventListener("pointerdown", (e) => {
  if (G.state !== "play" || G.held || now() < G.canSpawnAt) return;
  e.preventDefault();
  try { nextBox.setPointerCapture(e.pointerId); } catch {}
  const p = toWorld(e);
  lift = e.pointerType === "touch" ? (56 / G.view.s) * 0.9 : 0;
  const q = clampHeld({ x: p.x, y: p.y - lift });
  spawnHeld(q.x, q.y);
  trail = [{ x: q.x, y: q.y, t: now() }];
  G.dragging = true; fromBox = true; nextBox.classList.add("pulling");
});

addEventListener("pointermove", (e) => {
  if (pending && G.state === "play" && Math.hypot(e.clientX - pending.sx, e.clientY - pending.sy) > MOVE_PX) {
    const pm = pending.m, pp = pending.p;
    pending = null; sel = null;
    if (G.monkeys.includes(pm) && !pm.held) pickUp(pm, pp);
  }
  if (G.state !== "play" || !G.held || !G.dragging) return;
  const p = toWorld(e);
  const q = G.held.picked ? clampHeld(Vector.add(p, G.held.pickOff)) : clampHeld({ x: p.x, y: p.y - lift });
  Body.setPosition(G.held.body, q);
  const tn = now();
  trail.push({ x: q.x, y: q.y, t: tn });
  while (trail.length > 2 && tn - trail[0].t > 90) trail.shift();
});

function overBox(e) {
  const r = nextBox.getBoundingClientRect();
  return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
}
function endPointer(e) {
  nextBox.classList.remove("pulling");
  if (pending) { pending = null; if (sel) sel.t = now(); return; } // 動かさずに離した：選んだまま（もう一度押すと下のサルへ）
  if (!G.dragging) return;
  G.dragging = false;
  const wasFromBox = fromBox;
  fromBox = false;
  if (!G.held || G.state !== "play") return;
  if (wasFromBox && e.type === "pointerup" && overBox(e)) { dropHeldSilently(); return; } // 札の上で離したら、連れてくるのをやめる
  releaseHeld();
}
addEventListener("pointerup", endPointer);
addEventListener("pointercancel", endPointer);
