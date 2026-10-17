// 小さな便利関数
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const now = () => performance.now();

// 線分 a-b 上で p にいちばん近い点
export function closest(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy), 0, 1);
  return { x: a.x + dx * t, y: a.y + dy * t };
}

// 種から決まる乱数（0〜1）
export function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// "{k}" を差しこむ
export const fill = (s, o) => s.replace(/\{(\w+)\}/g, (_, k) => o[k]);

// config の値を既定値と照らし、不正な値は既定値に戻す（石の上にも三年と同じ）
export function validateConfig(cfg, def, path = "CONFIG") {
  for (const k in def) {
    const d = def[k], v = cfg[k], p = `${path}.${k}`;
    if (d && typeof d === "object") {
      if (!v || typeof v !== "object" || Array.isArray(v) !== Array.isArray(d)) {
        console.warn(`[config] ${p} が不正なため既定値を使います`, v);
        cfg[k] = structuredClone(d);
      } else if (Array.isArray(d) && d.length && typeof d[0] === "object") {
        v.forEach((e, i) => validateConfig(e, d[Math.min(i, d.length - 1)], `${p}[${i}]`));
      } else if (!Array.isArray(d)) {
        validateConfig(v, d, p);
      }
    } else if (typeof v !== typeof d || (typeof d === "number" && !Number.isFinite(v))) {
      console.warn(`[config] ${p} が不正なため既定値 ${JSON.stringify(d)} を使います`, v);
      cfg[k] = d;
    }
  }
  return cfg;
}
