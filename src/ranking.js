// ランキング：worker/index.js の api/scores を呼ぶのは、ページを開いて最初にランキングを出すとき（結果画面か画面下の札）と、登録したときだけ
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

// TOP20 を ol に描く（自分の記録は色を変える）
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
  return load(card); // 読み込みを待ってから広告の帯の大きさを決める（一覧が入るとカードの位置が動くため。result.js の showBanner）
}
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
    card.data = keep(data); show(card);
    msg.textContent = fill(T.RANK_DONE, data.mine.all);
    $("rankReg").hidden = true;
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
