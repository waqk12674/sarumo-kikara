// 描画：淡い水彩と墨（背景・木・サル・擬音・輪・舞う葉・風の筋・和紙）
import { G, P, T, cfg, COLOR, FONT, ink } from "./state.js";
import { rng, now, fill } from "./util.js";
import { BR, GROUND_Y, TRUNK_X, trunkPt, trunkTilt, trunkW, branchPts } from "./tree.js";
import { pointW } from "./monkeys.js";
import { findTarget, fistSeg } from "./grab.js";
import { selection } from "./input.js";

// 和紙のすき目（タイル）
function makePaper() {
  const t = document.createElement("canvas");
  t.width = t.height = 256;
  const g = t.getContext("2d"), r = rng(7);
  for (let i = 0; i < 1400; i++) { g.fillStyle = `rgba(${r() < 0.5 ? "120,104,84" : "255,252,244"},${0.05 + r() * 0.07})`; g.fillRect(r() * 256, r() * 256, 1 + r() * 1.5, 1 + r() * 1.5); }
  g.lineCap = "round";
  for (let i = 0; i < 70; i++) {
    const x = r() * 256, y = r() * 256, l = 8 + r() * 26, a = r() * Math.PI * 2;
    g.strokeStyle = `rgba(130,112,92,${0.05 + r() * 0.06})`; g.lineWidth = 0.6 + r() * 0.6;
    g.beginPath(); g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a + 0.6) * l * 0.5, y + Math.sin(a + 0.6) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  return t;
}
export const PAPER_TILE = makePaper();

// 水彩のにじみ
export function blob(c, x, y, r, rgb, a) {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(0.62, `rgba(${rgb},${a * 0.62})`); g.addColorStop(1, `rgba(${rgb},0)`);
  c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
}

const CLOUDS = (() => { const r = rng(5); return Array.from({ length: 16 }, () => ({ x: -500 + r() * 1420, y: -300 + r() * 2000, r: 90 + r() * 160, a: 0.18 + r() * 0.14 })); })();
function drawBackdrop(c) {
  for (const k of CLOUDS) { blob(c, k.x, k.y, k.r, "252,250,244", k.a); blob(c, k.x + k.r * 0.5, k.y + k.r * 0.15, k.r * 0.7, "226,226,218", k.a * 0.6); }
  const r = rng(11), Gy = GROUND_Y;
  c.fillStyle = "rgba(206,212,196,.75)"; c.beginPath(); c.moveTo(-2400, Gy);
  for (let x = -2400; x <= 2820; x += 30) c.lineTo(x, Gy - 300 - 110 * Math.sin(x / 260) - 50 * Math.sin(x / 91 + 1) - 36 * Math.cos(x / 430));
  c.lineTo(2820, Gy); c.fill();
  c.fillStyle = "rgba(190,199,176,.6)"; c.beginPath(); c.moveTo(-2400, Gy);
  for (let x = -2400; x <= 2820; x += 30) c.lineTo(x, Gy - 140 - 60 * Math.sin(x / 180 + 2) - 26 * Math.sin(x / 63));
  c.lineTo(2820, Gy); c.fill();
  const hz = c.createLinearGradient(0, Gy - 200, 0, Gy - 20);
  hz.addColorStop(0, "rgba(244,240,229,0)"); hz.addColorStop(1, "rgba(244,240,229,.85)");
  c.fillStyle = hz; c.fillRect(-2400, Gy - 200, 5220, 190);
  const gg = c.createLinearGradient(0, Gy - 14, 0, Gy + 160);
  gg.addColorStop(0, "rgba(214,206,174,0)"); gg.addColorStop(0.12, "rgba(214,206,174,1)"); gg.addColorStop(1, "rgba(200,190,156,1)");
  c.fillStyle = gg; c.fillRect(-2400, Gy - 14, 5220, 2400);
  for (let i = 0; i < 22; i++) blob(c, -700 + r() * 1820, Gy + 14 + r() * 50, 40 + r() * 50, "176,166,128", 0.22);
  c.lineCap = "round";
  for (let i = 0; i < 60; i++) {
    const x = -700 + r() * 1820, y = Gy + 4 + r() * 30, h = 7 + r() * 9;
    c.strokeStyle = ink(0.22 + r() * 0.2); c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x - 1, y - h * 0.6, x - 3, y - h); c.moveTo(x + 2, y); c.quadraticCurveTo(x + 3, y - h * 0.5, x + 6, y - h * 0.8); c.stroke();
  }
  c.strokeStyle = ink(0.35); c.lineWidth = 1.6; c.beginPath();
  for (let x = -2400; x < 2820; x += 60) { c.moveTo(x, Gy - 1 + r() * 2); c.lineTo(x + 38 + r() * 16, Gy - 1 + r() * 2); }
  c.stroke();
}

