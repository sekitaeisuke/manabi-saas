-- ============================================================
-- student_messages の双方向化（講師⇔生徒スレッド対応）
-- Supabase SQL Editor で実行してください
-- ============================================================

ALTER TABLE student_messages
  ADD COLUMN IF NOT EXISTS direction    text NOT NULL DEFAULT 'student_to_teacher',
                                          -- student_to_teacher / teacher_to_student
  ADD COLUMN IF NOT EXISTS thread_id    uuid,
  ADD COLUMN IF NOT EXISTS teacher_id   uuid REFERENCES teachers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS student_read boolean NOT NULL DEFAULT true;
                                          -- 生徒側未読フラグ（teacher→student のみ false で開始）

-- 既存行は student_id が無い可能性があるので一応 NULL 許容で追加
ALTER TABLE student_messages
  ADD COLUMN IF NOT EXISTS student_id uuid REFERENCES students(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sm_thread  ON student_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_sm_student ON student_messages(student_id);

-- RLS（教員は全件、生徒は自分宛のみ）
ALTER TABLE student_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sm_select       ON student_messages;
DROP POLICY IF EXISTS sm_insert       ON student_messages;
DROP POLICY IF EXISTS sm_update       ON student_messages;
DROP POLICY IF EXISTS sm_delete       ON student_messages;
DROP POLICY IF EXISTS "student_messages_select" ON student_messages;
DROP POLICY IF EXISTS "student_messages_insert" ON student_messages;
DROP POLICY IF EXISTS "student_messages_update" ON student_messages;
DROP POLICY IF EXISTS "student_messages_delete" ON student_messages;

CREATE POLICY sm_select ON student_messages FOR SELECT
  USING (
    auth_is_teacher()
    OR student_id IN (SELECT id FROM students WHERE auth_user_id = auth.uid())
  );

CREATE POLICY sm_insert ON student_messages FOR INSERT
  WITH CHECK (
    auth_is_teacher()
    OR (direction = 'student_to_teacher'
        AND student_id IN (SELECT id FROM students WHERE auth_user_id = auth.uid()))
  );

CREATE POLICY sm_update ON student_messages FOR UPDATE
  USING (
    auth_is_teacher()
    OR student_id IN (SELECT id FROM students WHERE auth_user_id = auth.uid())
  );

CREATE POLICY sm_delete ON student_messages FOR DELETE USING (auth_is_teacher());
