-- ============================================================
-- つなぐ保護者ディレクトリ
--   つなぐ（一括メール送信画面）から「生徒名 → 保護者名・保護者メール」を
--   Supabase に取り込むための参照表。
--   ・書き込みは PC 側 Python（scripts/sync_tsunagu_parents.py, service role）のみ。
--   ・Web アプリ（manabi-saas）は生徒登録フォームで name_key を引いて
--     保護者名・メールを自動補完するために SELECT だけ行う。
--   前提: parent-portal-setup.sql の auth_is_teacher() が作成済み。
-- Supabase SQL Editor で実行してください。
-- ============================================================

CREATE TABLE IF NOT EXISTS tsunagu_parent_directory (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tsunagu_id   text,
  student_name text NOT NULL,
  name_key     text NOT NULL,          -- 空白/全角空白を除いた正規化キー（照合用）
  grade        text,
  school       text,
  parent_name  text,
  parent_email text,
  synced_at    timestamptz NOT NULL DEFAULT now()
);

-- つなぐ内部IDで一意（upsert のキー）。NULL は複数可。
CREATE UNIQUE INDEX IF NOT EXISTS idx_tpd_tsunagu_id
  ON tsunagu_parent_directory(tsunagu_id)
  WHERE tsunagu_id IS NOT NULL;

-- 生徒名（正規化）で高速照合
CREATE INDEX IF NOT EXISTS idx_tpd_name_key
  ON tsunagu_parent_directory(name_key);

-- ============================================================
-- RLS: 講師は SELECT のみ。書き込みは service role 専用（ポリシー無し＝一般ユーザは遮断）。
-- ============================================================
ALTER TABLE tsunagu_parent_directory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tpd_select_teacher ON tsunagu_parent_directory;
CREATE POLICY tpd_select_teacher ON tsunagu_parent_directory FOR SELECT
  USING (auth_is_teacher());

-- ============================================================
-- 完了
-- 次に ai-system 側で `python scripts/sync_tsunagu_parents.py --apply` を実行すると
-- この表が更新されます（同じ実行で従来の保護者一括作成も行われます）。
-- ============================================================
