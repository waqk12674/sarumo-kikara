// 音：起動時に assets/audio の WAV を1回だけ読み、AudioBufferSourceNode で鳴らす。ファイルが無ければ無音
import { cfg, T } from "./state.js";

const A = cfg.AUDIO;
const buffers = {};
const last = {};
let ctx = null, master = null, ambient = null, muted = false;
try { muted = localStorage.getItem("skk_muted") === "1"; } catch {}

export function loadSounds() {
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.connect(ctx.destination);
    applyMute();
  } catch { return; }
  for (const [name, file] of Object.entries(A.FILES)) {
    fetch(`assets/audio/${file}.wav`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
      .then((b) => ctx.decodeAudioData(b))
      .then((buf) => { buffers[name] = buf; if (name === "ambient") startAmbient(); })
      .catch(() => {});
  }
  // iOS などは、最初に画面を押したときでないと音が出ない
  addEventListener("pointerdown", () => { if (ctx.state !== "running") ctx.resume().then(startAmbient, () => {}); }, true);
}

// name：AUDIO.FILES の用途名。rate で音の高さを変える
export function play(name, rate = 1) {
  const buf = buffers[name];
  if (!buf || ctx.state !== "running") return;
  const t = ctx.currentTime;
  if (t - (last[name] ?? -1) < 0.04) return; // 同じ音が同時にたくさん重ならないように
  last[name] = t;
  const src = ctx.createBufferSource(), gain = ctx.createGain();
  src.buffer = buf; src.playbackRate.value = rate;
  gain.gain.value = A.VOLUME[name] ?? 1;
  src.connect(gain).connect(master);
  src.start();
}

// 環境音（葉ずれと鳥）をループで流しつづける
function startAmbient() {
  if (ambient || !buffers.ambient || ctx.state !== "running") return;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(A.VOLUME.ambient ?? 1, ctx.currentTime + 2);
  ambient = ctx.createBufferSource();
  ambient.buffer = buffers.ambient; ambient.loop = true;
  ambient.connect(gain).connect(master);
  ambient.start();
}

// ---------- ミュート ----------
const btn = document.getElementById("muteBtn");
function applyMute() {
  if (master) master.gain.value = muted ? 0 : A.MASTER;
  btn.textContent = muted ? T.SOUND_OFF : T.SOUND_ON;
  btn.setAttribute("aria-pressed", String(muted));
}
btn.addEventListener("click", () => {
  muted = !muted;
  try { localStorage.setItem("skk_muted", muted ? "1" : "0"); } catch {}
  applyMute();
});
applyMute();
