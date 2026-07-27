-- ============================================================
-- LINE 連携（合言葉コード方式）
-- Supabase SQL Editor で実行してください
--
-- 流れ:
--   1. 保護者/講師が設定画面で「連携する」→ 6桁コードを発行（このテーブルに保存）
--   2. 地域教育工房の LINE 公式アカウントを友だち追加し、そのコードを送信
--   3. /api/line/webhook がコードを照合し、notification_preferences.line_user_id を埋める
--
-- LINE の userId はチャネルごとに異なる値なので、つなぐ側の連携は流用できない。
-- このテーブルは自社チャネルの userId を本人確認つきで受け取るための入口。
-- ============================================================

CREATE TABLE IF NOT EXISTS line_link_codes (
  code         text PRIMARY KEY,            -- 6桁（紛らわしい I/O/0/1 を除いた英数字）
  actor_kind   text NOT NULL,               -- 'parent' | 'teacher'
  actor_id     uuid NOT NULL,
  expires_at   timestamptz NOT NULL,        -- 発行から10分
  used_at      timestamptz,                 -- 使用済みなら時刻
  line_user_id text,                        -- 使用時に紐付いた userId（監査用）
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_llc_actor   ON line_link_codes(actor_kind, actor_id);
CREATE INDEX IF NOT EXISTS idx_llc_expires ON line_link_codes(expires_at);

-- RLS: 有効化するがポリシーは作らない。
-- ＝ anon / authenticated からは一切読み書きできず、API ルート（service role）だけが触れる。
-- コードが他人から読めると LINE 連携を乗っ取られるため、意図的に完全非公開にしている。
ALTER TABLE line_link_codes ENABLE ROW LEVEL SECURITY;

-- 期限切れコードの掃除（任意・cron を使うなら）
-- DELETE FROM line_link_codes WHERE expires_at < now() - interval '1 day';
