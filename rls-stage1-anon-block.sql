-- ============================================================
-- RLS Stage1: 匿名(未ログイン)からの読み取りを遮断する
--   背景: students/teachers/answers/results/questionnaire_responses/
--         learning_plans は RLS が「未有効化」のままで、anonキーで
--         インターネットから全件読めてしまっていた（生徒128件等）。
--   方針(Stage1): 「ログイン済みなら読める／未ログインは遮断」。
--         家庭ごとの完全分離(保護者は自分の子のみ)は Stage2 で対応。
--   ⚠ サーバ側で anon キーでこれらを読む API は service role へ変更済み
--     （notify / notify-announcement / diagnosis-from-questionnaire /
--       student-create / parent-delete）。service role は RLS を貫通する。
--   Supabase SQL Editor で実行。冪等（何度流してもよい）。
-- ============================================================

-- ヘルパー（既存だが単体実行できるよう再定義）
CREATE OR REPLACE FUNCTION auth_is_teacher()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM teachers WHERE email = auth.email());
$$;
CREATE OR REPLACE FUNCTION auth_teacher_role()
RETURNS text LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT role FROM teachers WHERE email = auth.email() LIMIT 1;
$$;

-- 各テーブルの既存ポリシーを一旦すべて削除する（取りこぼし＝残存permissiveを防ぐ）
DO $$
DECLARE p record; t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['students','teachers','answers','results','questionnaire_responses','learning_plans']
  LOOP
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, t);
    END LOOP;
  END LOOP;
END $$;

-- ── students：閲覧=ログイン済み全員／書込=講師 ──
CREATE POLICY "students_select" ON students FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "students_insert" ON students FOR INSERT WITH CHECK (auth_is_teacher());
CREATE POLICY "students_update" ON students FOR UPDATE USING (auth_is_teacher());
CREATE POLICY "students_delete" ON students FOR DELETE USING (auth_is_teacher());

-- ── teachers：閲覧=ログイン済み全員／書込=管理者 ──
CREATE POLICY "teachers_select" ON teachers FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "teachers_insert" ON teachers FOR INSERT WITH CHECK (auth_teacher_role() = 'admin');
CREATE POLICY "teachers_update" ON teachers FOR UPDATE USING (auth_teacher_role() = 'admin');
CREATE POLICY "teachers_delete" ON teachers FOR DELETE USING (auth_teacher_role() = 'admin');

-- ── answers：閲覧=ログイン済み／INSERT=受験提出のため公開維持／UPDATE=講師 ──
CREATE POLICY "answers_select" ON answers FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "answers_insert_public" ON answers FOR INSERT WITH CHECK (true);
CREATE POLICY "answers_update" ON answers FOR UPDATE USING (auth_is_teacher());

-- ── results：閲覧=ログイン済み／INSERT=受験提出のため公開維持 ──
CREATE POLICY "results_select" ON results FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "results_insert_public" ON results FOR INSERT WITH CHECK (true);

-- ── questionnaire_responses：閲覧=ログイン済み／INSERT=受験提出のため公開維持／更新削除=講師 ──
CREATE POLICY "qr_select" ON questionnaire_responses FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "qr_insert_public" ON questionnaire_responses FOR INSERT WITH CHECK (true);
CREATE POLICY "qr_update" ON questionnaire_responses FOR UPDATE USING (auth_is_teacher());
CREATE POLICY "qr_delete" ON questionnaire_responses FOR DELETE USING (auth_is_teacher());

-- ── learning_plans（カルテ）：閲覧=ログイン済み／書込=講師 ──
CREATE POLICY "learning_plans_select" ON learning_plans FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "learning_plans_insert" ON learning_plans FOR INSERT WITH CHECK (auth_is_teacher());
CREATE POLICY "learning_plans_update" ON learning_plans FOR UPDATE USING (auth_is_teacher());
CREATE POLICY "learning_plans_delete" ON learning_plans FOR DELETE USING (auth_is_teacher());

-- RLS を有効化（これが無いと上のポリシーは無視され素通りになる＝今回の漏れの原因）
ALTER TABLE students                ENABLE ROW LEVEL SECURITY;
ALTER TABLE teachers                ENABLE ROW LEVEL SECURITY;
ALTER TABLE answers                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE results                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE questionnaire_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_plans          ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Stage2（後日）の宿題：
--   ・answers/results/qr の INSERT 公開を廃し、test/submit を service role 化
--   ・保護者は自分の子のみ／生徒は自分のみ、に SELECT を絞る
--     （parent-portal-setup.sql の auth_parent_student_ids()/_names() を流用）
--   ・questions の correct_answer 公開を get_test_questions RPC 経由に
-- ============================================================
