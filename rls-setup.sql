-- ============================================================
-- RLS（行レベルセキュリティ）設定
-- Supabase SQL Editor で実行してください
-- ============================================================

-- ============================================================
-- STEP 1: ヘルパー関数
--   SECURITY DEFINER で実行するため、RLS有効後も内部でテーブルを参照できる
-- ============================================================

-- ログイン中の講師の役職を返す（認証なし→ NULL）
CREATE OR REPLACE FUNCTION auth_teacher_role()
RETURNS text LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT role FROM teachers
  WHERE email = auth.jwt() ->> 'email'
  LIMIT 1;
$$;

-- ログイン中の講師のグループ名を返す（認証なし→ NULL）
CREATE OR REPLACE FUNCTION auth_teacher_group()
RETURNS text LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT s.group_name
  FROM teachers t
  LEFT JOIN schools s ON s.id = t.school_id
  WHERE t.email = auth.jwt() ->> 'email'
  LIMIT 1;
$$;

-- ============================================================
-- STEP 2: schools テーブル
--   管理者：全校舎を操作可
--   一般講師：同じグループの校舎を閲覧のみ
-- ============================================================
ALTER TABLE schools ENABLE ROW LEVEL SECURITY;

CREATE POLICY "schools_select" ON schools FOR SELECT USING (
  auth_teacher_role() = 'admin'
  OR (auth_teacher_group() IS NOT NULL AND group_name = auth_teacher_group())
);
CREATE POLICY "schools_insert" ON schools FOR INSERT WITH CHECK (auth_teacher_role() = 'admin');
CREATE POLICY "schools_update" ON schools FOR UPDATE USING (auth_teacher_role() = 'admin');
CREATE POLICY "schools_delete" ON schools FOR DELETE USING (auth_teacher_role() = 'admin');

-- ============================================================
-- STEP 3: teachers テーブル
--   管理者：全講師を操作可
--   一般講師：同グループの講師を閲覧 ＋ 自分のレコードを更新可
-- ============================================================
ALTER TABLE teachers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "teachers_select" ON teachers FOR SELECT USING (
  auth_teacher_role() = 'admin'
  OR email = auth.jwt() ->> 'email'
  OR school_id IN (
    SELECT id FROM schools WHERE group_name = auth_teacher_group()
  )
);
CREATE POLICY "teachers_insert" ON teachers FOR INSERT WITH CHECK (auth_teacher_role() = 'admin');
CREATE POLICY "teachers_update" ON teachers FOR UPDATE USING (
  auth_teacher_role() = 'admin'
  OR email = auth.jwt() ->> 'email'
);
CREATE POLICY "teachers_delete" ON teachers FOR DELETE USING (auth_teacher_role() = 'admin');

-- ============================================================
-- STEP 4: students テーブル
--   管理者：全生徒を操作可
--   一般講師：同グループの校舎の生徒を閲覧・操作可
-- ============================================================
ALTER TABLE students ENABLE ROW LEVEL SECURITY;

CREATE POLICY "students_select" ON students FOR SELECT USING (
  auth_teacher_role() = 'admin'
  OR school_id IN (
    SELECT id FROM schools WHERE group_name = auth_teacher_group()
  )
);
CREATE POLICY "students_insert" ON students FOR INSERT WITH CHECK (
  auth_teacher_role() IN ('admin', 'teacher', 'part-time')
);
CREATE POLICY "students_update" ON students FOR UPDATE USING (
  auth_teacher_role() IN ('admin', 'teacher', 'part-time')
);
CREATE POLICY "students_delete" ON students FOR DELETE USING (
  auth_teacher_role() IN ('admin', 'teacher', 'part-time')
);

-- ============================================================
-- STEP 5: tests テーブル
--   全員が読める（生徒のテスト受験に必要）
--   書き込みは認証済み講師のみ
-- ============================================================
ALTER TABLE tests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tests_select_public" ON tests FOR SELECT USING (true);
CREATE POLICY "tests_insert" ON tests FOR INSERT WITH CHECK (auth_teacher_role() IS NOT NULL);
CREATE POLICY "tests_update" ON tests FOR UPDATE USING (auth_teacher_role() IS NOT NULL);
CREATE POLICY "tests_delete" ON tests FOR DELETE USING (auth_teacher_role() IS NOT NULL);

-- ============================================================
-- STEP 6: questions テーブル
--   全員が読める（生徒のテスト受験に必要）
--   書き込みは認証済み講師のみ
-- ============================================================
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "questions_select_public" ON questions FOR SELECT USING (true);
CREATE POLICY "questions_insert" ON questions FOR INSERT WITH CHECK (auth_teacher_role() IS NOT NULL);
CREATE POLICY "questions_update" ON questions FOR UPDATE USING (auth_teacher_role() IS NOT NULL);
CREATE POLICY "questions_delete" ON questions FOR DELETE USING (auth_teacher_role() IS NOT NULL);

-- ============================================================
-- STEP 7: test_sessions テーブル
--   全員が読める（URLトークンで受験するため）
--   書き込みは認証済み講師のみ
-- ============================================================
ALTER TABLE test_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "test_sessions_select_public" ON test_sessions FOR SELECT USING (true);
CREATE POLICY "test_sessions_insert" ON test_sessions FOR INSERT WITH CHECK (auth_teacher_role() IS NOT NULL);
CREATE POLICY "test_sessions_delete" ON test_sessions FOR DELETE USING (auth_teacher_role() IS NOT NULL);

