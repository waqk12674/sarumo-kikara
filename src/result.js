// 結果：木にいるサルがいちばん多かった瞬間を撮っておき、結果画像をつくる（SPEC.md §9）
import { G, cfg, T, LANG, COLOR, FONT } from "./state.js";
import { now, fill } from "./util.js";
import { blob, drawScene, PAPER_TILE } from "./render.js";
import { attached, groups } from "./grab.js";
import { setWindBanner } from "./wind.js";
import { play } from "./audio.js";
import { onResult } from "./ranking.js";

const CANOPY = cfg.CAMERA.CANOPY;
const SNAP_W = 738, SNAP_H = 1312;
const WIDE_W = 1200, WIDE_H = 630; // Xでシェアの画像（全面が絵。題字と点数は入れない）
const URL = "https://waqk.jp/sarumo-kikara/" + (LANG === "en" ? "en/" : "");

// サルたちに寄って撮る（サルがいなければ木の上のほう）
function frameShot(members, W = SNAP_W, H = SNAP_H) {
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const m of members) {
    const p = m.body.position, t = m.type;
    x0 = Math.min(x0, p.x - t.w * 0.6 - 8); x1 = Math.max(x1, p.x + t.w * 0.6 + 8);
    y0 = Math.min(y0, p.y - t.h * 0.72); y1 = Math.max(y1, p.y + t.h * 0.55);
  }
  if (!members.length) { x0 = CANOPY.x0; x1 = CANOPY.x1; y0 = CANOPY.y0; y1 = CANOPY.y1; }
  const mx = (x1 - x0) * 0.04; // 余白は少なめにして、サルをできるだけ大きく映す
  x0 -= mx; x1 += mx; y0 -= (y1 - y0) * 0.03;
  let w = x1 - x0, h = Math.max(y1 - y0, 280);
  const ar = W / H;
  if (w / h < ar) w = h * ar; else h = w / ar;
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, s: W / w };
}
// 横長（シェア用）：まわりに仲間がいちばん多いサルたちの真ん中に、サルの背丈が絵の高さの CAMERA.SHARE_UP 割になるまで寄る。
// 全員は入らなくてよい（サルを大きく見せるほうを優先する）
function frameWide(members) {
  if (!members.length) return frameShot(members, WIDE_W, WIDE_H);
  const avgH = (ms) => ms.reduce((a, m) => a + m.type.h, 0) / ms.length;
  const r = 1.5 * avgH(members); // 「近く」の距離＝サルの背丈の1.5倍
  const around = (a) => members.filter((b) => Math.hypot(a.body.position.x - b.body.position.x, a.body.position.y - b.body.position.y) < r);
  let near = [];
  for (const m of members) { const n = around(m); if (n.length > near.length) near = n; }
  // 中心は、その仲間たちの手の先から足の先までの真ん中（胴の真ん中だと、上げた手や頭が切れやすい）
  const fr = frameShot(near, WIDE_W, WIDE_H);
  return { cx: fr.cx, cy: fr.cy, s: cfg.CAMERA.SHARE_UP * WIDE_H / avgH(near) };
}
function renderShot(fr, canvas, W = SNAP_W, H = SNAP_H) {
  canvas.width = W; canvas.height = H;
  // 擬音（サル×k など）はサルにかぶるので描かない
  drawScene(canvas.getContext("2d"), W, H, fr.s, W / 2 - fr.cx * fr.s, H / 2 - fr.cy * fr.s, { fx: false, leaves: false });
}

// 木につながっているサルがいちばん多い瞬間を、全員に寄って撮っておく（同じ数なら新しいほう）。
// あわせて、カードの「落ちる直前のいちばん大きな群れ」のために、直前4秒の群れの大きさを控える
export function takeSnap() {
  const g = groups(), tn = now();
  G.recentGroups.push({ t: tn, size: g.bestOn });
  while (tn - G.recentGroups[0].t > 4000) G.recentGroups.shift();
  if (G.best && g.onTree < G.best.n) return;
  const canvas = G.best ? G.best.canvas : document.createElement("canvas");
  const wide = G.best ? G.best.wide : document.createElement("canvas");
  const members = G.monkeys.filter((x) => !x.held && attached(x));
  renderShot(frameShot(members), canvas);
  renderShot(frameWide(members), wide, WIDE_W, WIDE_H);
  G.best = { canvas, wide, n: g.onTree };
}

