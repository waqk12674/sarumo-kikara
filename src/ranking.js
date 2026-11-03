// ランキング：worker/index.js の api/scores を呼ぶのは、ページを開いて最初にランキングを開くとき（結果画面の「ランキング」か画面下の札）と、登録したときだけ
// 結果画面は「ランキング」でカードの中に開く（2026-11-03 運営者。corn・linesman と同じ）。表は TOP100 で、表の中だけスクロールし、自分の行まで表の中で自動スクロールする
// 2回目からは取得済みのものを使い回し、登録したら返ってきた最新のものに置き換える。取得済みのものは dayStart（日本時間0時）から
// 24時間たったら取り直す（0時をまたいでデイリーが古いままにならないように）
// （API は Worker が動くので、呼ぶたびに Workers のリクエストに数える。結果画面のたびに取得すると、何回も遊ばれたときに Worker が PV の何倍も動く。2026-10-24 運営者。ポーリングしない）
import { G, T } from "./state.js";
import { fill } from "./util.js";

const API = "api/scores";
const $ = (id) => document.getElementById(id);

// 端末ごとの匿名ID（同じ人の記録をまとめる）とニックネーム
function player() {
  let id = null;
  try { id = localStorage.getItem("skk_player"); } catch {}
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
    try { localStorage.setItem("skk_player", id); } catch {}
  }
  return id;
}
const savedName = () => { try { return localStorage.getItem("skk_name") || ""; } catch { return ""; } };

async function call(opts) {
  const r = await fetch(opts ? API : `${API}?player=${encodeURIComponent(player())}`, opts);
  // 手元の python -m http.server では api がないので 404（HTML）が返る
  if (!(r.headers.get("content-type") || "").includes("json")) throw new Error("offline");
  return { status: r.status, data: await r.json() };
}

// TOP100 を ol に描く（自分の記録は色を変える）
function render(list, top) {
  list.textContent = "";
  if (!top.length) { const li = document.createElement("li"); li.className = "empty"; li.textContent = T.RANK_EMPTY; list.append(li); return; }
  for (const r of top) {
    const li = document.createElement("li");
    if (r.me) li.className = "me";
    const n = document.createElement("span"), s = document.createElement("b");
    n.textContent = r.name; s.textContent = fill(T.RANK_POINTS, { score: r.score });
    li.append(n, s); list.append(li);
  }
}

// 歴代（all）／デイリー（daily）のタブ。1回の取得で両方届くので、切り替えでは API を呼ばない
const card = { list: $("rankList"), msg: $("rankMsg"), tabs: $("rankTabs"), tab: "all", data: null };
const dlgView = { list: $("rankDlgList"), msg: $("rankDlgMsg"), tabs: $("rankDlgTabs"), tab: "all", data: null };
function setTab(v, tab) {
  v.tab = tab;
  for (const b of v.tabs.children) b.setAttribute("aria-pressed", String(b.dataset.tab === tab));
}
// そのタブの一覧と、自分の順位（デイリーは今日の記録だけで数えた順位）
function show(v) {
  render(v.list, v.data[v.tab]);
  const m = v.data.mine && v.data.mine[v.tab];
  v.msg.textContent = m ? fill(v.tab === "daily" ? T.RANK_MINE_DAY : T.RANK_MINE, m) : ""; v.msg.hidden = !m;
  if (v === card) fitGap();
  toMe(v.list);
}
// 自分の行を表の真ん中あたりへ（表の中だけを動かす。scrollIntoView はカードやページまで動かすので使わない）
function toMe(list) {
  const me = list.querySelector(".me");
  list.scrollTop = me ? me.offsetTop - (list.clientHeight - me.offsetHeight) / 2 : 0;
}
// 帯（html.adOn。src/result.js の showBanner）があるとき、結果画面は帯の下端から --adGap（150px）下に始まる。
// 帯を出したときとランキングを開け閉めしたときに、押せる部品と表の上端を帯の下端から 150px 以上に保ったまま、その上の結果画像の分だけ --adGap を縮めてカードを上へ伸ばす。
// それでも入らない画面は 150px のまま（カードの中をスクロール。カードの上端が帯から150px より下なので、押せる部品は近づかない）
export function fitGap() {
  const band = $("adTop"), root = document.documentElement, el = $("result").querySelector(".card");
  if (!band || !root.classList.contains("adOn")) return;
  root.style.setProperty("--adGap", "150px"); el.scrollTop = 0;
  const first = [...el.querySelectorAll("button, input, a, ol")].find((e) => e.getClientRects().length);
  // 150px のとき first は帯から (150 + off) の所にある。--adGap を (150 − off) にすると、カードが画面いっぱいなら first はちょうど 150px になる（いっぱいでなければ中央寄せで半分しか上がらず、もっと離れる）
  root.style.setProperty("--adGap", Math.max(16, 300 - (first.getBoundingClientRect().top - band.getBoundingClientRect().bottom)) + "px");
  if (el.scrollHeight > el.clientHeight) root.style.setProperty("--adGap", "150px");
}
for (const v of [card, dlgView]) {
  v.tabs.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-tab]");
    if (!b) return;
    setTab(v, b.dataset.tab);
    if (v.data) show(v);
  });
}

