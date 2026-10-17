// 起動・ループ・画面の切り替え・HUD・?debug=1 の調整パネル
import { G, cfg, P, T, CAT, DEBUG, GOD, newRand, pop } from "./state.js";
import { now } from "./util.js";
import { TRUNK_X, GROUND_Y, buildTree, stepTree } from "./tree.js";
import { TYPES, loadMonkeys, applyScale, randType } from "./monkeys.js";
import { autoGrab, separate, groups, release } from "./grab.js";
import { computeLoads, stepGrip } from "./grip.js";
import { stepWind, setWindBanner } from "./wind.js";
import { resize, fitCam } from "./camera.js";
import { updateNext, dropHeldSilently, clearInput } from "./input.js";
import { drawScene } from "./render.js";
import { finish, takeSnap, takeFallShot } from "./result.js";
const { Engine, Bodies, Body, Composite, Events, Vector } = Matter;

const cv = document.getElementById("cv"), ctx = cv.getContext("2d");
const hint = document.getElementById("hint");

// ---------- 世界をつくる ----------
function init() {
  G.rand = newRand();
  applyScale(P.SIZE);
  const engine = Engine.create();
  engine.positionIterations = 10; engine.velocityIterations = 8; engine.constraintIterations = 8;
  G.engine = engine; G.world = engine.world;
  G.ground = Bodies.rectangle(TRUNK_X, GROUND_Y + 40, 8000, 80, { isStatic: true, label: "ground", friction: 1, collisionFilter: { category: CAT.G, mask: CAT.M } });
  Composite.add(G.world, G.ground);
  buildTree();
  // 1匹でも地面にふれたら終わり（つながったままふれてもアウト）
  Events.on(engine, "collisionStart", (e) => {
    if (G.state !== "play" || GOD) return;
    for (const p of e.pairs) {
      const A = p.bodyA.parent, B = p.bodyB.parent;
      const m = A === G.ground ? B.monkey : B === G.ground ? A.monkey : null;
      if (m && !m.held) { gameOver(m); break; }
    }
  });
  Object.assign(G, {
    monkeys: [], held: null, state: "play", canSpawnAt: now() + 200, simT: 0, firstGrabAt: 0,
    pops: [], rings: [], score: 0, snaps: [], fallPlan: null, fallShot: null, shake: 0, dragging: false, placedSinceHint: 0,
    wind: { w: 0, dir: 1, start: 0, dur: 0, str: 0, next: Infinity, warned: false, phase: 0 }, lastType: null,
  });
  clearInput(); setWindBanner("");
  G.nextType = randType(); updateNext(); updateHud();
  hint.classList.remove("fade");
  document.getElementById("result").hidden = true;
  fitCam(true);
}

// ---------- 進行 ----------
function step() {
  G.simT += 1 / 60;
  stepTree(computeLoads());
  stepWind();
  stepGrip();
  separate();
  if (G.fallPlan && G.simT >= G.fallPlan.at) takeFallShot();
  // たぐり寄せ：つなぎ目を少しずつ縮める
  for (const m of G.monkeys) for (const g of m.grabs) if (g && g.c.length > 0) g.c.length = Math.max(cfg.GRAB.MIN_LEN, g.c.length - cfg.GRAB.PULL_STEP);
  Engine.update(G.engine, 1000 / 60);
  // 暴れ防止の上限
  const C = cfg.GRAB;
  for (const m of G.monkeys) {
    if (m.held) continue;
    const b = m.body;
    if (Math.abs(b.angularVelocity) > C.MAX_SPIN) Body.setAngularVelocity(b, Math.sign(b.angularVelocity) * C.MAX_SPIN);
    if (b.speed > C.MAX_SPEED) Body.setVelocity(b, Vector.mult(b.velocity, C.MAX_SPEED / b.speed));
  }
  if (G.state === "play") autoGrab();
}
function gameOver(m) {
  G.finalCount = groups().onTree;
  G.state = "over"; G.overAt = now(); G.engine.timing.timeScale = cfg.END.SLOW;
  if (G.held) dropHeldSilently();
  G.dragging = false;
  pop(m.body.position.x, m.body.position.y - 50, T.POP_POTO, 40, true);
}

