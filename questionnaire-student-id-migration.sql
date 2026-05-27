-- questionnaire_responses に student_id を追加して同姓同名データリークを修正
-- Supabase SQL Editor で実行してください

-- 1. student_id カラムを追加
ALTER TABLE questionnaire_responses
  ADD COLUMN IF NOT EXISTS student_id uuid REFERENCES students(id) ON DELETE SET NULL;

-- 2. RLS ポリシーを更新
--    新データ: student_id で照合
--    旧データ（student_id IS NULL）: student_name でフォールバック（後方互換）
DROP POLICY IF EXISTS qr_select_parent ON questionnaire_responses;
CREATE POLICY qr_select_parent ON questionnaire_responses FOR SELECT
  USING (
    auth_is_teacher()
    OR (
      status = 'approved'
      AND (
        (student_id IS NOT NULL AND student_id IN (SELECT auth_parent_student_ids()))
        OR (student_id IS NULL AND student_name IN (SELECT auth_parent_student_names()))
      )
    )
  );

-- 3. インデックス追加（クエリ高速化）
CREATE INDEX IF NOT EXISTS idx_questionnaire_responses_student_id
  ON questionnaire_responses (student_id);
