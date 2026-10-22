-- ランキング用のスコア表（D1: sarumo-kikara-scores）
-- 適用: npx wrangler d1 execute sarumo-kikara-scores --remote --file=schema.sql
-- 1回ごとの記録を残し、ランキングは端末（player）ごとの最高記録で並べる
CREATE TABLE IF NOT EXISTS scores (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  player     TEXT    NOT NULL,          -- 端末ごとの匿名ID（localStorage の skk_player）
  name       TEXT    NOT NULL,          -- ニックネーム 1〜8 文字
  score      INTEGER NOT NULL,          -- スコア
  monkeys    INTEGER NOT NULL,          -- 連れてきたサルの数
  secs       REAL    NOT NULL,          -- プレイ時間（秒）
  created_at INTEGER NOT NULL,          -- UNIX ミリ秒
  ip_hash    TEXT                       -- 連投防止用（IP そのものは保存しない）
);
CREATE INDEX IF NOT EXISTS idx_scores_player ON scores (player, score);
CREATE INDEX IF NOT EXISTS idx_scores_score ON scores (score);
CREATE INDEX IF NOT EXISTS idx_scores_ip ON scores (ip_hash, created_at);
CREATE INDEX IF NOT EXISTS idx_scores_created ON scores (created_at); -- デイリー（日本時間 0:00 から）の絞り込み用

-- Xでシェアの連投止め（/api/share。画像そのものは R2 sarumo-shares）
CREATE TABLE IF NOT EXISTS shares (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ip_hash    TEXT    NOT NULL,          -- IP のハッシュ（IPv6 は /64 で丸める）
  created_at INTEGER NOT NULL           -- UNIX ミリ秒
);
CREATE INDEX IF NOT EXISTS idx_shares_ip ON shares (ip_hash, created_at);
-- 1日（UTC）ごとの件数。上限は worker/index.js の SHARE_PER_DAY
CREATE TABLE IF NOT EXISTS share_days (
  day TEXT    PRIMARY KEY,              -- 2026-10-18
  n   INTEGER NOT NULL
);
