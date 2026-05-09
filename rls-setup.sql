-- ============================================================
-- RLS（行レベルセキュリティ）設定
-- Supabase SQL Editor で実行してください
-- ============================================================

-- ============================================================
-- STEP 1: ヘルパー関数（auth.email() を使用）
-- ============================================================

CREATE OR REPLACE FUNCTION auth_teacher_role()
RETURNS text LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT role FROM teachers WHERE email = auth.email() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION auth_teacher_group()
RETURNS text LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT s.group_name FROM teachers t
  LEFT JOIN schools s ON s.id = t.school_id
  WHERE t.email = auth.email() LIMIT 1;
$$;

-- ============================================================
-- STEP 2: schools テーブル
--   読み取り：ログイン済み講師なら全員可（グループ絞り込みはアプリ側）
--   書き込み：管理者のみ
-- ============================================================
ALTER TABLE schools ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "schools_select" ON schools;
CREATE POLICY "schools_select" ON schools FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "schools_insert" ON schools FOR INSERT WITH CHECK (auth_teacher_role() = 'admin');
CREATE POLICY "schools_update" ON schools FOR UPDATE USING (auth_teacher_role() = 'admin');
CREATE POLICY "schools_delete" ON schools FOR DELETE USING (auth_teacher_role() = 'admin');

-- ============================================================
-- STEP 3: teachers テーブル
--   読み取り・書き込み：ログイン済み講師なら全員可
-- ============================================================
ALTER TABLE teachers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "teachers_select" ON teachers;
DROP POLICY IF EXISTS "teachers_insert" ON teachers;
DROP POLICY IF EXISTS "teachers_update" ON teachers;
DROP POLICY IF EXISTS "teachers_delete" ON teachers;
CREATE POLICY "teachers_select" ON teachers FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "teachers_insert" ON teachers FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "teachers_update" ON teachers FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "teachers_delete" ON teachers FOR DELETE USING (auth.uid() IS NOT NULL);

-- ============================================================
-- STEP 4: students テーブル
--   読み取り・書き込み：ログイン済み講師なら全員可
-- ============================================================
ALTER TABLE students ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "students_select" ON students;
DROP POLICY IF EXISTS "students_insert" ON students;
DROP POLICY IF EXISTS "students_update" ON students;
DROP POLICY IF EXISTS "students_delete" ON students;
CREATE POLICY "students_select" ON students FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "students_insert" ON students FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "students_update" ON students FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "students_delete" ON students FOR DELETE USING (auth.uid() IS NOT NULL);

-- ============================================================
-- STEP 5: tests テーブル
--   全員が読める（生徒のテスト受験に必要）
--   書き込みはログイン済み講師のみ
-- ============================================================
ALTER TABLE tests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tests_select_public" ON tests FOR SELECT USING (true);
CREATE POLICY "tests_insert" ON tests FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "tests_update" ON tests FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "tests_delete" ON tests FOR DELETE USING (auth.uid() IS NOT NULL);

-- ============================================================
-- STEP 6: questions テーブル
--   全員が読める（生徒のテスト受験に必要）
-- ============================================================
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "questions_select_public" ON questions FOR SELECT USING (true);
CREATE POLICY "questions_insert" ON questions FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "questions_update" ON questions FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "questions_delete" ON questions FOR DELETE USING (auth.uid() IS NOT NULL);

-- ============================================================
-- STEP 7: test_sessions テーブル
--   全員が読める（URLトークンで受験するため）
-- ============================================================
ALTER TABLE test_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "test_sessions_select_public" ON test_sessions FOR SELECT USING (true);
CREATE POLICY "test_sessions_insert" ON test_sessions FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "test_sessions_delete" ON test_sessions FOR DELETE USING (auth.uid() IS NOT NULL);

-- ============================================================
-- STEP 8: answers テーブル
--   生徒が認証なしで回答送信可、閲覧はログイン済み講師のみ
-- ============================================================
ALTER TABLE answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "answers_insert_public" ON answers FOR INSERT WITH CHECK (true);
CREATE POLICY "answers_select" ON answers FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "answers_update" ON answers FOR UPDATE USING (auth.uid() IS NOT NULL);

-- ============================================================
-- STEP 9: results テーブル
--   全員が読み書き可（生徒が結果送信・確認するため）
-- ============================================================
ALTER TABLE results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "results_insert_public" ON results FOR INSERT WITH CHECK (true);
CREATE POLICY "results_select_public" ON results FOR SELECT USING (true);

-- ============================================================
-- STEP 10: student_test_assignments テーブル
-- ============================================================
ALTER TABLE student_test_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sta_select_public" ON student_test_assignments FOR SELECT USING (true);
CREATE POLICY "sta_insert" ON student_test_assignments FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "sta_update" ON student_test_assignments FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "sta_delete" ON student_test_assignments FOR DELETE USING (auth.uid() IS NOT NULL);

-- ============================================================
-- STEP 11: questionnaire_responses テーブル（多層診断）
-- ============================================================
ALTER TABLE questionnaire_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "qr_select" ON questionnaire_responses;
DROP POLICY IF EXISTS "qr_update" ON questionnaire_responses;
DROP POLICY IF EXISTS "qr_delete" ON questionnaire_responses;
CREATE POLICY "qr_insert_public" ON questionnaire_responses FOR INSERT WITH CHECK (true);
CREATE POLICY "qr_select" ON questionnaire_responses FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "qr_update" ON questionnaire_responses FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "qr_delete" ON questionnaire_responses FOR DELETE USING (auth.uid() IS NOT NULL);

-- ============================================================
-- STEP 12: learning_plans テーブル（カルテ）
--   status = 'shared' なら全員が読める
-- ============================================================
ALTER TABLE learning_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "learning_plans_select" ON learning_plans FOR SELECT USING (
  status = 'shared' OR auth.uid() IS NOT NULL
);
CREATE POLICY "learning_plans_insert" ON learning_plans FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "learning_plans_update" ON learning_plans FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "learning_plans_delete" ON learning_plans FOR DELETE USING (auth.uid() IS NOT NULL);

-- ============================================================
-- STEP 13: textbooks テーブル
--   全員が読める、追加・削除は管理者のみ
-- ============================================================
ALTER TABLE textbooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "textbooks_select_public" ON textbooks FOR SELECT USING (true);
CREATE POLICY "textbooks_insert" ON textbooks FOR INSERT WITH CHECK (auth_teacher_role() = 'admin');
CREATE POLICY "textbooks_update" ON textbooks FOR UPDATE USING (auth_teacher_role() = 'admin');
CREATE POLICY "textbooks_delete" ON textbooks FOR DELETE USING (auth_teacher_role() = 'admin');
