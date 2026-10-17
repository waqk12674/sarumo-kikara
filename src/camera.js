// カメラ：最初は木の上のほうだけ。鎖がのびたら、全体が入るまで引いていく（SPEC.md §8）
import { G, cfg } from "./state.js";
import { clamp } from "./util.js";
import { GROUND_Y } from "./tree.js";

const C = cfg.CAMERA, CANOPY = C.CANOPY;
const cv = document.getElementById("cv"), hud = document.getElementById("hud");
let frame0 = { top: 0, avail: 600 };
const cam = { s: 0, cx: 0, cy: 0 };

// 映したい範囲：木の上のほう＋木につながったサル全員
export function contentBox(includeHeld, margin) {
  let x0 = CANOPY.x0 + G.tr.U, x1 = CANOPY.x1 + G.tr.U, y0 = CANOPY.y0, y1 = CANOPY.y1;
  for (const m of G.monkeys) {
    if (m.held && !includeHeld) continue;
    const p = m.body.position;
    if (p.y > GROUND_Y + 200) continue;
    x0 = Math.min(x0, p.x - 62 * G.SZ); x1 = Math.max(x1, p.x + 62 * G.SZ);
    y0 = Math.min(y0, p.y - 90 * G.SZ); y1 = Math.max(y1, p.y + C.ROOM_BELOW * G.SZ);
  }
  if (y1 > GROUND_Y - C.GROUND_SHOW) y1 = GROUND_Y + 70;
  const mx = (x1 - x0) * margin, my = (y1 - y0) * margin;
  return { x0: x0 - mx, x1: x1 + mx, y0: y0 - my, y1: y1 + my };
}

export function resize() {
  G.dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = innerWidth, h = innerHeight;
  cv.width = Math.round(w * G.dpr); cv.height = Math.round(h * G.dpr);
  const top = hud.getBoundingClientRect().bottom + 2, bottom = 52;
  document.documentElement.style.setProperty("--hud-h", top - 2 + "px");
  frame0 = { top, avail: Math.max(200, h - top - bottom) };
  fitCam(true);
}

export function fitCam(snap) {
  const b = contentBox(false, 0.02);
  const ts = Math.min(innerWidth / (b.x1 - b.x0), frame0.avail / (b.y1 - b.y0));
  const tcx = (b.x0 + b.x1) / 2, tcy = (b.y0 + b.y1) / 2;
  if (snap || !cam.s) { cam.s = ts; cam.cx = tcx; cam.cy = tcy; }
  else {
    const k = G.dragging ? C.FOLLOW_DRAG : C.FOLLOW;
    cam.s += (ts - cam.s) * k; cam.cx += (tcx - cam.cx) * k; cam.cy += (tcy - cam.cy) * k;
  }
  G.view = { s: cam.s, ox: innerWidth / 2 - cam.cx * cam.s, oy: frame0.top + frame0.avail / 2 - cam.cy * cam.s };
}

export function visibleBox() {
  const v = G.view;
  return { x0: -v.ox / v.s, x1: (innerWidth - v.ox) / v.s, y0: (frame0.top - v.oy) / v.s, y1: (frame0.top + frame0.avail - v.oy) / v.s };
}
export const toWorld = (e) => ({ x: (e.clientX - G.view.ox) / G.view.s, y: (e.clientY - G.view.oy) / G.view.s });
// 運べる範囲は今映っている範囲の中だけ
export function clampHeld(p) {
  const b = visibleBox();
  return { x: clamp(p.x, b.x0 + 30, b.x1 - 30), y: clamp(p.y, b.y0 + 60, Math.min(b.y1 - 40, GROUND_Y - 80)) };
}
