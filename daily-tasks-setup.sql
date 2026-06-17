-- カルテ（3か月方針）から生成する「毎日のTODO」
-- Supabase の SQL エディタで実行してください。
--
-- 仕組み:
--   ・カルテ作成時、3段パイプラインが作る構造化JSON(roadmap等)を learning_plans.plan_json に保存。
--   ・/api/karte/daily-tasks/generate が plan_json を約13週間分の日割りタスクに展開し daily_tasks へ挿入。
--   ・生徒は自分のタスクの done を更新でき、講師は全件、保護者は自分の子の分を閲覧できる。

-- 1) learning_plans に構造化JSONを保存する列を追加（日割り生成の元データ。再生成にも使う）
ALTER TABLE learning_plans
  ADD COLUMN IF NOT EXISTS plan_json jsonb;

-- 2) 毎日のTODO本体
CREATE TABLE IF NOT EXISTS daily_tasks (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learning_plan_id uuid NOT NULL REFERENCES learning_plans(id) ON DELETE CASCADE,
  student_id       uuid REFERENCES students(id) ON DELETE CASCADE,  -- 名前照合できた場合のみ設定
  student_name     text NOT NULL,                                   -- 保護者の参照用に非正規化
  task_date        date NOT NULL,
  subject          text,
  content          text NOT NULL,
  amount           text,                                            -- 分量・目安（任意）
  sort_order       int  NOT NULL DEFAULT 0,
  done             boolean NOT NULL DEFAULT false,
  done_at          timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS daily_tasks_student_date ON daily_tasks (student_name, task_date);
CREATE INDEX IF NOT EXISTS daily_tasks_plan         ON daily_tasks (learning_plan_id);
CREATE INDEX IF NOT EXISTS daily_tasks_student_id   ON daily_tasks (student_id, task_date);

ALTER TABLE daily_tasks ENABLE ROW LEVEL SECURITY;

-- 参照: 講師は全件 / 生徒は自分の分 / 保護者は自分の子の分
DROP POLICY IF EXISTS daily_tasks_select ON daily_tasks;
CREATE POLICY daily_tasks_select ON daily_tasks FOR SELECT
  USING (
    auth_is_teacher()
    OR student_id IN (SELECT id FROM students WHERE auth_user_id = auth.uid())
    OR student_name IN (SELECT auth_parent_student_names())
  );

-- 生徒は自分のタスクの done を更新できる
DROP POLICY IF EXISTS daily_tasks_update_student ON daily_tasks;
CREATE POLICY daily_tasks_update_student ON daily_tasks FOR UPDATE
  USING (student_id IN (SELECT id FROM students WHERE auth_user_id = auth.uid()))
  WITH CHECK (student_id IN (SELECT id FROM students WHERE auth_user_id = auth.uid()));

-- 講師は全操作可（挿入・更新・削除・参照）。生成はservice roleで行うためRLSは主に閲覧用。
DROP POLICY IF EXISTS daily_tasks_write_teacher ON daily_tasks;
CREATE POLICY daily_tasks_write_teacher ON daily_tasks FOR ALL
  USING (auth_is_teacher())
  WITH CHECK (auth_is_teacher());
