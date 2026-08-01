-- karte-materials-setup.sql
-- カルテ「素材ファースト」化 と 3か月ビジョン→講習ビジョンへの役割変更。
-- Supabase SQL エディタで手動実行する（既存の *-setup.sql と同運用）。
--
-- 考え方:
--   ・カルテ = 素材（報告書 > テスト結果 > 保護者メッセージ > 教材進捗 > 診断）のビュー。
--     AIは要約と優先順位づけを担当し、素材そのものは素で見せる。素材が無い項目は空欄のまま。
--   ・ビジョン = 講習（夏期/冬期/春期）ごとの目標と成果。面談で使う書類。

-- 1) 講習ビジョン: learning_plans に「どの講習の、いつからいつまでの計画か」を持たせる
ALTER TABLE learning_plans
  ADD COLUMN IF NOT EXISTS term_type   text,      -- summer | winter | spring | regular
  ADD COLUMN IF NOT EXISTS term_label  text,      -- 表示名（例: 2026 夏期講習）
  ADD COLUMN IF NOT EXISTS term_start  date,
  ADD COLUMN IF NOT EXISTS term_end    date,
  ADD COLUMN IF NOT EXISTS result_json jsonb,     -- 講習後の実績（目標に対する到達・テストの数字）
  ADD COLUMN IF NOT EXISTS result_html text,      -- 面談で配る成果サマリー
  ADD COLUMN IF NOT EXISTS meeting_notes text;    -- 面談メモ（講師手入力）

CREATE INDEX IF NOT EXISTS idx_learning_plans_term
  ON learning_plans (term_type, term_start DESC);

-- 既存の2件は通常期の計画として扱う（term未設定のまま残すと一覧で迷子になるため）
UPDATE learning_plans
   SET term_type = 'regular'
 WHERE term_type IS NULL;

-- 2) カルテ: 素材の充足状況を持たせる（「何が足りなくてカルテが薄いか」を画面に出すため）
ALTER TABLE student_karte
  ADD COLUMN IF NOT EXISTS material_status jsonb,  -- {reports:n, tests:n, parentMessages:n, progress:n, diagnosis:n}
  ADD COLUMN IF NOT EXISTS built_from      text;   -- 'report_saved' | 'manual' | 'bulk' 等、更新のきっかけ

-- 3) カルテを素材の動きで引けるように
CREATE INDEX IF NOT EXISTS idx_student_karte_generated ON student_karte (generated_at DESC);

-- 4) 講習ビジョンの参照権限は learning_plans の既存ポリシーをそのまま使う（列追加のみのため変更不要）。
--    student_karte の RLS も student-karte-setup.sql のポリシーを継続利用する。
