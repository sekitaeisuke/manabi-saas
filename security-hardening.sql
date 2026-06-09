-- ============================================================
-- セキュリティ強化マイグレーション
-- rls-setup.sql / parent-portal-setup.sql を適用済みの環境に「後追い」で適用する。
--
-- 背景:
--   ・API ルートはアプリ層で認可（requireTeacher 等）し、特権書き込みは
--     service role クライアントで行う（RLS をバイパス）ように変更済み。
--   ・よって「匿名 INSERT を許可する」ポリシーは不要になり、悪用経路になるため削除する。
--   ・students/teachers が「ログイン済みなら誰でも全件閲覧可」だったのを、
--     講師・本人・紐付く保護者のみに絞る（未成年 PII の漏えい対策）。
--
-- ⚠ 重要: 本番適用前に必ず Supabase のステージング環境で実行し、
--    講師／保護者／生徒の各ダッシュボードが正常に表示されることを確認すること。
--    （クライアントから直接 select している箇所が広範なため）
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- STEP 0: ヘルパー関数
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION auth_is_teacher()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM teachers WHERE email = auth.email());
$$;

-- ログイン中ユーザに対応する parents.id（保護者でなければ NULL）
CREATE OR REPLACE FUNCTION auth_parent_id()
RETURNS uuid LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT id FROM parents WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

-- ============================================================
-- SECTION A: 匿名 INSERT 経路の閉鎖（適用は比較的安全）
--   生徒のテスト提出はサーバ API（service role）経由に変更済みのため、
--   匿名クライアントからの直接 INSERT は不要。閲覧は引き続き講師に許可。
-- ============================================================

-- answers: 匿名 INSERT を廃止。閲覧・更新は講師のみ。
DROP POLICY IF EXISTS "answers_insert_public" ON answers;
DROP POLICY IF EXISTS "answers_select"        ON answers;
DROP POLICY IF EXISTS "answers_update"        ON answers;
CREATE POLICY "answers_select_teacher" ON answers FOR SELECT USING (auth_is_teacher());
CREATE POLICY "answers_update_teacher" ON answers FOR UPDATE USING (auth_is_teacher());

-- results: 匿名 INSERT / 匿名 SELECT を廃止。閲覧は講師のみ。
DROP POLICY IF EXISTS "results_insert_public" ON results;
DROP POLICY IF EXISTS "results_select_public" ON results;
CREATE POLICY "results_select_teacher" ON results FOR SELECT USING (auth_is_teacher());

-- questionnaire_responses: 匿名 INSERT を廃止。閲覧・更新は講師のみ。
DROP POLICY IF EXISTS "qr_insert_public" ON questionnaire_responses;
DROP POLICY IF EXISTS "qr_select"        ON questionnaire_responses;
DROP POLICY IF EXISTS "qr_update"        ON questionnaire_responses;
CREATE POLICY "qr_select_teacher" ON questionnaire_responses FOR SELECT USING (auth_is_teacher());
CREATE POLICY "qr_update_teacher" ON questionnaire_responses FOR UPDATE USING (auth_is_teacher());

-- student_test_assignments: 匿名 SELECT を廃止し、ログイン済みのみに。
DROP POLICY IF EXISTS "sta_select_public" ON student_test_assignments;
CREATE POLICY "sta_select_authed" ON student_test_assignments
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- ============================================================
-- SECTION B: 未成年 PII のスコープ制限（★本番前に必ずステージング検証）
--   students を「講師 / 本人 / 紐付く保護者」のみ閲覧可に絞る。
--   書き込み（追加・更新・削除）は講師のみ。
-- ============================================================
DROP POLICY IF EXISTS "students_select" ON students;
DROP POLICY IF EXISTS "students_insert" ON students;
DROP POLICY IF EXISTS "students_update" ON students;
DROP POLICY IF EXISTS "students_delete" ON students;

CREATE POLICY "students_select" ON students FOR SELECT USING (
  auth_is_teacher()
  OR students.auth_user_id = auth.uid()  -- 生徒本人
  OR EXISTS (
    SELECT 1 FROM parent_student_links l
    WHERE l.student_id = students.id
      AND l.parent_id = auth_parent_id()
  )
);
CREATE POLICY "students_insert" ON students FOR INSERT WITH CHECK (auth_is_teacher());
CREATE POLICY "students_update" ON students FOR UPDATE USING (auth_is_teacher());
CREATE POLICY "students_delete" ON students FOR DELETE USING (auth_is_teacher());

-- teachers テーブルの書き込みは講師のみに絞る（閲覧はメッセージ等で参照され得るため
-- ログイン済み全員のまま据え置き。必要なら下の select も講師限定に変更すること）。
DROP POLICY IF EXISTS "teachers_insert" ON teachers;
DROP POLICY IF EXISTS "teachers_update" ON teachers;
DROP POLICY IF EXISTS "teachers_delete" ON teachers;
CREATE POLICY "teachers_insert" ON teachers FOR INSERT WITH CHECK (auth_is_teacher());
CREATE POLICY "teachers_update" ON teachers FOR UPDATE USING (auth_is_teacher());
CREATE POLICY "teachers_delete" ON teachers FOR DELETE USING (auth_is_teacher());

-- ============================================================
-- SECTION C: 残存リスク（要追加対応・本マイグレーションには含めない）
-- ------------------------------------------------------------
-- 1) questions.correct_answer / points が匿名（テスト受験ページ）から読める。
--    行レベルではなく「列レベル」の制御が必要。テスト受験ページの
--    select を正答カラム抜きに変更したうえで、以下を適用する想定:
--
--      REVOKE SELECT ON questions FROM anon;
--      GRANT SELECT (id, test_id, type, text, options, order_index, points)
--        ON questions TO anon;
--      -- correct_answer は anon に付与しない（採点はサーバ側で実施）
--
--    ※ 採点はサーバ（/api/test/submit）が DB の正答で行うため、
--      クライアントに正答を渡す必要はなくなっている。
--
-- 2) tests / questions / test_sessions は匿名 SELECT 可のまま
--    （URLトークンでの受験フローに必要）。トークンを知らなくても全件
--    列挙できてしまうため、本来は「有効な url_token 経由」に絞るのが望ましい。
--
-- 3) レート制限（AI 生成・公開フォーム）は DB/RLS では実現できない。
--    別途エッジ（middleware / WAF / Upstash 等）での導入を推奨。
-- ============================================================
