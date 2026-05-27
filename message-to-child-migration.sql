-- ============================================================
-- lesson_reports に message_to_child 列を追加
-- Supabase SQL Editor で実行してください
-- ============================================================

ALTER TABLE lesson_reports
  ADD COLUMN IF NOT EXISTS message_to_child text;
