-- lp-inquiries-setup.sql
-- サービス紹介サイト（/lp・他塾向け）の問い合わせ受け皿。
-- Supabase の SQL エディタで実行してください。冪等（何度流してもよい）。
--
-- 方針: 匿名の書き込みをテーブルに直接許すと踏み台になるので、
--       挿入は必ずサーバ経由（/api/lp/inquiry・service role）にする。
--       ＝ここでは INSERT ポリシーを作らない（anon/authenticated は書けない）。
--       閲覧・更新は管理者(admin)だけ。

CREATE TABLE IF NOT EXISTS saas_inquiries (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  juku_name    text NOT NULL,               -- 塾名
  person_name  text NOT NULL,               -- ご担当者名
  email        text NOT NULL,
  phone        text,
  school_count text,                        -- 教室数（"1"|"2-3"|"4-9"|"10+"）
  student_count text,                       -- 生徒数の規模
  interests    text[] NOT NULL DEFAULT '{}',-- 気になっている機能（modules の key）
  message      text,
  status       text NOT NULL DEFAULT 'new', -- new | contacted | done | ignored
  note         text,                        -- 対応メモ（社内）
  source       text NOT NULL DEFAULT 'lp',
  user_agent   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS saas_inquiries_created_idx ON saas_inquiries (created_at DESC);
CREATE INDEX IF NOT EXISTS saas_inquiries_status_idx  ON saas_inquiries (status);

ALTER TABLE saas_inquiries ENABLE ROW LEVEL SECURITY;

-- 既存ポリシーを掃除してから貼り直す（残存permissiveを防ぐ）
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'saas_inquiries'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.saas_inquiries', p.policyname);
  END LOOP;
END $$;

-- 閲覧・更新・削除: 管理者(admin)のみ。既存ヘルパー auth_teacher_role() に合わせる。
CREATE POLICY saas_inquiries_admin ON saas_inquiries FOR ALL
  USING (auth_teacher_role() = 'admin')
  WITH CHECK (auth_teacher_role() = 'admin');

-- INSERT ポリシーは意図的に作らない。
-- → anon キーからは書けず、/api/lp/inquiry（service role）だけが受け付ける。
