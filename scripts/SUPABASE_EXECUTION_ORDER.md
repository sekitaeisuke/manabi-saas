# Supabase SQL 実行順序

## 実行場所
https://supabase.com/dashboard → プロジェクト → SQL Editor

## 実行順序（上から順に）

### ① high-schools-setup.sql
テーブル作成 + 東京都・千葉県・茨城県の基本学校データ登録

### ② school-fields-migration.sql
high_schools テーブルにフィールド追加

### ③ schools-extended-setup.sql
東京都 私立高校 Vol.1 追加

### ④ schools-extended2-setup.sql
東京都 私立高校 Vol.2 追加

### ⑤ schools-extended3-setup.sql
東京都 私立高校 Vol.3 + 国立高校 追加

### ⑥ middle-schools-setup.sql
中学・中高一貫校データ追加

### ⑦ mailing-list-migration.sql
school_mailing_list にカラム追加 + 全校を mailing list へ追加 + メール送信済み校のステータス更新

### ⑧ inquiry-forms-update.sql
問い合わせフォームURL 登録（35校）

### ⑨ scripts/fax_update.sql  ← 今回生成
FAX番号登録（99件）

### ⑩ scripts/contact_results.sql  ← contact_scraper.py 実行後
自動収集した連絡先の登録

---

## 確認クエリ（実行後に確認）

```sql
SELECT
  CASE
    WHEN email IS NOT NULL            THEN '① メールあり'
    WHEN inquiry_form_url IS NOT NULL THEN '② フォームあり（メールなし）'
    WHEN fax_number IS NOT NULL       THEN '③ FAXのみ'
    ELSE                                   '④ 連絡先未登録'
  END AS 連絡手段,
  COUNT(*) AS 件数
FROM school_mailing_list
GROUP BY 1
ORDER BY 1;
```

```sql
-- 未登録の学校一覧（444校調査対象）
SELECT school_name, prefecture, school_type
FROM school_mailing_list
WHERE email IS NULL
  AND inquiry_form_url IS NULL
  AND fax_number IS NULL
ORDER BY prefecture, school_name;
```
