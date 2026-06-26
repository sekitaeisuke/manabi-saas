-- ============================================================
-- textbook-progress-setup.sql
-- 教材進捗マネジメント（つなぐ→つながるまなび 移行の第一の楔）
-- 生徒ごとの「使用テキスト・どこまで・手応え」を講師が入力し、
-- 「誰が入力したか（teacher_id）」を構造で担保する。
-- Supabase SQL Editor で実行してください。
-- ============================================================

CREATE TABLE IF NOT EXISTS textbook_progress (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  student_name    text NOT NULL,                       -- 表示用に非正規化
  teacher_id      uuid NOT NULL REFERENCES teachers(id) ON DELETE SET NULL,
                                                         -- ★誰が入力したか（つなぐに無かった情報）
  teacher_name    text,                                  -- 表示用に非正規化
  lesson_date     date NOT NULL DEFAULT current_date,    -- 授業日
  subject         text,                                  -- 科目
  textbook        text NOT NULL,                         -- 使用テキスト名
  progress_where  text,                                  -- どこまで（単元・ページ）
  amount          text,                                  -- 量（今日進んだ範囲）
  understanding   text CHECK (understanding IN ('good','normal','weak')),
                                                         -- 手応え 3段階（◎○△）
  comment         text,                                  -- 様子・つまずき・次回方針
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tp_student ON textbook_progress(student_id);
CREATE INDEX IF NOT EXISTS idx_tp_teacher ON textbook_progress(teacher_id);
CREATE INDEX IF NOT EXISTS idx_tp_date    ON textbook_progress(lesson_date DESC);

-- updated_at 自動更新トリガー
CREATE OR REPLACE FUNCTION update_textbook_progress_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_textbook_progress_updated_at ON textbook_progress;
CREATE TRIGGER trg_textbook_progress_updated_at
  BEFORE UPDATE ON textbook_progress
  FOR EACH ROW EXECUTE FUNCTION update_textbook_progress_updated_at();

-- RLS
ALTER TABLE textbook_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tp_select ON textbook_progress;
DROP POLICY IF EXISTS tp_insert ON textbook_progress;
DROP POLICY IF EXISTS tp_update ON textbook_progress;
DROP POLICY IF EXISTS tp_delete ON textbook_progress;

-- 登録講師は全件閲覧可（入力状況ボード／管理者監査のため）
CREATE POLICY tp_select ON textbook_progress FOR SELECT
  USING (auth_teacher_role() IS NOT NULL);

-- 入力は「ログイン中の講師本人の teacher_id」でのみ可（なりすまし防止＝アカウンタビリティ）
CREATE POLICY tp_insert ON textbook_progress FOR INSERT
  WITH CHECK (
    teacher_id = (SELECT id FROM teachers WHERE email = auth.email() LIMIT 1)
    OR auth_teacher_role() = 'admin'
  );

-- 自分の入力は自分で訂正可。adminは全件訂正可。
CREATE POLICY tp_update ON textbook_progress FOR UPDATE
  USING (
    teacher_id = (SELECT id FROM teachers WHERE email = auth.email() LIMIT 1)
    OR auth_teacher_role() = 'admin'
  );

CREATE POLICY tp_delete ON textbook_progress FOR DELETE
  USING (
    teacher_id = (SELECT id FROM teachers WHERE email = auth.email() LIMIT 1)
    OR auth_teacher_role() = 'admin'
  );
