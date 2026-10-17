// 共有の状態と設定。各モジュールはここを読み書きする
import { CONFIG } from "./config.js";
import { DEFAULTS } from "./defaults.js";
import { validateConfig, rng, now } from "./util.js";

export const cfg = validateConfig(CONFIG, DEFAULTS);
export const P = cfg.PLAY;      // 遊びの調整値（?debug=1 のパネルで書き換わる）
export const T = cfg.TEXT.ja;   // /sarumo-kikara/ は常に日本語（英語版は /sarumo-kikara/en/ で後から作る）
export const DT = 1 / 60;       // 物理の1ステップ（秒）
export const CAT = { G: 1, T: 2, M: 4 }; // ぶつかり判定の種類：地面・木・サル

// ---- URL パラメータ ----
const q = new URLSearchParams(location.search);
export const DEBUG = q.get("debug") === "1";
export const GOD = q.get("god") === "1";
export const TREE_SET = q.get("tree"); // 枝の形を TREE.BRANCH_SETS のものに切り替える（比べるため）
const SEED = q.has("seed") ? Number(q.get("seed")) >>> 0 : null;
let runs = 0;
export const newRand = () => (SEED === null ? Math.random : rng(SEED + runs++));

export const COLOR = { SUMI: "#3D3833", KINARI: "#F6F0E2", SHU: "#B5655A", USUZUMI: "#7A7068" };
export const FONT = '"Shippori Mincho B1","Hiragino Mincho ProN","Yu Mincho",serif';
export const ink = (a) => `rgba(61,54,48,${a})`;

// 1回のプレイの状態（main.js の init() で作り直す）
export const G = {
  rand: Math.random,
  engine: null, world: null, ground: null,
  pieces: [],                         // 木の当たり判定（幹16分割と枝）
  tr: { U: 0, Uv: 0, d: [], dv: [] }, // 幹のしなり（てっぺんの横ずれ）と、枝ごとのしなり角
  M0: 1,                              // 基準の重さ（大きさ1倍のニホンザル）
  SZ: 1,                              // いまのサルの大きさ倍率
  monkeys: [], held: null,
  state: "play",                      // play → over（スロー）→ result
  simT: 0, overAt: 0, canSpawnAt: 0, firstGrabAt: 0,
  nextType: null, lastType: null,
  score: 0, finalCount: 0,
  wind: { w: 0, dir: 1, start: 0, dur: 0, str: 0, next: Infinity, warned: false, phase: 0 },
  dragging: false, paused: false, // paused：遊び方・ランキングを開いているあいだ止める
  pops: [], rings: [], sparks: [], flash: null, shake: 0,
  best: null, recentGroups: [], // 結果画像の候補（サルがいちばん多い瞬間）と、直前4秒の群れの大きさ
  view: { s: 1, ox: 0, oy: 0 }, dpr: 1,
};

// 擬音を出す（ひょい・ずるっ…）
export function pop(x, y, text, size, big, color) {
  G.pops.push({ x, y, text, size, big, color, t: now(), life: big ? 1100 : 850 });
}
