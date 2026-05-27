-- ============================================================
-- lesson_reports に INSERT / UPDATE ポリシーを追加
-- Supabase SQL Editor で実行してください
-- ============================================================

-- 講師は INSERT 可能
DROP POLICY IF EXISTS lr_insert_teacher ON lesson_reports;
CREATE POLICY lr_insert_teacher ON lesson_reports FOR INSERT
  WITH CHECK (auth_is_teacher());

-- 講師は UPDATE 可能
DROP POLICY IF EXISTS lr_update_teacher ON lesson_reports;
CREATE POLICY lr_update_teacher ON lesson_reports FOR UPDATE
  USING (auth_is_teacher());
