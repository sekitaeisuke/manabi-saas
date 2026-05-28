-- ============================================================
-- つなぐ連携: students / parents に tsunagu_id カラム追加
-- Supabase SQL Editor で実行してください
-- ============================================================

-- students につなぐ内部IDを保持
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS tsunagu_id text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_students_tsunagu_id
  ON students(tsunagu_id)
  WHERE tsunagu_id IS NOT NULL;

-- parents にもつなぐ側の識別子を保持
ALTER TABLE parents
  ADD COLUMN IF NOT EXISTS tsunagu_id text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_parents_tsunagu_id
  ON parents(tsunagu_id)
  WHERE tsunagu_id IS NOT NULL;

-- ============================================================
-- 完了
-- 次に ai-system/scripts/sync_tsunagu_parents.py を実行してください
-- ============================================================