function drawTree(c) {
  const r = rng(23);
  const sway = Math.sin(G.simT * 1.7) * 0.6 + G.wind.w * 14;
  const brPts = BR.map((b, j) => branchPts(j));
  // 葉むら（にじみ）
  const leaves = [];
  brPts.forEach((pts, j) => { const e = pts[pts.length - 1]; leaves.push([e.x + sway * 0.4, e.y, BR[j].t * 2.6]); });
  const tp = trunkPt(1);
  leaves.push([tp.x + sway * 0.5, tp.y, 50], [tp.x - 40 + sway * 0.5, tp.y + 26, 34], [tp.x + 40 + sway * 0.5, tp.y + 20, 34]);
  for (const [x, y, R] of leaves) {
    blob(c, x, y, R * 1.6, "170,186,150", 0.55);
    for (let k = 0; k < 6; k++) blob(c, x + (r() - 0.5) * R * 1.4, y + (r() - 0.5) * R, R * (0.5 + r() * 0.4), "132,152,114", 0.45);
  }
  // 枝：当たり判定と同じ折れ線を、根元から先へ細くなる筆の形で描く（への字の山で折れる）
  brPts.forEach((pts, j) => {
    const b = BR[j];
    let acc = 0;
    const ws = pts.map((p, k) => { if (k) acc += Math.hypot(p.x - pts[k - 1].x, p.y - pts[k - 1].y); return b.t * (1.05 - 0.57 * acc / b.len); });
    const nrm = pts.map((p, k) => {
      const q0 = pts[Math.max(0, k - 1)], q1 = pts[Math.min(pts.length - 1, k + 1)], an = Math.atan2(q1.y - q0.y, q1.x - q0.x);
      return { x: -Math.sin(an), y: Math.cos(an) };
    });
    const side = (sg) => pts.map((p, k) => ({ x: p.x + (sg * nrm[k].x * ws[k]) / 2, y: p.y + (sg * nrm[k].y * ws[k]) / 2 }));
    const outline = [...side(1), ...side(-1).reverse()];
    c.beginPath(); outline.forEach((p, k) => (k ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y))); c.closePath();
    c.fillStyle = "rgba(176,156,128,.95)"; c.fill(); c.strokeStyle = ink(0.8); c.lineWidth = 1.8; c.stroke();
    // 樹皮のすじ：区間ごとに2本
    c.strokeStyle = ink(0.25); c.lineWidth = 1; c.beginPath();
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k], t = pts[k + 1], n = nrm[k];
      for (const u of [0.3, 0.65]) {
        const v = u + 0.12;
        c.moveTo(a.x + (t.x - a.x) * u + n.x * b.t * 0.15, a.y + (t.y - a.y) * u + n.y * b.t * 0.15); c.lineTo(a.x + (t.x - a.x) * v, a.y + (t.y - a.y) * v);
      }
    }
    c.stroke();
  });
  // 幹（しなりに沿って先細り）
  const N = 40, Lf = [], Rt = [];
  for (let k = 0; k <= N; k++) {
    const s = k / N, p = trunkPt(s), ang = trunkTilt(s), w = (trunkW(s) / 2) * (k === 0 ? 1.25 : 1);
    Lf.push({ x: p.x - Math.cos(ang) * w, y: p.y - Math.sin(ang) * w }); Rt.push({ x: p.x + Math.cos(ang) * w, y: p.y + Math.sin(ang) * w });
  }
  c.beginPath(); c.moveTo(Lf[0].x - 8, Lf[0].y + 3); Lf.forEach((p) => c.lineTo(p.x, p.y));
  for (let k = N; k >= 0; k--) c.lineTo(Rt[k].x, Rt[k].y);
  c.lineTo(Rt[0].x + 8, Rt[0].y + 3); c.closePath();
  const tg = c.createLinearGradient(TRUNK_X - 18, 0, TRUNK_X + 18, 0);
  tg.addColorStop(0, "rgba(150,130,104,.96)"); tg.addColorStop(0.55, "rgba(186,168,140,.96)"); tg.addColorStop(1, "rgba(140,120,96,.96)");
  c.fillStyle = tg; c.fill(); c.strokeStyle = ink(0.85); c.lineWidth = 2.4; c.stroke();
  c.lineCap = "round";
  for (let k = 2; k < N - 1; k++) {
    if (r() < 0.35) continue;
    const s = k / N + r() * 0.02, p = trunkPt(s), w = trunkW(s), x = p.x + (r() - 0.5) * w * 0.6;
    c.strokeStyle = ink(0.2 + r() * 0.25); c.lineWidth = 0.9 + r() * 1.2;
    c.beginPath(); c.moveTo(x - w * 0.18, p.y); c.quadraticCurveTo(x, p.y - 6, x + w * 0.15, p.y - 11); c.stroke();
  }
  const b0 = trunkPt(0);
  c.strokeStyle = ink(0.5); c.lineWidth = 1.8; c.beginPath();
  c.moveTo(b0.x - 26, b0.y + 3); c.quadraticCurveTo(b0.x - 42, b0.y + 7, b0.x - 58, b0.y + 5);
  c.moveTo(b0.x + 26, b0.y + 3); c.quadraticCurveTo(b0.x + 40, b0.y + 8, b0.x + 56, b0.y + 6); c.stroke();
  for (const [x, y, R] of leaves) {
    c.fillStyle = ink(0.28);
    for (let k = 0; k < 5; k++) { c.beginPath(); c.ellipse(x + (r() - 0.5) * R * 1.3, y + (r() - 0.5) * R * 0.9, 1.6 + r() * 1.4, 0.9, r() * 3, 0, Math.PI * 2); c.fill(); }
  }
}

