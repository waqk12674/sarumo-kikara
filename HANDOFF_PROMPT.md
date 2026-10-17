# Claude Code への最初の指示（このまま貼り付けて使う）

---

このリポジトリ（C:\src\sarumo-kikara）は新作ブラウザゲーム「サルも木から落ちぬん」です。Claude.ai で作ったモックからの引き継ぎです。

まず次を読んでください。

1. `CLAUDE.md`（構成の方針・決定事項・運営ルール）
2. `SPEC.md`（モックが今どう動いているかの記録。物理まわりは、暴れないように決めた理由も書いてある）
3. `mock/src/game.js` と `mock/src/shell.html`（モックの本体。`python mock/build.py` で `mock/index.html` に組み立てる）
4. 参考：`C:\src\man-on-the-rock`（石の上にも三年。構成・config.js の書き方・OGP中継ページ・配信の作りをそろえる）

やってほしいこと：

- モックの挙動を変えずに、CLAUDE.md の構成（ES Modules、`src/config.js` に調整値を集約、`assets/monkeys/` の PNG と JSON を読む）に作り直す
- SPEC.md §11 の未決事項は、私に確認してから進める。とくに「モック用の切り替え（操作・つかみ・調整パネル）を本番に残すか」と「調整値の初期値」
- 着手前に、作るファイルの一覧と作業の順番を提案して、私の了承を取る
- 物理を変えたら、CLAUDE.md「確認のしかた」の3つの場面で暴れないか確かめる

まだやらないこと：配信設定（Worker ルート、_redirects、wrangler）、公開、Search Console、広告。これらは本体ができてから相談します。
