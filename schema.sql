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