// 紅潮用：絵の明るいところ（顔や肌）ほど赤くなる版。選んだときの朱の縁取り用の影絵
function overlay(t, op, color) {
  const cvs = document.createElement("canvas");
  cvs.width = Math.ceil(t.w * 5); cvs.height = Math.ceil(t.h * 5);
  const g = cvs.getContext("2d");
  g.drawImage(t.img, 0, 0, cvs.width, cvs.height);
  g.globalCompositeOperation = op; g.fillStyle = color; g.fillRect(0, 0, cvs.width, cvs.height);
  if (op === "multiply") { g.globalCompositeOperation = "destination-in"; g.drawImage(t.img, 0, 0, cvs.width, cvs.height); }
  return cvs;
}
const tinted = (t) => t.tint || (t.tint = overlay(t, "multiply", "#E8907E"));
const silhouette = (t) => t.sil || (t.sil = overlay(t, "source-in", COLOR.SHU));

function drawMonkey(c, m, glow) {
  const t = m.type, v = m.vis, tn = G.simT;
  const jx = v.shake ? Math.sin(tn * 70) * 0.9 * v.shake : 0;
  c.save(); c.translate(m.body.position.x + jx, m.body.position.y); c.rotate(m.body.angle);
  const ox = -t.c.x - m.shift.x, oy = -t.c.y - m.shift.y;
  if (glow) {
    const r = 2.6 / Math.max(0.35, G.view.s), sil = silhouette(t);
    c.globalAlpha = 0.75 + 0.25 * Math.sin(now() / 120);
    for (let k = 0; k < 8; k++) { const a = (k * Math.PI) / 4; c.drawImage(sil, ox + Math.cos(a) * r, oy + Math.sin(a) * r, t.w, t.h); }
    c.globalAlpha = 1;
  }
  c.drawImage(t.img, ox, oy, t.w, t.h);
  if (v.flush > 0.03) { c.globalAlpha = Math.min(0.9, v.flush); c.drawImage(tinted(t), ox, oy, t.w, t.h); c.globalAlpha = 1; }
  // 焦り汗（漫画ふう）：頭の横に、先を上へ向けて頭の側へ少し傾けたしずくを、間をあけて扇形に並べる。
  // 飛ばさず、その場でぴくぴく揺れる
  if (v.sweat > 0.05) {
    const hx = t.head.x - m.shift.x, hy = t.head.y - m.shift.y + 9 * G.SZ; // head は頭の上寄りなので、こめかみの高さまで下げる
    const side = hx >= 0 ? 1 : -1; // 頭が体の中心より右なら右側に出す
    const n = v.sweat > 0.6 ? 3 : v.sweat > 0.3 ? 2 : 1;
    c.globalAlpha = Math.min(1, v.sweat * 2);
    for (let k = 0; k < n; k++) {
      const a = -0.9 + k * 0.75; // こめかみの上から横・少し下へ（右側の角度。左側は鏡写し）
      const twitch = Math.sin(tn * 9 + k * 1.7) * 1.2 * G.SZ;
      const rr = 19 * G.SZ + twitch;
      const x = hx + side * Math.cos(a) * rr, y = hy + Math.sin(a) * rr;
      drawDrop(c, x, y, (3.8 + v.sweat * 1.2 - k * 0.4) * G.SZ, -side * (0.45 + k * 0.12)); // 先を上へ、頭の側へ傾ける
    }
    c.globalAlpha = 1;
  }
  c.restore();
}
function drawDrop(c, x, y, s, rot) {
  c.save(); c.translate(x, y); c.rotate(rot);
  c.beginPath(); c.moveTo(0, -s * 1.8); c.quadraticCurveTo(s * 1.1, -s * 0.2, s, s * 0.4); c.arc(0, s * 0.4, s, 0, Math.PI); c.quadraticCurveTo(-s * 1.1, -s * 0.2, 0, -s * 1.8); c.closePath();
  c.fillStyle = "rgba(156,201,211,.95)"; c.fill(); c.strokeStyle = ink(0.9); c.lineWidth = 1.3; c.stroke();
  c.fillStyle = "rgba(250,252,250,.9)"; c.beginPath(); c.ellipse(-s * 0.35, s * 0.25, s * 0.22, s * 0.38, 0.3, 0, Math.PI * 2); c.fill(); // ハイライト
  c.restore();
}

