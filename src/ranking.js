// ランキング：worker/index.js の api/scores を、結果画面を開いたとき・登録したとき・ランキングを開いたときだけ呼ぶ
// （API は Worker が動くので、呼ぶたびに Workers のリクエストに数える。ポーリングしない）
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

// TOP10 を ol に描く（自分の記録は色を変える）
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
const mineText = (m) => (m ? fill(T.RANK_MINE, m) : "");

async function load(list, msg) {
  msg.textContent = T.RANK_LOADING; msg.hidden = false; list.textContent = "";
  try {
    const { data } = await call();
    render(list, data.top);
    msg.textContent = mineText(data.mine); msg.hidden = !data.mine;
  } catch (e) {
    msg.textContent = e.message === "offline" ? T.RANK_OFFLINE : T.RANK_ERROR;
  }
}

// ---------- 結果画面 ----------
let result = null; // { score, monkeys, secs }
export function onResult(r) {
  result = r;
  $("rankName").value = savedName();
  $("rankReg").hidden = !(r.score > 0); // 0点は登録しない
  $("rankSend").disabled = false;
  load($("rankList"), $("rankMsg"));
}
$("rankSend").addEventListener("click", async () => {
  const name = $("rankName").value.trim(), msg = $("rankMsg");
  if (!name) { msg.textContent = T.RANK_NAME; msg.hidden = false; $("rankName").focus(); return; }
  try { localStorage.setItem("skk_name", name); } catch {}
  $("rankSend").disabled = true; msg.textContent = T.RANK_SENDING; msg.hidden = false;
  try {
    const { status, data } = await call({ method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ player: player(), name, ...result }) });
    if (status === 429) { msg.textContent = T.RANK_BUSY; $("rankSend").disabled = false; return; }
    if (status !== 200) { msg.textContent = T.RANK_FAIL; return; }
    render($("rankList"), data.top);
    msg.textContent = fill(T.RANK_DONE, data.mine);
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
  load($("rankDlgList"), $("rankDlgMsg"));
});
$("rankClose").addEventListener("click", () => dlg.close());
dlg.addEventListener("close", () => { G.paused = $("howto").open; }); // 遊び方から開いたときは、遊び方に戻るまで止めたまま
