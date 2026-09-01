-- 講師連携：タスクを「教室ごと」に分け、「教務／事務」の2本立てにする
-- Supabase の SQL エディタで実行してください。
--
-- 考え方:
--   ・教室(school_id) を持たせる。NULL は「全社」＝すべての教室に掲示される。
--   ・task_kind で 教務(academic) と 事務(admin) を分ける。画面では左右に並べる。
--       教務 … 報告書・保護者とのやりとりからの自動掲載＋講師の入力
--       事務 … 講師の入力のみ（備品・掲示・シフト・connect事務 など）
--   ・category は従来どおり残す（教務=student_guidance / 事務=classroom_management）。
--     既存行を壊さないため、task_kind は category から埋め戻す。

ALTER TABLE collaboration_tasks
  ADD COLUMN IF NOT EXISTS task_kind text NOT NULL DEFAULT 'academic',  -- 'academic'(教務) | 'admin'(事務)
  ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES schools(id) ON DELETE SET NULL;
                                                                       -- NULL = 全社（全教室に掲示）

-- 1) 既存行の task_kind を category から埋め戻す
--    student_guidance は生徒の話＝教務。教室運営・ルールは事務。
UPDATE collaboration_tasks
   SET task_kind = CASE WHEN category = 'student_guidance' THEN 'academic' ELSE 'admin' END
 WHERE task_kind IS NULL OR task_kind = 'academic';

-- 2) 生徒に紐づくタスクは、その生徒の教室を既定の掲示先にする
UPDATE collaboration_tasks t
   SET school_id = s.school_id
  FROM students s
 WHERE t.student_id = s.id
   AND t.school_id IS NULL
   AND s.school_id IS NOT NULL;

-- 3) 教室 × 種別で未対応を素早く引ける
CREATE INDEX IF NOT EXISTS collaboration_tasks_school_kind_idx
  ON collaboration_tasks (school_id, task_kind) WHERE status = 'open';

-- 4) 保護者とのやりとり由来の自動掲載を許す（source_type に 'parent' が入る）
--    collaboration-auto-sync.sql の一意インデックス (source_type, source_id) がそのまま重複を防ぐ。
--    既存の CHECK 制約があると 'parent' で落ちるため、あれば張り直す。
DO $$
DECLARE c record;
BEGIN
  -- 名前が何であれ source_type を縛っている CHECK は一旦外す
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'collaboration_tasks'::regclass
       AND contype  = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%source_type%'
  LOOP
    EXECUTE format('ALTER TABLE collaboration_tasks DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE collaboration_tasks
  ADD CONSTRAINT collaboration_tasks_source_type_check
  CHECK (source_type IN ('manual', 'report', 'diagnosis', 'karte', 'parent'));

ALTER TABLE collaboration_tasks
  DROP CONSTRAINT IF EXISTS collaboration_tasks_task_kind_check;
ALTER TABLE collaboration_tasks
  ADD CONSTRAINT collaboration_tasks_task_kind_check
  CHECK (task_kind IN ('academic', 'admin'));
