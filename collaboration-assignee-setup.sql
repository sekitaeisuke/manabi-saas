-- 講師連携：タスクに「担当者」を明確に持たせる
-- Supabase の SQL エディタで実行してください。
--
-- 運用ルール（アプリ側で制御）:
--   ・担当者は「上位ロールが、自分と同じロール〜下位ロールの中から」選んで決める。
--     ロール上下: 管理者(admin) > 講師(teacher) > 非常勤(part-time)
--   ・完了ボタンは「担当者本人」または「担当者より上位のロール」だけが押せる。
--   ・担当者が未設定のタスクは完了できない（先に担当者を決める）。

ALTER TABLE collaboration_tasks
  ADD COLUMN IF NOT EXISTS assignee_id uuid REFERENCES teachers(id) ON DELETE SET NULL, -- 担当者
  ADD COLUMN IF NOT EXISTS assigned_by uuid REFERENCES teachers(id) ON DELETE SET NULL, -- 担当を決めた人
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz;                                     -- 担当を決めた日時

-- 未対応タスクを担当者で素早く引ける
CREATE INDEX IF NOT EXISTS collaboration_tasks_assignee_idx
  ON collaboration_tasks (assignee_id) WHERE status = 'open';
