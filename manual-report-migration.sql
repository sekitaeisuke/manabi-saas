-- ============================================================
-- lesson_reports テーブル拡張
-- テスト以外から手動で報告書を作成できるようにするためのマイグレーション
-- Supabase SQL Editor で実行してください
-- ============================================================

ALTER TABLE lesson_reports
  ADD COLUMN IF NOT EXISTS report_source    text    DEFAULT 'test',
  ADD COLUMN IF NOT EXISTS learning_content text,
  ADD COLUMN IF NOT EXISTS learning_method  text,
  ADD COLUMN IF NOT EXISTS checked_items    jsonb   DEFAULT '[]'::jsonb;

-- 既存レコードは全て 'test' ソースとしてマーク
UPDATE lesson_reports SET report_source = 'test' WHERE report_source IS NULL;
