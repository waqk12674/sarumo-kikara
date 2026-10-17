// 重さ・握力・疲れ（SPEC.md §6）
import { G, cfg, P, DT } from "./state.js";
import { clamp, dist } from "./util.js";
import { pointW } from "./monkeys.js";
import { release, grabWorld } from "./grab.js";

const C = cfg.GRIP;

// サルごとに「自分の重さ＋ぶら下がっている仲間の重さ」を、つかんでいる点の数で割って各点にかける。
// 戻り値は、木をつかんでいる手ごとの {g, p, lx, ly}（木のしなりに使う）
export function computeLoads() {
  const memo = new Map(), stack = new Set();
  const own = (m) => { const k = m.body.mass / G.M0; return { x: G.wind.w * k * C.WIND_X, y: k }; };
  function carried(m) {
    if (memo.has(m)) return memo.get(m);
    if (stack.has(m)) return { x: 0, y: 0 };
    stack.add(m);
    const v = own(m);
    for (const h of m.hangBy) {
      if (!h) continue;
      const c = h.mon, n = c.grabs.filter(Boolean).length || 1, cv = carried(c);
      v.x += cv.x / n; v.y += cv.y / n;
    }
    stack.delete(m); memo.set(m, v);
    return v;
  }
  const treeLoads = [];
  for (const m of G.monkeys) {
    if (m.held) continue;
    const n = m.grabs.filter(Boolean).length;
    if (!n) continue;
    const v = carried(m), dyn = 1 + C.SWAY * Math.min(m.body.speed, C.SWAY_MAX);
    m.ratio = v.y / (m.body.mass / G.M0); // 自分の体重の何倍を支えているか
    m.grabs.forEach((g, i) => {
      if (!g) return;
      const lx = v.x / n, ly = v.y / n;
      g.load = Math.hypot(lx, ly) * dyn;
      if (g.kind === "tree") treeLoads.push({ g, p: pointW(m, i), lx, ly });
    });
  }
  return treeLoads;
}

// 握力：負担が限界をこえると体力がへり、尽きたら手をはなす。汗・紅潮・震えの値もここで決める
export function stepGrip() {
  const play = G.state === "play";
  for (const m of G.monkeys) {
    if (m.held) { m.strain = 0; continue; }
    let worst = 0, minSt = 1, count = 0;
    m.grabs.forEach((g, i) => {
      if (!g) { m.stam[i] = Math.min(1, m.stam[i] + C.FREE_RECOVER * DT); return; }
      count++;
      const pt = m.type.points[i];
      const S = P.GRIP * (m.body.mass / G.M0) * (pt.kind === "tail" ? C.TAIL : 1) / (1 + m.fatigue);
      let steep = 1;
      if (g.kind === "tree") {
        if (g.piece.kind === "branch") steep = 1 + C.STEEP_K * Math.max(0, Math.abs(Math.sin(g.piece.body.angle)) - C.STEEP_FROM);
        else steep = C.TRUNK_STEEP;
      }
      g.strain = (g.load || 0) * steep / S;
      if (g.strain > 1) g.stamina -= (C.DRAIN + (g.strain - 1) * C.DRAIN_K) * DT;
      else if (g.strain < C.RECOVER_BELOW) g.stamina = Math.min(1, g.stamina + C.RECOVER * DT);
      worst = Math.max(worst, g.strain); minSt = Math.min(minSt, g.stamina);
    });
    m.strain = worst;
    // 疲れ：ぶら下がっているだけで少しずつ、重いものを支えるほど速くたまる。置きなおしても戻らない
    if (count && play) m.fatigue += (C.FATIGUE_BASE + C.FATIGUE_LOAD * Math.max(0, (m.ratio || 1) - 1)) * P.FATIGUE * DT;
    if (count && play) {
      m.grabs.forEach((g, i) => {
        if (!g) return;
        const torn = G.simT - g.at > cfg.GRAB.TEAR_AFTER && dist(pointW(m, i), grabWorld(m, i)) > cfg.GRAB.TEAR * G.SZ;
        if (g.stamina <= 0 || g.strain > C.LIMIT || torn) { release(m, i); m.lastLetGo = G.simT; }
      });
    }
    const v = m.vis;
    const tSweat = count ? clamp((worst - C.SWEAT_FROM) / 0.4, 0, 1) : v.sweat * 0.98;
    const tFlush = count ? clamp(Math.max((worst - C.FLUSH_FROM) / 0.35, (1 - minSt) * 1.2), 0, 1) : v.flush * 0.97;
    v.sweat += (tSweat - v.sweat) * 0.08; v.flush += (tFlush - v.flush) * 0.06;
    v.shake = count && worst > 1 ? Math.min(1, (worst - 1) * 2 + 0.3) : 0;
  }
}
