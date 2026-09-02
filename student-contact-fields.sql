-- ============================================================
-- 生徒・保護者の基本情報カラム追加
--   Supabase SQL Editor で実行してください
--
--   つなぐの「生徒アカウント確認・編集」(/class/student) が持っている
--   住所・電話・学校名・保護者氏名・生年月日・ふりがなを受ける器。
--     （ai-system: python scripts/sync_tsunagu_student_profiles.py --apply）
-- ============================================================

-- 生徒 --------------------------------------------------------
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS school_name  text,  -- 在籍学校（例: 柏の葉中学校）※school_id は自社の教室なので別物
  ADD COLUMN IF NOT EXISTS furigana     text,  -- ふりがな
  ADD COLUMN IF NOT EXISTS birthday     date,  -- 生年月日
  ADD COLUMN IF NOT EXISTS postal_code  text,  -- 郵便番号
  ADD COLUMN IF NOT EXISTS address      text,  -- 住所
  ADD COLUMN IF NOT EXISTS phone        text,  -- 家庭・生徒の連絡先
  ADD COLUMN IF NOT EXISTS note         text;  -- 備考（アレルギー・送迎など）

COMMENT ON COLUMN students.school_name IS '在籍している小中高の学校名。school_id（自社教室）とは別。つなぐから同期';
COMMENT ON COLUMN students.address     IS '自宅住所。つなぐの生徒アカウント画面から同期';

-- 保護者 ------------------------------------------------------
ALTER TABLE parents
  ADD COLUMN IF NOT EXISTS furigana     text,  -- ふりがな
  ADD COLUMN IF NOT EXISTS postal_code  text,
  ADD COLUMN IF NOT EXISTS address      text;

COMMENT ON COLUMN parents.phone IS '保護者の電話番号。つなぐの生徒レコードの tel を同期';

-- 電話番号として不正な値の掃除（氏名が紛れ込んでいた行がある） ----
UPDATE parents
   SET phone = NULL
 WHERE phone IS NOT NULL
   AND phone !~ '^[0-9+][0-9\-() ]{7,}$';

-- 検索用 ------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_students_school_name ON students (school_name);
