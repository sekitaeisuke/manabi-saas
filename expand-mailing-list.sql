-- ============================================================
-- メーリングリスト拡張: high_schools の全 active 校を追加
-- 既に school_mailing_list に存在する学校はスキップ
-- ============================================================

-- Step 1: 既存エントリに high_school_id を紐付け（NULLのもの）
UPDATE school_mailing_list ml
SET high_school_id = hs.id
FROM high_schools hs
WHERE ml.school_name = hs.name
  AND ml.high_school_id IS NULL
  AND hs.status = 'active';

-- Step 2: まだリストにない学校をすべて追加
INSERT INTO school_mailing_list (school_name, school_type, school_level, prefecture, city, high_school_id, contact_status)
SELECT
  hs.name,
  hs.school_type,
  hs.school_level,
  hs.prefecture,
  hs.city,
  hs.id,
  '未送信'
FROM high_schools hs
WHERE hs.status = 'active'
  AND NOT EXISTS (
    SELECT 1
    FROM school_mailing_list ml
    WHERE ml.school_name = hs.name
  );

-- 確認クエリ（実行後に件数を確認）
SELECT
  prefecture,
  COUNT(*) AS 件数
FROM school_mailing_list
GROUP BY prefecture
ORDER BY 件数 DESC;