// 舞う葉と風の筋（画面座標）
const LEAVES = Array.from({ length: 10 }, (_, i) => { const r = rng(100 + i); return { x: r(), y: r(), s: 5 + r() * 5, v: 0.02 + r() * 0.03, ph: r() * 6, c: ["216,156,134", "226,180,140", "204,145,122", "200,184,140"][i % 4] }; });
const STREAKS = Array.from({ length: 14 }, (_, i) => { const r = rng(300 + i); return { seed: 300 + i, l: 0.07 + r() * 0.13, v: 0.55 + r() * 0.5, o: r() }; });
function drawAir(c, cw, ch, k) {
  const tn = G.simT, wind = G.wind;
  for (const l of LEAVES) {
    const y = (((l.y + tn * l.v) % 1.1) - 0.05) * ch;
    let x = (l.x + 0.04 * Math.sin(tn * 0.7 + l.ph) + tn * 0.008 + wind.phase * 0.9) % 1;
    if (x < 0) x += 1;
    x *= cw;
    c.save(); c.translate(x, y); c.rotate(Math.sin(tn * 1.3 + l.ph) * 1.2 + wind.w * 4); c.scale(1, 0.55 + 0.45 * Math.sin(tn * 2 + l.ph));
    c.fillStyle = `rgba(${l.c},.55)`; c.beginPath(); c.ellipse(0, 0, l.s * k, l.s * 0.55 * k, 0, 0, Math.PI * 2); c.fill(); c.restore();
  }
  const a = Math.min(1, Math.abs(wind.w) / 0.2);
  if (a > 0.02) {
    c.lineCap = "round";
    for (const s of STREAKS) {
      const cyc = s.o + tn * s.v, lap = Math.floor(cyc), r = rng(s.seed * 97 + lap);
      let p = (cyc - lap) * 1.4 - 0.2;
      if (wind.dir < 0) p = 1 - p;
      const x = p * cw, y = (0.08 + r() * 0.84) * ch, len = s.l * cw * (0.7 + r() * 0.6), d = wind.dir;
      const g = c.createLinearGradient(x - (len / 2) * d, 0, x + (len / 2) * d, 0);
      g.addColorStop(0, ink(0)); g.addColorStop(0.6, ink(0.38 * a)); g.addColorStop(1, ink(0));
      c.strokeStyle = g; c.lineWidth = (1 + r() * 1.2) * k;
      c.beginPath(); c.moveTo(x - (len / 2) * d, y + 3 * k); c.quadraticCurveTo(x, y - 5 * k, x + (len / 2) * d, y); c.stroke();
    }
  }
}