-- ============================================================
-- STEP 8: answers テーブル
--   生徒が認証なしで回答を送信できる
--   閲覧は認証済み講師のみ
-- ============================================================
ALTER TABLE answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "answers_insert_public" ON answers FOR INSERT WITH CHECK (true);
CREATE POLICY "answers_select" ON answers FOR SELECT USING (auth_teacher_role() IS NOT NULL);
CREATE POLICY "answers_update" ON answers FOR UPDATE USING (auth_teacher_role() IS NOT NULL);

-- ============================================================
-- STEP 9: results テーブル
--   生徒が認証なしで結果を送信できる
--   結果確認画面のため全員が読める
-- ============================================================
ALTER TABLE results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "results_insert_public" ON results FOR INSERT WITH CHECK (true);
CREATE POLICY "results_select_public" ON results FOR SELECT USING (true);

-- ============================================================
-- STEP 10: student_test_assignments テーブル
--   全員が読める（来塾カレンダーの表示に必要）
--   書き込みは認証済み講師のみ
-- ============================================================
ALTER TABLE student_test_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sta_select_public" ON student_test_assignments FOR SELECT USING (true);
CREATE POLICY "sta_insert" ON student_test_assignments FOR INSERT WITH CHECK (auth_teacher_role() IS NOT NULL);
CREATE POLICY "sta_update" ON student_test_assignments FOR UPDATE USING (auth_teacher_role() IS NOT NULL);
CREATE POLICY "sta_delete" ON student_test_assignments FOR DELETE USING (auth_teacher_role() IS NOT NULL);

-- ============================================================
-- STEP 11: questionnaire_responses テーブル（多層診断）
--   誰でも送信可（生徒・保護者が回答）
--   閲覧・更新は認証済み講師のみ
-- ============================================================
ALTER TABLE questionnaire_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "qr_insert_public" ON questionnaire_responses FOR INSERT WITH CHECK (true);
CREATE POLICY "qr_select" ON questionnaire_responses FOR SELECT USING (auth_teacher_role() IS NOT NULL);
CREATE POLICY "qr_update" ON questionnaire_responses FOR UPDATE USING (auth_teacher_role() IS NOT NULL);
CREATE POLICY "qr_delete" ON questionnaire_responses FOR DELETE USING (auth_teacher_role() IS NOT NULL);

-- ============================================================
-- STEP 12: test_assignments テーブル（存在する場合）
-- ============================================================
ALTER TABLE test_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "test_assignments_select" ON test_assignments FOR SELECT USING (true);
CREATE POLICY "test_assignments_insert" ON test_assignments FOR INSERT WITH CHECK (auth_teacher_role() IS NOT NULL);
CREATE POLICY "test_assignments_delete" ON test_assignments FOR DELETE USING (auth_teacher_role() IS NOT NULL);

-- ============================================================
-- STEP 13: lesson_reports テーブル（存在する場合）
-- ============================================================
ALTER TABLE lesson_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lesson_reports_select" ON lesson_reports FOR SELECT USING (auth_teacher_role() IS NOT NULL);
CREATE POLICY "lesson_reports_insert" ON lesson_reports FOR INSERT WITH CHECK (auth_teacher_role() IS NOT NULL);
CREATE POLICY "lesson_reports_update" ON lesson_reports FOR UPDATE USING (auth_teacher_role() IS NOT NULL);
CREATE POLICY "lesson_reports_delete" ON lesson_reports FOR DELETE USING (auth_teacher_role() IS NOT NULL);

-- ============================================================
-- STEP 14: learning_plans テーブル（カルテ・存在する場合）
--   status = 'shared' なら全員が読める（生徒・保護者への共有）
-- ============================================================
ALTER TABLE learning_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "learning_plans_select" ON learning_plans FOR SELECT USING (
  status = 'shared'
  OR auth_teacher_role() IS NOT NULL
);
CREATE POLICY "learning_plans_insert" ON learning_plans FOR INSERT WITH CHECK (auth_teacher_role() IS NOT NULL);
CREATE POLICY "learning_plans_update" ON learning_plans FOR UPDATE USING (auth_teacher_role() IS NOT NULL);
CREATE POLICY "learning_plans_delete" ON learning_plans FOR DELETE USING (auth_teacher_role() IS NOT NULL);

-- ============================================================
-- STEP 15: diagnoses テーブル（存在する場合）
--   管理者：全件
--   一般講師：同グループの校舎の生徒の診断のみ
-- ============================================================
ALTER TABLE diagnoses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "diagnoses_select" ON diagnoses FOR SELECT USING (
  auth_teacher_role() = 'admin'
  OR student_id IN (
    SELECT st.id FROM students st
    JOIN schools s ON s.id = st.school_id
    WHERE s.group_name = auth_teacher_group()
  )
);
CREATE POLICY "diagnoses_insert" ON diagnoses FOR INSERT WITH CHECK (auth_teacher_role() IS NOT NULL);
CREATE POLICY "diagnoses_update" ON diagnoses FOR UPDATE USING (auth_teacher_role() IS NOT NULL);
CREATE POLICY "diagnoses_delete" ON diagnoses FOR DELETE USING (auth_teacher_role() IS NOT NULL);

-- ============================================================
-- STEP 16: textbooks テーブル（存在する場合）
--   全員が読める（カルテ作成時に教材一覧を参照）
--   追加・削除は管理者のみ
-- ============================================================
ALTER TABLE textbooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "textbooks_select_public" ON textbooks FOR SELECT USING (true);
CREATE POLICY "textbooks_insert" ON textbooks FOR INSERT WITH CHECK (auth_teacher_role() = 'admin');
CREATE POLICY "textbooks_update" ON textbooks FOR UPDATE USING (auth_teacher_role() = 'admin');
CREATE POLICY "textbooks_delete" ON textbooks FOR DELETE USING (auth_teacher_role() = 'admin');