// 右上の札：「スコア ○点」と「群れ ○匹」（木につながっている、いちばん大きな群れ）
function updateHud() {
  document.getElementById("cnt").textContent = G.score;
  document.getElementById("cntSub").textContent = groups().bestOn;
}

document.getElementById("resetBtn").addEventListener("click", init);
document.getElementById("again").addEventListener("click", init);

// ---------- ?debug=1：調整パネルと数値表示 ----------
const dbgInfo = document.getElementById("dbgInfo");
if (DEBUG) {
  const tune = document.getElementById("tune"), tuneBtn = document.getElementById("tuneBtn");
  tuneBtn.hidden = false; dbgInfo.hidden = false;
  const closeTune = () => { tune.hidden = true; tuneBtn.setAttribute("aria-expanded", "false"); };
  tuneBtn.addEventListener("click", () => { tune.hidden = !tune.hidden; tuneBtn.setAttribute("aria-expanded", String(!tune.hidden)); });
  cv.addEventListener("pointerdown", closeTune);
  document.getElementById("nextBox").addEventListener("pointerdown", closeTune);
  for (const el of tune.querySelectorAll("input[type=range]")) {
    const key = el.dataset.key, out = el.parentElement.querySelector("output");
    const show = () => { out.textContent = (+P[key]).toFixed(el.step < 1 ? 1 : 0); };
    el.value = P[key]; show();
    el.addEventListener("input", () => { P[key] = +el.value; show(); });
  }
  // コンソールから試すための入り口
  window.__saru = { G, P, TYPES, step: (n) => { for (let k = 0; k < n; k++) step(); }, release };
}
function updateDebug() {
  const worst = G.monkeys.reduce((a, m) => Math.max(a, m.strain || 0), 0);
  dbgInfo.textContent = `t ${G.simT.toFixed(1)}s  サル ${G.monkeys.length}  最大負担 ${worst.toFixed(2)}\n風 ${G.wind.w.toFixed(3)}  次の風 ${G.wind.next === Infinity ? "-" : (G.wind.next - G.simT).toFixed(1) + "s"}  幹 ${G.tr.U.toFixed(1)}`;
}

// ---------- ループ ----------
let last = now(), acc = 0, hudTimer = 0, lastSnap = 0;
function frame(tn) {
  const dt = Math.min(50, tn - last);
  last = tn;
  if (G.state !== "result") {
    acc += dt;
    while (acc >= 1000 / 60) { step(); acc -= 1000 / 60; }
    if (G.state === "play") {
      if (tn - lastSnap > cfg.END.SNAP_EVERY * 1000) { lastSnap = tn; takeSnap(); }
      if (tn - hudTimer > 200) { hudTimer = tn; updateHud(); if (DEBUG) updateDebug(); }
    } else if (G.state === "over" && tn - G.overAt > cfg.END.RESULT_DELAY * 1000) finish();
  }
  fitCam(false);
  G.shake *= 0.86;
  const sx = (Math.random() - 0.5) * G.shake, sy = (Math.random() - 0.5) * G.shake, v = G.view, d = G.dpr;
  drawScene(ctx, cv.width, cv.height, v.s * d, (v.ox + sx) * d, (v.oy + sy) * d, { fx: true, held: true });
  requestAnimationFrame(frame);
}

// ---------- 起動 ----------
const boot = document.getElementById("boot");
loadMonkeys().then(() => {
  boot.remove();
  init(); resize();
  addEventListener("resize", resize);
  requestAnimationFrame(frame);
}, (err) => {
  console.error(err);
  boot.textContent = T.BOOT_FAIL;
});