// ---------- 結果画面 ----------
let resultText = "", record = null, shareId = null;
export async function finish() {
  G.state = "result"; G.engine.timing.timeScale = 1; setWindBanner("");
  const placed = G.monkeys.filter((m) => !m.held).length;
  if (!G.best) takeSnap();
  const best = { canvas: G.best.canvas, size: Math.max(0, ...G.recentGroups.map((r) => r.size)) };
  const all = Object.values(T).join("") + "0123456789";
  try { await Promise.all([document.fonts.load(`800 64px ${FONT}`, all), document.fonts.load(`700 40px ${FONT}`, all)]); } catch {}
  const card = buildCard(G.finalCount, placed, best);
  resultText = fill(T.SHARE, { score: G.score, best: best.size, left: G.finalCount });
  document.getElementById("cardImg").src = card.toDataURL("image/png");
  document.getElementById("result").hidden = false;
  play("result");
  record = { score: G.score, monkeys: placed, secs: Math.round(G.simT * 10) / 10 };
  shareId = null;
  onResult(record);
}

function outlined(g, text, x, y, lw) {
  g.lineJoin = "round"; g.lineWidth = lw; g.strokeStyle = COLOR.KINARI; g.strokeText(text, x, y);
  g.fillStyle = COLOR.SUMI; g.fillText(text, x, y);
}
// 縦書き（長音は回し、小さい字は右上へ寄せる）
function vtext(g, text, x, y, size, step, lw) {
  g.font = `800 ${size}px ${FONT}`; g.textAlign = "center";
  [...text].forEach((ch, i) => {
    const yy = y + i * step;
    if ("ー".includes(ch)) { g.save(); g.translate(x, yy - size * 0.35); g.rotate(Math.PI / 2); outlined(g, ch, 0, size * 0.35, lw); g.restore(); }
    else if ("ゃゅょっャュョッ".includes(ch)) outlined(g, ch, x + size * 0.12, yy - size * 0.1, lw);
    else outlined(g, ch, x, yy, lw);
  });
}
// 1080×1350：題字、左に縦書きのスコア、右に縦長の絵、落款、ハッシュタグ、和紙の質感
function buildCard(n, total, best) {
  const c = document.createElement("canvas");
  c.width = 1080; c.height = 1350;
  const g = c.getContext("2d");
  const bg = g.createLinearGradient(0, 0, 0, 1350);
  bg.addColorStop(0, "#E8E4D8"); bg.addColorStop(1, "#F1EBDD"); g.fillStyle = bg; g.fillRect(0, 0, 1080, 1350);
  blob(g, 180, 140, 560, "226,206,190", 0.35); blob(g, 960, 1200, 520, "206,218,214", 0.35);
  g.textBaseline = "alphabetic";
  // 題字
  g.font = `800 74px ${FONT}`; g.textAlign = "left";
  // 題字の下に、題字の幅いっぱいの朱の筆の線（左が太く、右へはらう）
  const tw = g.measureText(T.CARD_TITLE).width, ux = 82, uy = 186;
  g.fillStyle = COLOR.SHU;
  g.beginPath();
  g.moveTo(ux, uy - 5);
  g.quadraticCurveTo(ux + tw * 0.5, uy - 9, ux + tw + 6, uy - 2);
  g.quadraticCurveTo(ux + tw * 0.5, uy + 3, ux + 4, uy + 6);
  g.quadraticCurveTo(ux - 4, uy, ux, uy - 5);
  g.fill();
  outlined(g, T.CARD_TITLE, 80, 160, 14);
  // 絵
  const fx = 410, fy = 220, fw = 590, fh = 1050;
  g.drawImage(best.canvas, fx, fy, fw, fh); g.lineWidth = 3; g.strokeStyle = "rgba(90,78,64,.7)"; g.strokeRect(fx, fy, fw, fh);
  g.save(); g.translate(fx + fw - 92, fy + fh - 92); g.rotate(-0.04);
  g.fillStyle = "rgba(181,101,90,.88)"; g.fillRect(0, 0, 66, 66);
  g.fillStyle = "rgba(246,240,226,.95)"; g.font = `800 46px ${FONT}`; g.textAlign = "center"; g.fillText(T.CARD_SEAL, 33, 49); g.restore();
  // 主役：スコア
  if (LANG === "en") { g.textAlign = "center"; g.fillStyle = COLOR.USUZUMI; g.font = `700 50px ${FONT}`; g.fillText(T.CARD_SCORE, 170, 370); } // 英語は横書き
  else vtext(g, T.CARD_SCORE, 335, 300, 52, 58, 10);
  const len = String(G.score).length, sz = len >= 3 ? 140 : len === 2 ? 180 : 200;
  g.textAlign = "center"; g.font = `800 ${sz}px ${FONT}`; outlined(g, String(G.score), 170, 540, 16);
  g.font = `800 64px ${FONT}`; outlined(g, T.CARD_PT, 170, 640, 10);
  g.fillStyle = "rgba(90,78,64,.45)"; g.fillRect(96, 720, 250, 2);
  // 参考：群れと、のこったサル
  g.textAlign = "center"; g.fillStyle = COLOR.USUZUMI; g.font = `700 28px ${FONT}`; g.fillText(T.CARD_BEST1, 220, 790); g.fillText(T.CARD_BEST2, 220, 826);
  g.font = `800 84px ${FONT}`; outlined(g, String(best.size), 190, 930, 12); g.font = `800 40px ${FONT}`; outlined(g, T.CARD_UNIT, 265, 928, 8);
  g.fillStyle = "rgba(90,78,64,.3)"; g.fillRect(120, 980, 200, 2);
  g.fillStyle = COLOR.USUZUMI; g.font = `700 28px ${FONT}`; g.fillText(T.CARD_LEFT, 220, 1040);
  g.font = `800 84px ${FONT}`; outlined(g, String(n), 190, 1140, 12); g.font = `800 40px ${FONT}`; outlined(g, T.CARD_UNIT, 265, 1138, 8);
  g.fillStyle = COLOR.USUZUMI; g.font = `700 24px ${FONT}`; g.fillText(fill(T.CARD_OF, { n: total }), 220, 1184);
  g.fillStyle = COLOR.USUZUMI; g.textAlign = "center"; g.font = `700 28px ${FONT}`; g.fillText(T.CARD_TAG, 540, 1322);
  g.fillStyle = g.createPattern(PAPER_TILE, "repeat"); g.fillRect(0, 0, 1080, 1350);
  return c;
}

