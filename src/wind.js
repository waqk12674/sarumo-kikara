// 風：ときどき横から吹く。来る前に札で知らせる（SPEC.md §7）
import { G, cfg, P, T, DT } from "./state.js";
const { Body } = Matter;

const C = cfg.WIND;
const el = document.getElementById("wind");
export function setWindBanner(t) {
  if (t) { el.textContent = t; el.classList.remove("off"); } else el.classList.add("off");
}

export function stepWind() {
  const wind = G.wind;
  wind.phase += wind.w * DT;
  if (P.WIND <= 0 || G.state !== "play") { wind.w *= 0.95; if (G.state !== "play") setWindBanner(""); return; }
  if (!wind.dur && G.simT >= wind.next - C.WARN && !wind.warned) {
    wind.warned = true; wind.dir = G.rand() < 0.5 ? -1 : 1;
    setWindBanner(wind.dir > 0 ? T.WIND_R : T.WIND_L);
  }
  if (!wind.dur && G.simT >= wind.next) {
    wind.start = G.simT; wind.dur = C.DUR_MIN + G.rand() * C.DUR_RAND; wind.str = (C.STR_MIN + G.rand() * C.STR_RAND) * P.WIND;
  }
  if (wind.dur) {
    const t = (G.simT - wind.start) / wind.dur;
    if (t >= 1) { wind.w = 0; wind.dur = 0; wind.warned = false; wind.next = G.simT + C.GAP_MIN + G.rand() * C.GAP_RAND; setWindBanner(""); }
    else wind.w = wind.dir * wind.str * Math.pow(Math.sin(Math.PI * t), 2) * (1 + 0.25 * Math.sin(G.simT * 9));
  }
  if (wind.w) {
    const g = G.engine.gravity;
    for (const m of G.monkeys) { if (m.held) continue; Body.applyForce(m.body, m.body.position, { x: wind.w * m.body.mass * g.scale * g.y, y: 0 }); }
  }
}
