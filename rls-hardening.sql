-- ============================================================
-- RLS 強化（セキュリティ監査対応）
--   旧 rls-setup.sql のコアテーブルは「ログインしていれば誰でも全行 read/write」
--   になっており、生徒・保護者アカウントでも全データ閲覧／改変、さらに
--   teachers への自己 INSERT による管理者権限昇格が可能だった。
--   本ファイルはそれを「講師（admin/teacher）」「本人」スコープに締め直す。
--
--   ⚠ 適用前に必ずステージングで検証すること。
--   ⚠ 本番に既に admin 講師が存在することを確認してから実行すること
--      （teachers 書込みを admin 限定にするため、admin が居ないと講師追加が
--        できなくなる。初期 admin は Supabase SQL Editor から service_role で投入）。
--   Supabase SQL Editor で実行してください。
-- ============================================================

-- ============================================================
-- STEP 0: ヘルパー関数（単体実行できるよう再定義）
-- ============================================================
CREATE OR REPLACE FUNCTION auth_is_teacher()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM teachers WHERE email = auth.email());
$$;

CREATE OR REPLACE FUNCTION auth_teacher_role()
RETURNS text LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT role FROM teachers WHERE email = auth.email() LIMIT 1;
$$;

-- ============================================================
-- STEP 1: teachers ── 権限昇格の根を断つ
--   読み取り：講師のみ（生徒・保護者には講師一覧を見せない）
--   書き込み：管理者のみ
-- ============================================================
DROP POLICY IF EXISTS "teachers_select" ON teachers;
DROP POLICY IF EXISTS "teachers_insert" ON teachers;
DROP POLICY IF EXISTS "teachers_update" ON teachers;
DROP POLICY IF EXISTS "teachers_delete" ON teachers;

CREATE POLICY "teachers_select" ON teachers FOR SELECT
  USING (auth_is_teacher());
CREATE POLICY "teachers_insert" ON teachers FOR INSERT
  WITH CHECK (auth_teacher_role() = 'admin');
CREATE POLICY "teachers_update" ON teachers FOR UPDATE
  USING (auth_teacher_role() = 'admin');
CREATE POLICY "teachers_delete" ON teachers FOR DELETE
  USING (auth_teacher_role() = 'admin');

-- ============================================================
-- STEP 2: students
--   読み取り：講師、または本人（auth_user_id 紐付け）
--   書き込み：講師のみ
-- ============================================================
DROP POLICY IF EXISTS "students_select" ON students;
DROP POLICY IF EXISTS "students_insert" ON students;
DROP POLICY IF EXISTS "students_update" ON students;
DROP POLICY IF EXISTS "students_delete" ON students;

CREATE POLICY "students_select" ON students FOR SELECT
  USING (auth_is_teacher() OR auth_user_id = auth.uid());
CREATE POLICY "students_insert" ON students FOR INSERT
  WITH CHECK (auth_is_teacher());
CREATE POLICY "students_update" ON students FOR UPDATE
  USING (auth_is_teacher());
CREATE POLICY "students_delete" ON students FOR DELETE
  USING (auth_is_teacher());

-- ============================================================
-- STEP 3: results ── 全件 public read を撤廃
--   読み取り：講師のみ（生徒は提出APIのレスポンスで自分の点数を受け取る）
--   書き込み：受験フロー維持のため INSERT は public のまま
-- ============================================================
DROP POLICY IF EXISTS "results_select_public" ON results;
DROP POLICY IF EXISTS "results_insert_public" ON results;

CREATE POLICY "results_select" ON results FOR SELECT
  USING (auth_is_teacher());
-- 匿名生徒の受験提出を許可（必要に応じ Edge Function / service_role 経由に置換推奨）
CREATE POLICY "results_insert_public" ON results FOR INSERT
  WITH CHECK (true);

-- ============================================================
-- STEP 4: answers
--   読み取り：講師のみ（既存どおり）／INSERT は受験フロー維持で public
-- ============================================================
DROP POLICY IF EXISTS "answers_select" ON answers;
DROP POLICY IF EXISTS "answers_update" ON answers;

CREATE POLICY "answers_select" ON answers FOR SELECT
  USING (auth_is_teacher());
CREATE POLICY "answers_update" ON answers FOR UPDATE
  USING (auth_is_teacher());
-- answers_insert_public（WITH CHECK true）は受験提出に必要なため維持

-- ============================================================
-- STEP 5: questionnaire_responses（多層診断）
--   読み取り・更新・削除：講師のみ（旧: ログイン済みなら誰でも）
--   INSERT：受験フロー維持で public
-- ============================================================
DROP POLICY IF EXISTS "qr_select" ON questionnaire_responses;
DROP POLICY IF EXISTS "qr_update" ON questionnaire_responses;
DROP POLICY IF EXISTS "qr_delete" ON questionnaire_responses;

