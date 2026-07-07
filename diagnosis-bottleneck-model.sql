-- 学力診断を「三層固定・主ボトルネック1つ」モデルへ刷新するための列追加。
-- Supabase SQL Editor で1回だけ実行する。既存データは壊さない（列を足すだけ）。
--
-- 設計：
--   report_html         = 保護者向け（温かい・主ボトルネックを1つだけ柔らかく提示）※既存列を再利用
--   teacher_report_html = 講師向け（尖った5項目診断：観測事実／整合性／多重仮説／主因／主介入）
--   diagnosis_json      = Claude が返した構造化診断の生データ（監査・再利用用）
--   bottleneck_layer    = 主ボトルネックの層（H1=下位能力 / H2=学習方法 / H3=学習習慣）
--   bottleneck_label    = 主ボトルネックの短いラベル（例「分数の通分処理」）
--   intervention        = 主介入（次回すぐ実行できる具体行動を1つ）

ALTER TABLE questionnaire_responses
  ADD COLUMN IF NOT EXISTS teacher_report_html text,
  ADD COLUMN IF NOT EXISTS diagnosis_json      jsonb,
  ADD COLUMN IF NOT EXISTS bottleneck_layer    text,
  ADD COLUMN IF NOT EXISTS bottleneck_label    text,
  ADD COLUMN IF NOT EXISTS intervention        text;

-- 講師連携カード（collaboration/sync）で主ボトルネックを見出しに出せるようにするだけなので
-- 追加のインデックスやRLS変更は不要（既存の RLS/権限をそのまま継承する）。
