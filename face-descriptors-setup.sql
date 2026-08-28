-- ============================================================
-- face_descriptors（顔認証の特徴量）の定義とRLS
--   背景: このテーブルだけリポジトリに定義が無く、RLSも掛かっていなかったため、
--         公開されている anon キーで生徒・講師の顔データを全件ダウンロードできた。
--         顔の特徴量は生体情報なので、外から読めない状態にする。
--   前提: 照合は /api/face/match（service role）が行う。service role は RLS を貫通するので
--         kiosk（未ログイン端末）からのチェックインは今までどおり動く。
--         登録・削除は講師ダッシュボード（ログイン済み）から行う。
--   Supabase SQL Editor で実行。冪等（何度流してもよい）。
-- ============================================================

CREATE TABLE IF NOT EXISTS face_descriptors (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_type text NOT NULL CHECK (person_type IN ('teacher', 'student')),
  person_id   uuid NOT NULL,
  descriptor  jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS face_descriptors_person_idx
  ON face_descriptors (person_type, person_id);

-- ヘルパー（rls-stage1 と同じもの。単体実行できるよう再定義）
CREATE OR REPLACE FUNCTION auth_is_teacher()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM teachers WHERE email = auth.email());
$$;

-- 既存ポリシーを一旦すべて削除（取りこぼし＝残存permissiveを防ぐ）
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'face_descriptors'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.face_descriptors', p.policyname);
  END LOOP;
END $$;

ALTER TABLE face_descriptors ENABLE ROW LEVEL SECURITY;

-- 講師（ログイン済み）だけが登録状況の確認・登録・撮り直しをできる。
-- 未ログイン(anon)は読めない＝顔データを外から取得できない。
CREATE POLICY "face_descriptors_select" ON face_descriptors
  FOR SELECT USING (auth_is_teacher());
CREATE POLICY "face_descriptors_insert" ON face_descriptors
  FOR INSERT WITH CHECK (auth_is_teacher());
CREATE POLICY "face_descriptors_delete" ON face_descriptors
  FOR DELETE USING (auth_is_teacher());
