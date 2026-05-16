-- ============================================================
-- announcements に対象絞り込み列を追加
-- 両方 NULL = 全員向け（broadcast）
-- target_grade だけ指定 = 指定学年の生徒/保護者のみ
-- target_school_id だけ指定 = 指定校舎の生徒/保護者のみ
-- 両方指定 = AND 条件
-- ============================================================

ALTER TABLE announcements
  ADD COLUMN IF NOT EXISTS target_grade     text,
  ADD COLUMN IF NOT EXISTS target_school_id uuid REFERENCES schools(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_announcements_grade  ON announcements(target_grade);
CREATE INDEX IF NOT EXISTS idx_announcements_school ON announcements(target_school_id);
