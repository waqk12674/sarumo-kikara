# sarumo-kikara（サルも木から落ちぬん）

木の枝に白黒のサルを引っかけ、サルの下にサルをつなげて鎖を伸ばす、シュールな2D物理パズル。スマホ縦画面が前提でPCでも遊べる。
仕様は `SPEC.md`（モックの挙動の記録）。動くモックは `mock/index.html`。本番はモックを作り直して作る（挙動はモックと同じ）。

公開URL（仮）：https://waqk.jp/sarumo-kikara/

## 構成（石の上にも三年 C:\src\man-on-the-rock にそろえる）

- Canvas 2D ＋ バニラJS（ES Modules）、ビルドなし。物理は matter.js 0.19.0（バージョン固定）
- `index.html` → `src/main.js`（起動・ループ・画面遷移・UI）
- `src/config.js`：**調整値はすべてここに集める**（企画側が直接編集する。日本語コメント付き）。`src/defaults.js` に既定値、不正な値は既定値に戻す
- `state.js`（共有の状態 `G`・設定・URLパラメータ）／`tree.js`（木としなり）／`monkeys.js`（サルの読み込み・つかむ点）／`grab.js`（つかむ・離す・場所取り・点数・群れ）／`grip.js`（重さ・握力・疲れ）／`wind.js`／`camera.js`／`input.js`（札から連れてくる・置きなおし）／`render.js`（背景・木・サル・擬音）／`result.js`（撮影・結果画像・シェア）／`util.js`
- 文言：JS が出すものは `config.js` の `TEXT.ja` / `TEXT.en`（`state.js` の `LANG` で選ぶ）。画面の本文（遊び方・ボタンなど）は index.html に `<span lang="ja">…</span><span lang="en">…</span>` と日英を並べ、`<html lang>` と違うほうを CSS で隠す。文言を足すときは両方を書く。サルの英語名は monkeys.json の `en`
- `src/audio.js`：音。`assets/audio/*.mp3` は運営者が用意した録音（出典は `CREDITS.md`）、`*.wav` は `python tools/make_se.py`（標準ライブラリだけ・乱数の種固定）で合成したもの。合成音を変えるときはスクリプトを直して実行し直す（録音に差し替えた音は書き出さない）。用途・ファイル名・音量は config.js の `AUDIO`
- `assets/monkeys/`：サルのPNGと `monkeys.json`（形式は SPEC.md §4）。`assets/source/` は元画像で、公開しない
  - クモザル・ホエザル・リスザルの絵は `python tools/flip_tails.py` で、加工前の `assets/source/tails/*.png` から尻尾を下向きにして作る。この3枚の絵を直すときは加工前のほうを直して実行し直す
  - `tools/monkeys.html`：24種の一覧（つかむ点・ぶら下がれる点・重さ）。手元で http://localhost:8124/tools/monkeys.html を開く
- `ogp.png`：OGP・バナー画像（1200×630。枝につかまって吠えるホエザル）。`python tools/make_ogp.py` で `assets/source/sheet_hanging.png` から作る（HG行書体を使うので Windows で実行）。直すときはスクリプトを直して実行し直す（2026-10-18）
- シェアの URL は `https://waqk.jp/sarumo-kikara/`（英語版は `…/en/`）。OGP は index.html の og:image（`ogp.png`。英語版も日本語の画像のまま）
- `mock/`：引き継ぎ時点のモック（参考用。公開しない）
- 配信：`wrangler.jsonc` の routes `waqk.jp/sarumo-kikara/*` ＋ `_redirects`（`/sarumo-kikara/* /:splat 200`）で静的配信（2026-10-18 本公開。AdSense 審査中だが運営者が公開を決めた）。workers.dev（https://sarumo-kikara.waqk12674.workers.dev/）も残し、`_headers` で workers.dev にだけ noindex。公開するファイルは `.assetsignore` の許可リスト。GitHub の main に push すると Workers Builds で自動デプロイ
- 英語版（2026-10-18）：https://waqk.jp/sarumo-kikara/en/。`worker/index.js` の `english` が index.html の head（lang・title・description・og・canonical）を英語に書き換え、`<base href="../">` を足して返す（ファイルは1つ。手本は dashimaki）。`/` と `/en/` の行き来は、遊び方ダイアログの右上の「English」「日本語」のリンクだけ（言語を自動で判定して移したりしない）。英語の題名は「Monkeys Don't Fall」
- ランキング（2026-10-17）：`worker/index.js`（`GET/POST api/scores`）＋ D1 `sarumo-kikara-scores`（id `6c5d4df5-2176-43a2-a84e-604aa6521841`、表は `schema.sql`）。画面側は `src/ranking.js`。Worker が動くのは `run_worker_first` の `/api/*`・`/sarumo-kikara/api/*` だけ。`worker/`・`schema.sql` は `.assetsignore` の許可リストに入っていないので公開されない。テスト版の記録は本公開のときに `DELETE FROM scores` で消す
- Xでシェアの結果画像（2026-10-18）：押すと `src/result.js` が 1200×630 の JPEG（題字・点数は入れず全面が絵。サルがいちばん集まっている所に、サルの背丈が絵の高さの0.45倍になるまで寄った横長の絵。全員は入らなくてよい。調整は `CAMERA.SHARE_UP`）を `POST api/share` に送り、共有ページ `https://waqk.jp/sarumo-kikara/s/<id>`（OGP がその画像。noindex）でポストする。送れなければゲームの URL。画像は R2 `sarumo-shares`（`SHARES`、期限なし）、連投止めは D1 の `shares`（IP ハッシュ。IPv6 は /64）で同じ IP から1分5件、`share_days` で全体1日300件まで（`SHARE_PER_IP`・`SHARE_PER_DAY`）。`SHARE_RL`（Rate Limiting）は前段の間引きだけ：ロケーション内のマシンごとの近似で、本番では1つの IP から毎秒2件ほど通る（2026-10-18 に計測）。Worker が動くパスに `/s/*` が加わった。範囲チェックはランキングと共通の `checkRecord`（0点は共有ページを作らない）。消し方は README
  - ニックネームなど利用者が入力した文字は、共有の画像にもページにも入れない（プライバシーポリシー）
