-- ai-usage-setup.sql
-- 「当社の鍵で動かし、料金は月額に含める」方針を採るための土台。
-- 試算ではなく実測で、どの機能がいくら使っているかを持つ。
-- Supabase SQL エディタで手動実行する（既存の *-setup.sql と同運用）。

CREATE TABLE IF NOT EXISTS ai_usage_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature       text,        -- karte_build / report_manual / test_draft 等
  provider      text,        -- anthropic / openai / google
  key_source    text,        -- tenant（塾の鍵） / company（当社の鍵）
  model         text,
  input_tokens  integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  cost_usd      numeric(10,6),   -- 単価が分かるモデルのみ。未設定なら NULL
  tenant_id     uuid,            -- 塾の区切り。導入前は NULL
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_created ON ai_usage_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_feature ON ai_usage_log (feature, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_tenant  ON ai_usage_log (tenant_id, created_at DESC);

ALTER TABLE ai_usage_log ENABLE ROW LEVEL SECURITY;
-- 記録は service role（RLSバイパス）。閲覧は講師のみ。
DROP POLICY IF EXISTS ai_usage_log_select ON ai_usage_log;
CREATE POLICY ai_usage_log_select ON ai_usage_log FOR SELECT USING (auth_is_teacher());

-- 月ごと・機能ごとの集計ビュー（「今月いくら使ったか」をここで見る）
CREATE OR REPLACE VIEW ai_usage_monthly AS
SELECT
  date_trunc('month', created_at)      AS month,
  tenant_id,
  feature,
  provider,
  count(*)                             AS calls,
  sum(input_tokens)                    AS input_tokens,
  sum(output_tokens)                   AS output_tokens,
  round(sum(cost_usd)::numeric, 4)     AS cost_usd
FROM ai_usage_log
GROUP BY 1, 2, 3, 4
ORDER BY 1 DESC, cost_usd DESC NULLS LAST;
