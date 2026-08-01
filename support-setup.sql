-- support-setup.sql
-- 生成AIのエラーを「講師が困ったまま」にしないための2つの箱。
--   ① ai_error_log      … AIが失敗したら自動で記録（講師の操作は不要）。運営が原因を先回りで掴む
--   ② support_requests  … 講師が「ヘルプデスクに連絡」を押して送る問い合わせ。エラー内容が自動で添付される
-- Supabase SQL エディタで手動実行する（既存の *-setup.sql と同運用）。

-- ① AIの失敗ログ（サーバ側で自動記録）
CREATE TABLE IF NOT EXISTS ai_error_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature     text,        -- karte_build / report_manual / test_draft 等
  provider    text,        -- anthropic / openai / google
  key_source  text,        -- tenant（塾の鍵） / company（当社の鍵）
  kind        text,        -- no_key / invalid_key / no_balance / busy / other
  message     text,        -- 講師の画面に出した日本語
  detail      text,        -- プロバイダからの生の応答（先頭のみ）
  actor_email text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_error_log_created ON ai_error_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_error_log_kind    ON ai_error_log (kind, created_at DESC);

ALTER TABLE ai_error_log ENABLE ROW LEVEL SECURITY;
-- 記録は service role（RLSバイパス）で行う。閲覧は講師のみ。
DROP POLICY IF EXISTS ai_error_log_select ON ai_error_log;
CREATE POLICY ai_error_log_select ON ai_error_log FOR SELECT USING (auth_is_teacher());

-- ② ヘルプデスクへの問い合わせ
CREATE TABLE IF NOT EXISTS support_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category     text NOT NULL DEFAULT 'ai_error',  -- ai_error / question / other
  message      text NOT NULL,                     -- 講師が書いた本文
  context      jsonb,                             -- 画面・機能・エラー内容の自動添付
  actor_email  text,
  actor_name   text,
  mail_status  text,                              -- sent / skipped / failed（info@ への送信結果）
  mail_error   text,
  status       text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_support_requests_created ON support_requests (created_at DESC);

ALTER TABLE support_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS support_requests_select ON support_requests;
CREATE POLICY support_requests_select ON support_requests FOR SELECT USING (auth_is_teacher());