// 場面を描く。opt.fx：画面用（選択・つかめる範囲・輪・紙吹雪・擬音・光り）。結果画像の撮影では fx なし
export function drawScene(c, cw, ch, s, ox, oy, opt) {
  c.setTransform(1, 0, 0, 1, 0, 0);
  const sky = c.createLinearGradient(0, 0, 0, ch);
  sky.addColorStop(0, "#E7E5DA"); sky.addColorStop(0.55, "#F2EDE1"); sky.addColorStop(1, "#EFE8D8");
  c.fillStyle = sky; c.fillRect(0, 0, cw, ch);
  blob(c, cw * 0.18, ch * 0.12, cw * 0.5, "226,206,190", 0.35);
  blob(c, cw * 0.85, ch * 0.3, cw * 0.45, "206,218,214", 0.35);
  c.setTransform(s, 0, 0, s, ox, oy);
  c.lineCap = "round"; c.lineJoin = "round";
  drawBackdrop(c);
  drawTree(c);
  const sl = opt.fx ? selection() : null, sm = sl && sl.m;
  for (const m of G.monkeys) { if ((m.held && !opt.held) || m === sm) continue; drawMonkey(c, m, false); }
  if (sm) {
    drawMonkey(c, sm, true);
    if (sl.n > 1) {
      const u = 1 / Math.max(0.35, G.view.s), p = sm.body.position;
      c.save(); c.translate(p.x, p.y - sm.type.h * 0.62 - 10 * u); c.scale(u, u);
      const label = fill(T.PICK_NEXT, { i: sl.i + 1, n: sl.n });
      c.font = `700 13px ${FONT}`; c.textAlign = "center"; c.textBaseline = "middle";
      const w = c.measureText(label).width + 18;
      c.fillStyle = "rgba(246,240,226,.95)"; c.strokeStyle = "rgba(181,101,90,.9)"; c.lineWidth = 1.5;
      c.beginPath(); c.roundRect ? c.roundRect(-w / 2, -12, w, 24, 12) : c.rect(-w / 2, -12, w, 24); c.fill(); c.stroke();
      c.fillStyle = COLOR.SUMI; c.fillText(label, 0, 1); c.restore();
    }
  }
  if (opt.fx) drawFx(c);
  c.setTransform(1, 0, 0, 1, 0, 0);
  if (opt.leaves !== false) drawAir(c, cw, ch, Math.max(1, cw / 700));
  c.fillStyle = c.createPattern(PAPER_TILE, "repeat"); c.fillRect(0, 0, cw, ch);
  // 深い鎖ボーナスで、画面が一瞬白く光る
  if (opt.fx && G.flash) {
    const a = (now() - G.flash.t) / 280;
    if (a >= 1) G.flash = null;
    else { c.fillStyle = `rgba(250,246,236,${G.flash.a * (1 - a)})`; c.fillRect(0, 0, cw, ch); }
  }
}