// 取得済みのランキング。読めなかったときは残さず、次に開いたときにもう一度取得する。
// 広告の帯を出したページの「もう一度」は読み直しなので、sessionStorage の skk_board に持ち越す（取り直すかは fresh で決める）
let board = null;
try { board = JSON.parse(sessionStorage.getItem("skk_board")); } catch {}
const keep = (d) => { board = d; try { sessionStorage.setItem("skk_board", JSON.stringify(d)); } catch {} return d; };
const fresh = (d) => d && Date.now() < d.dayStart + 864e5;
async function load(v) {
  setTab(v, "all"); v.data = null; // 開くたびに歴代から
  if (fresh(board)) { v.data = board; show(v); return; }
  v.msg.textContent = T.RANK_LOADING; v.msg.hidden = false; v.list.textContent = "";
  try {
    v.data = keep((await call()).data);
    show(v);
  } catch (e) {
    v.msg.textContent = e.message === "offline" ? T.RANK_OFFLINE : T.RANK_ERROR;
  }
}

// ---------- 結果画面 ----------
let result = null; // { score, monkeys, secs }
export function onResult(r) {
  result = r;
  $("rankName").value = savedName();
  $("rankReg").hidden = !(r.score > 0); // 0点は登録しない
  $("rankSend").disabled = false;
  // 結果画面を出すたびに閉じた状態から。ここでは API を呼ばない（「ランキング」を押したときに load）
  card.data = null; $("rankMsg").hidden = true;
  $("rankBox").hidden = true; $("rankToggle").setAttribute("aria-expanded", "false");
  fitGap();
}
$("rankToggle").addEventListener("click", () => {
  const box = $("rankBox");
  box.hidden = !box.hidden;
  $("rankToggle").setAttribute("aria-expanded", String(!box.hidden));
  if (box.hidden || !card.data) fitGap();
  if (!box.hidden) { if (card.data) show(card); else load(card); }
});
$("rankSend").addEventListener("click", async () => {
  const name = $("rankName").value.trim(), msg = $("rankMsg");
  if (!name) { msg.textContent = T.RANK_NAME; msg.hidden = false; $("rankName").focus(); return; }
  $("rankSend").disabled = true; msg.textContent = T.RANK_SENDING; msg.hidden = false;
  try {
    const { status, data } = await call({ method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ player: player(), name, ...result }) });
    if (status === 429) { msg.textContent = T.RANK_BUSY; $("rankSend").disabled = false; return; }
    // 登録できない名前：記録はそのまま、名前を直して登録し直せる
    if (status === 400 && data.error === "ng_name") { msg.textContent = T.RANK_NG; $("rankSend").disabled = false; $("rankName").focus(); return; }
    if (status !== 200) { msg.textContent = T.RANK_FAIL; return; }
    try { localStorage.setItem("skk_name", name); } catch {} // 登録できた名前だけ、次回の入力欄に入れる
    $("rankReg").hidden = true; // 先に隠してから描く（fitGap が登録の欄の分まで入れて測らないように）
    card.data = keep(data); show(card);
    msg.textContent = fill(T.RANK_DONE, data.mine.all);
  } catch (e) {
    msg.textContent = e.message === "offline" ? T.RANK_OFFLINE : T.RANK_FAIL;
    $("rankSend").disabled = false;
  }
});

// ---------- 画面の下の「ランキング」：開いているあいだはゲームを止める ----------
const dlg = $("rankDialog");
$("rankBtn").addEventListener("click", () => {
  G.paused = true;
  dlg.showModal();
  load(dlgView);
});
$("rankClose").addEventListener("click", () => dlg.close());
dlg.addEventListener("close", () => { G.paused = $("howto").open; }); // 遊び方から開いたときは、遊び方に戻るまで止めたまま