// 1200×630：サルがいちばん集まっている所に寄った横長の絵に、和紙の質感を重ねる
function buildShare() {
  const c = document.createElement("canvas");
  c.width = WIDE_W; c.height = WIDE_H;
  const g = c.getContext("2d");
  g.drawImage(G.best.wide, 0, 0);
  g.fillStyle = g.createPattern(PAPER_TILE, "repeat"); g.fillRect(0, 0, WIDE_W, WIDE_H);
  return c;
}
const jpeg = (c, q) => new Promise((ok) => c.toBlob(ok, "image/jpeg", q));

// 結果画像を api/share に送り、共有ページの URL を返す（1回の結果につき1回だけ送る）。送れなければ null
async function uploadShare() {
  if (shareId) return shareId;
  const c = buildShare();
  let img = await jpeg(c, 0.8);
  if (img && img.size > 190 * 1024) img = await jpeg(c, 0.6);
  if (!img) return null;
  const form = new FormData();
  form.append("img", img, "share.jpg");
  for (const k of ["score", "monkeys", "secs"]) form.append(k, String(record[k]));
  form.append("lang", LANG);
  const r = await fetch("api/share", { method: "POST", body: form });
  if (r.status !== 201) return null;
  shareId = (await r.json()).id;
  return shareId;
}

// Xでシェア：ポップアップを止められないよう、押した直後に空のタブを開いてから投稿画面へ移す。
// 画像を送れなかったら（手元・429 など）、ゲームの URL で投稿画面を開く
const shareBtn = document.getElementById("share");
shareBtn.addEventListener("click", async () => {
  if (shareBtn.disabled) return;
  shareBtn.disabled = true;
  const w = window.open("", "_blank");
  let url = URL;
  try { const id = await uploadShare(); if (id) url = `https://waqk.jp/sarumo-kikara/s/${id}`; } catch {}
  const intent = `https://x.com/intent/post?text=${encodeURIComponent(resultText)}&url=${encodeURIComponent(url)}`;
  if (w) { w.opener = null; w.location.href = intent; } else window.open(intent, "_blank", "noopener");
  shareBtn.disabled = false;
});
