# サルも木から落ちぬん（引き継ぎ一式・2026-10-17）

| ファイル | 中身 |
|---|---|
| `HANDOFF_PROMPT.md` | Claude Code に最初に貼る指示文 |
| `CLAUDE.md` | プロジェクトの方針・決定事項・運営ルール（Claude Code が毎回読む） |
| `SPEC.md` | 仕様（モックの挙動の記録、調整値、未決事項） |
| `mock/index.html` | 動くモック（ブラウザで開くだけで遊べる） |
| `mock/src/` | モックのソース（`shell.html`＝HTMLとCSS、`game.js`＝本体） |
| `mock/build.py` | `python mock/build.py` でモックを組み立て直す |
| `assets/monkeys/` | サル24種の透過PNGと、手足・当たり判定のデータ `monkeys.json` |
| `assets/source/` | 元の画像（運営者提供。公開しない） |

ローカルで遊ぶ：このフォルダで `python -m http.server 8124` を実行し、`http://localhost:8124/mock/` を開く。

## Xでシェアの共有画像（R2 `sarumo-shares`）

共有ページ `https://waqk.jp/sarumo-kikara/s/<id>` の画像は R2 のキー `s/<id>.jpg` にある（期限なし）。問題のある画像の削除依頼が来たら、このフォルダで次を実行する（消すと共有ページはゲームのトップへ転送される。エッジのキャッシュに残った画像は最長30日で消える）。

```
npx wrangler r2 object delete sarumo-shares/s/<id>.jpg --remote
```