- ランキングの取得（`board`・`fresh` in src/ranking.js）：ランキングの取得は、ページを開いて最初にランキングを出すときの1回と登録したときだけ。取得済みのものを使い回し、API の dayStart（日本時間0時）から24時間たったら取り直す（2026-10-24 運営者。結果画面のたびに取得すると、何回も遊ばれたときに Worker が PV の何倍も動く。perfect-ring で約8倍だった）

## 確認のしかた

- ローカルサーバー：`python -m http.server 8124`（石の上にも三年の8123と分ける）
- URLパラメータ：`?debug=1`（調整パネルと数値表示。コンソールに `__saru`：`step(n)` で物理を進められる）、`?seed=N`、`?god=1`（落ちない）
- ブラウザのペインが隠れているとループ（requestAnimationFrame）が止まる。自動で確かめるときは `__saru.step(n)` で進める
- ランキングの API は `python -m http.server` では動かない（「オンライン版だけ」と出る）。Worker ごと確かめるときは、D1 の表を `npx wrangler d1 execute sarumo-kikara-scores --local --persist-to <フォルダの外> --file=schema.sql` で作ってから `npx wrangler dev --port 8790 --persist-to <フォルダの外>`。止めるときは node の wrangler と workerd の両方を止める（片方だけだと workerd が立ち直る）
- `python -m http.server` だと、直した src/*.js がブラウザのキャッシュから古いまま読まれることがある。確かめる前に `fetch(path,{cache:"reload"})` で取り直すか、ハード再読み込みする
- 物理の変更をしたら、次の3つの場面で暴れないか確かめる：①枝の先に4匹かためる ②マウスで勢いよく運んで離す ③10匹以上の鎖に風

## 決定事項（変えるときは運営者に確認）

- 点数は、新しく連れてきたサルがはじめて木につながったときだけ。点数＝鎖の深さ（枝1、その下2…）。置きなおしでは入らない
  - 深い所に一瞬つないで点を取り、すぐ持ち上げて浅い所へどける稼ぎ方はできるが、ふさがない。木にぶら下がるサルの総量は増え続けるので、後半ほど難しくなるのが狙い（2026-10-17）
- 1匹でも地面にふれたら終わり（つながったままふれてもアウト）
- 幹と枝の付け根はつかめない。つかめるのは枝だけ
- サルは右上の札からドラッグで連れてくる。置いたサルは持ち上げて置きなおせる（下の仲間も一緒）
- 疲れ：ぶら下がっていると握力が落ち、置きなおしても戻らない
- サルどうし・サルと木はぶつからない（地面だけ）。2本目の手は同じ相手に軽く添えるだけ。つなぎ目の長さは0にしない（SPEC.md §5 の理由を参照）
- 尻尾でつかめるサルはいない。尻尾は腕と逆（下向き）に垂らし、先に仲間がぶら下がれる（クモザル・ホエザル・リスザル・オマキザル・ワオキツネザル）（2026-10-17）
- 見た目は淡い水彩と墨の和風。原色は使わない。サルは白黒のペン画
- 結果画像（シェアの画像）は、木につながっているサルがいちばん多かった瞬間を、全員に寄って撮った絵。擬音は写さない（SPEC.md §9）（2026-10-17。前は「落ちはじめの瞬間」）
- 枝は左右に1本ずつ（根元から斜め→先が水平）。ほかの形は `?tree=` で比べられる（SPEC.md §3）（2026-10-17）
- サルどうしはなるべく重ねない：枝の上では2本目の手が来る位置も間をあける（押し合う力を強くしても重なりは減らず、揺れが増えた）。ただし、ふれた所がふさがっていても±48の空きへ寄せてつかむ（つかみにくくなりすぎたため）（2026-10-17）
- 鎖ボーナスは深いほど派手（輪・紙吹雪・揺れ・文字・画面の光り）。調整は `COMBO`（2026-10-17）
- 風で木はほとんどしならせない（`TREE.WIND_BEND`=0.1。しなりすぎるとサルどうしが重なって遊びにくい）（2026-10-17）
- 重さによるきしみ（しなり）も最小限（`TREE.BRANCH_K`=0.00003・`TRUNK_K`=0.0065。重なりを極力なくすため）（2026-10-17）
- 操作は「ドラッグ＋自動でつかむ」に固定。モックの「落とす」「ガシッ」は消した。調整パネルは `?debug=1` のときだけ（2026-10-17）
- 調整値の初期値はモックのまま（握力5・疲れやすさ1・風1・ふんばり1・つかめる距離16）。サルの大きさだけ 1.5 → 2.0（2026-10-17）
- 重量級（ゴリラ・オランウータン・チンパンジー・ボノボ・マンドリル）だけ、実際の体重に合わせて大きく（`SPECIES_SIZE`。ゴリラで約2.5）。ほかの種は2.0のまま。大きくすると重く、握力も強くなる（SPEC.md §4）（2026-10-18）
- 重さは見た目の大きさにそろえる：絵の墨の面積×倍率²（ニホンザル＝1）。当たり判定の面積ではない（SPEC.md §4）（2026-10-18）
- 音（2026-10-17）：「よっと」「軽い」「重い」「落下」は運営者の録音、ほかは合成。SE は8場面（札・持ち上げ「よっと」／つかむ（重さ `GRAB.HEAVY`=1.05 以上は擬音「ガシッ」と重い音、それより軽いと擬音「ひょい」と軽い音）／鎖ボーナス（深いほど高い）／ずるっ／あっ（落下の音）／風の予告／ぽとっ／結果）。環境音（鳥のさえずりだけ）は最初のタップから小さくループ。風の音は風の予告のときだけで、ふだんは鳴らさない。BGM なし。ミュートボタンは右下（`skk_muted`）
- ランキングは全期間 TOP10・1人（端末）1記録。結果画面で名前（1〜10文字）を入れて登録したときだけ載る。結果画面と画面下の札から見られる（SPEC.md §9b）（2026-10-17）
  - 2026-10-22 から「歴代」「デイリー」（日本時間 0:00 に切り替え。境目は Worker の `dayStartOf`）のタブで、どちらも TOP20。1回の GET で両方返す（`{ all, daily, mine: { all, daily }, dayStart, top }`。`top` と `mine.best/rank` は古いページ用）。結果画面の一覧は10行分の高さでスクロール
  - 名前の NG チェックは `worker/name-filter.js`（`C:\src\shared\name-filter.js` の写し。ここでは直さない）。NG なら `400 { error: 'ng_name' }`、画面は「その名前は登録できません」を出して名前を直して登録し直せる。名前は登録できたときだけ `skk_name` に保存
- 遊び方は、開いたときにダイアログ（index.html の `#howto`。文面は運営者が書いたもの）で出し、「はじめる」まで止める。「ランキング」も開ける（閉じると遊び方に戻る）。詳しい遊び方は、ハブの https://waqk.jp/guide/sarumo-kikara へリンク（ハブに載せるときに作る。それまでは 404）。もう一度・やり直すでは出さない（2026-10-18）
- 結果画面のボタンは WAQK 共通の4つ（Xでシェア・もう一度・ほかのゲーム・開発者を応援）。画像は長押しで保存（2026-10-17）

## 運営ルール（WAQK 共通）

- `html lang="ja"` と `title` を JS で書き換えない。/sarumo-kikara/ は常に日本語、英語版は /sarumo-kikara/en/ だけ。言語判定で head を書き換えたり /en/ へ転送したりしない
- 遊び方は HTML の本文としても置く（文字数稼ぎはしない）
- 広告は AdSense 承認後、結果→「もう一回」などの区切りだけ。プレイ中・開始前・操作のたびには出さない。クリックを誘う文言は使わない
- 画面サイズ固定（ドラッグでページがスクロールしない）
- 配信は「ゲームごとの Worker ルート `waqk.jp/sarumo-kikara/*`＋`_redirects` の `/sarumo-kikara/* /:splat 200` で静的配信」。run_worker_first は処理が必要なパスだけ。`.assetsignore` は許可リスト方式
- localStorage のキーは `skk_` で始める（`skk_muted`・`skk_player`・`skk_name`）
- 公開URL・OGPのURLは `https://waqk.jp/sarumo-kikara/` で書く