CREATE POLICY "qr_select" ON questionnaire_responses FOR SELECT
  USING (auth_is_teacher());
CREATE POLICY "qr_update" ON questionnaire_responses FOR UPDATE
  USING (auth_is_teacher());
CREATE POLICY "qr_delete" ON questionnaire_responses FOR DELETE
  USING (auth_is_teacher());
-- qr_insert_public（WITH CHECK true）は維持

-- ============================================================
-- STEP 6: learning_plans（カルテ）
--   読み取り：共有済み(shared) または 講師（旧: shared OR ログイン済み誰でも）
--   ※ 保護者・生徒の個別閲覧は parent-portal-setup.sql 側のポリシーで担保
--   書き込み：講師のみ
-- ============================================================
DROP POLICY IF EXISTS "learning_plans_select" ON learning_plans;
DROP POLICY IF EXISTS "learning_plans_insert" ON learning_plans;
DROP POLICY IF EXISTS "learning_plans_update" ON learning_plans;
DROP POLICY IF EXISTS "learning_plans_delete" ON learning_plans;

CREATE POLICY "learning_plans_select" ON learning_plans FOR SELECT
  USING (status = 'shared' OR auth_is_teacher());
CREATE POLICY "learning_plans_insert" ON learning_plans FOR INSERT
  WITH CHECK (auth_is_teacher());
CREATE POLICY "learning_plans_update" ON learning_plans FOR UPDATE
  USING (auth_is_teacher());
CREATE POLICY "learning_plans_delete" ON learning_plans FOR DELETE
  USING (auth_is_teacher());

-- ============================================================
-- STEP 7: student_test_assignments
--   読み取り：受験フロー維持のため public のまま（割当の存在のみ）
--   書き込み：講師のみ（既存どおり）
--   ※ より厳密にするなら token 紐付けの SECURITY DEFINER 関数経由を推奨
-- ============================================================
-- 既存ポリシー（sta_*）の書込みは auth.uid() IS NOT NULL → 講師限定へ
DROP POLICY IF EXISTS "sta_insert" ON student_test_assignments;
DROP POLICY IF EXISTS "sta_update" ON student_test_assignments;
DROP POLICY IF EXISTS "sta_delete" ON student_test_assignments;
CREATE POLICY "sta_insert" ON student_test_assignments FOR INSERT WITH CHECK (auth_is_teacher());
CREATE POLICY "sta_update" ON student_test_assignments FOR UPDATE USING (auth_is_teacher());
CREATE POLICY "sta_delete" ON student_test_assignments FOR DELETE USING (auth_is_teacher());

-- ============================================================
-- STEP 8: tests / questions の書き込みを講師限定へ
--   （SELECT は匿名受験のため public のまま。ただし questions は correct_answer を
--     含むため、本来は下記 RPC 経由で出題し、questions の直接 SELECT は講師限定に
--     するのが望ましい。アプリ側で correct_answer を生徒へ送らない対応と併用すること）
-- ============================================================
DROP POLICY IF EXISTS "tests_insert" ON tests;
DROP POLICY IF EXISTS "tests_update" ON tests;
DROP POLICY IF EXISTS "tests_delete" ON tests;
CREATE POLICY "tests_insert" ON tests FOR INSERT WITH CHECK (auth_is_teacher());
CREATE POLICY "tests_update" ON tests FOR UPDATE USING (auth_is_teacher());
CREATE POLICY "tests_delete" ON tests FOR DELETE USING (auth_is_teacher());

DROP POLICY IF EXISTS "questions_insert" ON questions;
DROP POLICY IF EXISTS "questions_update" ON questions;
DROP POLICY IF EXISTS "questions_delete" ON questions;
CREATE POLICY "questions_insert" ON questions FOR INSERT WITH CHECK (auth_is_teacher());
CREATE POLICY "questions_update" ON questions FOR UPDATE USING (auth_is_teacher());
CREATE POLICY "questions_delete" ON questions FOR DELETE USING (auth_is_teacher());

-- ============================================================
-- （推奨・任意）出題用 RPC：correct_answer を伏せて出題する
--   これを導入したら questions_select_public を廃止し、questions の SELECT を
--   講師限定にできる。アプリの受験ページは supabase.rpc('get_test_questions', { token })
--   を使うよう変更する。
-- ============================================================
-- CREATE OR REPLACE FUNCTION get_test_questions(p_token text)
-- RETURNS TABLE (id uuid, test_id uuid, type text, text text, options jsonb, order_index int, points int)
-- LANGUAGE sql SECURITY DEFINER STABLE AS $$
--   SELECT q.id, q.test_id, q.type, q.text, q.options, q.order_index, q.points
--   FROM questions q
--   JOIN test_sessions ts ON ts.test_id = q.test_id
--   WHERE ts.url_token = p_token
--   ORDER BY q.order_index;
-- $$;
-- GRANT EXECUTE ON FUNCTION get_test_questions(text) TO anon, authenticated;