// 運んでいるサルの、つかめる範囲とつかむ先
function drawFx(c) {
  const u = 1 / Math.max(0.35, G.view.s), m = G.held;
  if (m && G.state === "play") {
    m.type.points.forEach((pt, i) => {
      if (!pt.grab || m.grabs[i] || m.hangBy[i]) return;
      // つかめる範囲：こぶしの線分のまわり（縦長のカプセル）
      const hp = pointW(m, i), t = findTarget(m, i, P.RANGE), s = fistSeg(m, i), ang = Math.atan2(s.b.y - s.a.y, s.b.x - s.a.x);
      c.beginPath(); c.arc(s.a.x, s.a.y, P.RANGE, ang + Math.PI / 2, ang - Math.PI / 2); c.arc(s.b.x, s.b.y, P.RANGE, ang - Math.PI / 2, ang + Math.PI / 2); c.closePath();
      if (t) {
        c.fillStyle = "rgba(181,101,90,.22)"; c.fill(); c.strokeStyle = "rgba(181,101,90,.9)"; c.lineWidth = 1.6 * u; c.stroke();
        // つかむ先への線と点は、濃い朱でくっきり見せる
        c.beginPath(); c.moveTo(hp.x, hp.y); c.lineTo(t.point.x, t.point.y); c.strokeStyle = "#8E3B30"; c.lineWidth = 3.2 * u; c.stroke();
        c.beginPath(); c.arc(t.point.x, t.point.y, 4 * u, 0, Math.PI * 2); c.fillStyle = "#8E3B30"; c.fill();
      } else { c.setLineDash([2 * u, 4 * u]); c.strokeStyle = ink(0.45); c.lineWidth = 1.2 * u; c.stroke(); c.setLineDash([]); }
    });
  }
  drawRings(c, u);
  drawSparks(c, u);
  drawPops(c, u);
}
// 鎖ボーナスの朱の輪と筆のはね
function drawRings(c, u) {
  const tn = now();
  G.rings = G.rings.filter((r) => tn - r.t < 750);
  for (const r of G.rings) {
    if (tn < r.t) continue; // 重ねる輪は少し遅れて広がる
    const a = (tn - r.t) / 750, e = 1 - Math.pow(1 - a, 3), R = (18 + 60 * e + Math.min(r.k, 12) * cfg.COMBO.RING_GROW) * u;
    c.save(); c.globalAlpha = 1 - a;
    c.strokeStyle = COLOR.SHU; c.lineWidth = (6 + Math.min(r.k, 10) * 0.5) * (1 - a * 0.7) * u;
    c.beginPath(); c.arc(r.x, r.y, R, 0, Math.PI * 2); c.stroke();
    c.lineCap = "round"; c.lineWidth = (4 - 2.5 * a) * u;
    const n = 8 + Math.min(r.k, 6) * 2;
    for (let k = 0; k < n; k++) {
      const an = (k / n) * Math.PI * 2 + r.k;
      c.beginPath(); c.moveTo(r.x + Math.cos(an) * R * 1.1, r.y + Math.sin(an) * R * 1.1); c.lineTo(r.x + Math.cos(an) * R * 1.45, r.y + Math.sin(an) * R * 1.45); c.stroke();
    }
    c.restore();
  }
}
// 鎖ボーナスの紙吹雪（朱・黄土・墨・肌色の紙片が飛び散って落ちる。くるくる裏返る）
function drawSparks(c, u) {
  const tn = now();
  G.sparks = G.sparks.filter((s) => tn - s.t < s.life);
  for (const s of G.sparks) {
    const el = (tn - s.t) / 1000;
    if (el < 0) continue;
    const a = (tn - s.t) / s.life;
    const x = s.x + Math.cos(s.a) * s.v * el * u, y = s.y + (Math.sin(s.a) * s.v * el + 150 * el * el) * u; // 速さ・重力は画面のピクセルで
    c.save(); c.globalAlpha = 1 - a * a; c.translate(x, y); c.rotate(s.ph + el * 7); c.scale(1, Math.cos(s.ph + el * 12));
    c.fillStyle = `rgb(${s.c})`; c.fillRect((-s.sz / 2) * u, (-s.sz * 0.3) * u, s.sz * u, s.sz * 0.6 * u);
    c.restore();
  }
}
// 擬音：明朝の太字＋生成りのふち
function drawPops(c, u) {
  const tn = now();
  G.pops = G.pops.filter((p) => tn - p.t < p.life);
  for (const p of G.pops) {
    const a = (tn - p.t) / p.life;
    c.save(); c.globalAlpha = a > 0.65 ? 1 - (a - 0.65) / 0.35 : 1;
    const sc = (p.big ? 1 + 0.45 * Math.max(0, 1 - a * 5) : 1) * u;
    c.translate(p.x, p.y - 24 * a * u); c.scale(sc, sc); c.rotate(p.big ? -0.06 : 0);
    c.font = `800 ${p.size}px ${FONT}`; c.textAlign = "center"; c.textBaseline = "middle";
    c.lineJoin = "round"; c.lineWidth = p.size * 0.26; c.strokeStyle = COLOR.KINARI; c.strokeText(p.text, 0, 0);
    c.fillStyle = p.color || COLOR.SUMI; c.fillText(p.text, 0, 0);
    c.restore();
  }
}
