-- ============================================================
-- 保護者ポータル用テーブル・RLS セットアップ
-- Supabase SQL Editor で順に実行してください
-- ============================================================

-- ============================================================
-- STEP 1: parents（保護者プロフィール）
--   Supabase Auth と email で紐付け
-- ============================================================
CREATE TABLE IF NOT EXISTS parents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  email        text UNIQUE NOT NULL,
  name         text NOT NULL,
  phone        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_parents_email ON parents(email);

-- ============================================================
-- STEP 2: parent_student_links（保護者↔生徒 多対多）
-- ============================================================
CREATE TABLE IF NOT EXISTS parent_student_links (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id    uuid NOT NULL REFERENCES parents(id)  ON DELETE CASCADE,
  student_id   uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  relationship text,                          -- 父/母/保護者など任意
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE(parent_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_psl_parent  ON parent_student_links(parent_id);
CREATE INDEX IF NOT EXISTS idx_psl_student ON parent_student_links(student_id);

-- ============================================================
-- STEP 3: lessons（授業予定 / 来塾予定）
-- ============================================================
CREATE TABLE IF NOT EXISTS lessons (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id       uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  teacher_id       uuid          REFERENCES teachers(id) ON DELETE SET NULL,
  subject          text,
  scheduled_at     timestamptz NOT NULL,
  duration_minutes int  NOT NULL DEFAULT 60,
  location         text,
  status           text NOT NULL DEFAULT 'scheduled',  -- scheduled/completed/canceled/rescheduled
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lessons_student ON lessons(student_id);
CREATE INDEX IF NOT EXISTS idx_lessons_date    ON lessons(scheduled_at);

-- ============================================================
-- STEP 4: reschedule_requests（振替リクエスト）
-- ============================================================
CREATE TABLE IF NOT EXISTS reschedule_requests (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id        uuid NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  parent_id        uuid          REFERENCES parents(id) ON DELETE SET NULL,
  student_id       uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  proposed_at      timestamptz NOT NULL,
  reason           text,
  status           text NOT NULL DEFAULT 'pending',     -- pending/approved/rejected
  teacher_response text,
  responded_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_resched_lesson  ON reschedule_requests(lesson_id);
CREATE INDEX IF NOT EXISTS idx_resched_parent  ON reschedule_requests(parent_id);
CREATE INDEX IF NOT EXISTS idx_resched_status  ON reschedule_requests(status);

-- ============================================================
-- STEP 5: parent_messages の拡張（双方向スレッド対応）
--   既存テーブルに列を追加（既にあるならスキップ）
-- ============================================================
ALTER TABLE parent_messages
  ADD COLUMN IF NOT EXISTS parent_id  uuid REFERENCES parents(id)  ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS teacher_id uuid REFERENCES teachers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS student_id uuid REFERENCES students(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS direction  text NOT NULL DEFAULT 'parent_to_teacher',
                                       -- parent_to_teacher / teacher_to_parent
  ADD COLUMN IF NOT EXISTS thread_id  uuid,
  ADD COLUMN IF NOT EXISTS parent_read boolean NOT NULL DEFAULT true;
                                       -- 保護者から見た未読フラグ（teacher→parent のみ false で開始）

CREATE INDEX IF NOT EXISTS idx_pm_thread ON parent_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_pm_parent ON parent_messages(parent_id);

-- ============================================================
-- STEP 6: ヘルパー関数（auth.email() → 保護者ID）
-- ============================================================
CREATE OR REPLACE FUNCTION auth_parent_id()
RETURNS uuid LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT id FROM parents WHERE email = auth.email() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION auth_is_teacher()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM teachers WHERE email = auth.email());
$$;

-- 自分にひも付いている生徒IDの集合
CREATE OR REPLACE FUNCTION auth_parent_student_ids()
RETURNS SETOF uuid LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT student_id FROM parent_student_links WHERE parent_id = auth_parent_id();
$$;

-- 自分にひも付いている生徒名の集合（lesson_reports / learning_plans / questionnaire_responses
-- などは student_name で持つため別途必要）
CREATE OR REPLACE FUNCTION auth_parent_student_names()
RETURNS SETOF text LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT s.name
  FROM   parent_student_links psl
  JOIN   students s ON s.id = psl.student_id
  WHERE  psl.parent_id = auth_parent_id();
$$;

-- ============================================================
-- STEP 7: parents RLS
--   自分の行のみ参照・更新可能。講師はログイン中なら全件可。
-- ============================================================
ALTER TABLE parents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS parents_select_self     ON parents;
DROP POLICY IF EXISTS parents_select_teacher  ON parents;
DROP POLICY IF EXISTS parents_update_self     ON parents;
DROP POLICY IF EXISTS parents_insert_teacher  ON parents;
DROP POLICY IF EXISTS parents_delete_teacher  ON parents;

CREATE POLICY parents_select_self    ON parents FOR SELECT
  USING (email = auth.email() OR auth_is_teacher());

CREATE POLICY parents_update_self    ON parents FOR UPDATE
  USING (email = auth.email() OR auth_is_teacher());

CREATE POLICY parents_insert_teacher ON parents FOR INSERT
  WITH CHECK (auth_is_teacher());

CREATE POLICY parents_delete_teacher ON parents FOR DELETE
  USING (auth_is_teacher());

-- ============================================================
-- STEP 8: parent_student_links RLS
-- ============================================================
ALTER TABLE parent_student_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS psl_select  ON parent_student_links;
DROP POLICY IF EXISTS psl_insert  ON parent_student_links;
DROP POLICY IF EXISTS psl_update  ON parent_student_links;
DROP POLICY IF EXISTS psl_delete  ON parent_student_links;

CREATE POLICY psl_select ON parent_student_links FOR SELECT
  USING (parent_id = auth_parent_id() OR auth_is_teacher());
CREATE POLICY psl_insert ON parent_student_links FOR INSERT
  WITH CHECK (auth_is_teacher());
CREATE POLICY psl_update ON parent_student_links FOR UPDATE
  USING (auth_is_teacher());
CREATE POLICY psl_delete ON parent_student_links FOR DELETE
  USING (auth_is_teacher());

-- ============================================================
-- STEP 9: lessons RLS
--   保護者は自分の子の lesson のみ閲覧可。書き込みは講師のみ。
-- ============================================================
ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lessons_select ON lessons;
DROP POLICY IF EXISTS lessons_insert ON lessons;
DROP POLICY IF EXISTS lessons_update ON lessons;
DROP POLICY IF EXISTS lessons_delete ON lessons;

CREATE POLICY lessons_select ON lessons FOR SELECT
  USING (auth_is_teacher() OR student_id IN (SELECT auth_parent_student_ids()));
CREATE POLICY lessons_insert ON lessons FOR INSERT
  WITH CHECK (auth_is_teacher());
CREATE POLICY lessons_update ON lessons FOR UPDATE
  USING (auth_is_teacher());
CREATE POLICY lessons_delete ON lessons FOR DELETE
  USING (auth_is_teacher());

-- ============================================================
-- STEP 10: reschedule_requests RLS
--   保護者は自分の出したリクエストのみ。挿入も自分のみ。
-- ============================================================
ALTER TABLE reschedule_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS resched_select ON reschedule_requests;
DROP POLICY IF EXISTS resched_insert ON reschedule_requests;
DROP POLICY IF EXISTS resched_update ON reschedule_requests;
DROP POLICY IF EXISTS resched_delete ON reschedule_requests;

CREATE POLICY resched_select ON reschedule_requests FOR SELECT
  USING (auth_is_teacher() OR parent_id = auth_parent_id());

CREATE POLICY resched_insert ON reschedule_requests FOR INSERT
  WITH CHECK (
    auth_is_teacher()
    OR (parent_id = auth_parent_id()
        AND student_id IN (SELECT auth_parent_student_ids())));

CREATE POLICY resched_update ON reschedule_requests FOR UPDATE
  USING (auth_is_teacher() OR parent_id = auth_parent_id());

CREATE POLICY resched_delete ON reschedule_requests FOR DELETE
  USING (auth_is_teacher() OR parent_id = auth_parent_id());

-- ============================================================
-- STEP 11: parent_messages の RLS 上書き
--   保護者：自分の thread / parent_id の行のみ
--   講師：従来通り全件
-- ============================================================
ALTER TABLE parent_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pm_select       ON parent_messages;
DROP POLICY IF EXISTS pm_insert       ON parent_messages;
DROP POLICY IF EXISTS pm_update       ON parent_messages;
DROP POLICY IF EXISTS pm_delete       ON parent_messages;
DROP POLICY IF EXISTS "parent_messages_select" ON parent_messages;
DROP POLICY IF EXISTS "parent_messages_insert" ON parent_messages;
DROP POLICY IF EXISTS "parent_messages_update" ON parent_messages;
DROP POLICY IF EXISTS "parent_messages_delete" ON parent_messages;

CREATE POLICY pm_select ON parent_messages FOR SELECT
  USING (auth_is_teacher() OR parent_id = auth_parent_id());

CREATE POLICY pm_insert ON parent_messages FOR INSERT
  WITH CHECK (
    auth_is_teacher()
    OR (parent_id = auth_parent_id() AND direction = 'parent_to_teacher')
  );

CREATE POLICY pm_update ON parent_messages FOR UPDATE
  USING (auth_is_teacher() OR parent_id = auth_parent_id());

CREATE POLICY pm_delete ON parent_messages FOR DELETE
  USING (auth_is_teacher());

-- ============================================================
-- STEP 12: 既存の学習関連テーブルに「保護者の閲覧権限」を追加
--   lesson_reports / learning_plans / questionnaire_responses
--   いずれも student_name 列で生徒を識別しているため、名前で照合
-- ============================================================

-- ----- lesson_reports（報告書） -----
ALTER TABLE lesson_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lr_select_parent ON lesson_reports;
CREATE POLICY lr_select_parent ON lesson_reports FOR SELECT
  USING (
    auth_is_teacher()
    OR (status = 'sent' AND student_name IN (SELECT auth_parent_student_names()))
  );

-- ----- learning_plans（カルテ） -----
DROP POLICY IF EXISTS learning_plans_select ON learning_plans;
CREATE POLICY learning_plans_select ON learning_plans FOR SELECT
  USING (
    auth_is_teacher()
    OR (status = 'shared' AND student_name IN (SELECT auth_parent_student_names()))
  );

-- ----- questionnaire_responses（多層診断） -----
DROP POLICY IF EXISTS qr_select_parent ON questionnaire_responses;
CREATE POLICY qr_select_parent ON questionnaire_responses FOR SELECT
  USING (
    auth_is_teacher()
    OR (status = 'approved' AND student_name IN (SELECT auth_parent_student_names()))
  );

-- ============================================================
-- 完了
-- 次は Supabase Auth の Users 画面で保護者ユーザを作成し、
-- 同じ email を持つ parents 行を INSERT、parent_student_links で
-- 生徒と紐付けてください。
-- ============================================================
-- ============================================================
-- announcements に対象絞り込み列を追加
-- 両方 NULL = 全員向け（broadcast）
-- target_grade だけ指定 = 指定学年の生徒/保護者のみ
-- target_school_id だけ指定 = 指定校舎の生徒/保護者のみ
-- 両方指定 = AND 条件
-- ============================================================

ALTER TABLE announcements
  ADD COLUMN IF NOT EXISTS target_grade     text,
  ADD COLUMN IF NOT EXISTS target_school_id uuid REFERENCES schools(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_announcements_grade  ON announcements(target_grade);
CREATE INDEX IF NOT EXISTS idx_announcements_school ON announcements(target_school_id);
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
-- ============================================================
-- 通知システム（Email / Push / LINE 拡張可能）
-- Supabase SQL Editor で実行してください
-- ============================================================

-- ============================================================
-- STEP 1: notification_preferences
--   actor_kind と actor_id で「誰の」設定かを表す
--   actor_kind = 'parent' | 'teacher' | 'student'
--   actor_id   = parents.id / teachers.id / students.id のいずれか
-- ============================================================
CREATE TABLE IF NOT EXISTS notification_preferences (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_kind      text NOT NULL,
  actor_id        uuid NOT NULL,
  email_enabled   boolean NOT NULL DEFAULT true,
  push_enabled    boolean NOT NULL DEFAULT false,
  line_enabled    boolean NOT NULL DEFAULT false,
  email_override  text,             -- 受信用メールを別に指定したい場合
  push_endpoint   text,             -- Web Push subscription (JSON) を入れる予定
  line_user_id    text,             -- LINE Messaging API の userId
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(actor_kind, actor_id)
);

CREATE INDEX IF NOT EXISTS idx_np_actor ON notification_preferences(actor_kind, actor_id);

-- updated_at 自動更新
CREATE OR REPLACE FUNCTION np_set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_np_updated_at ON notification_preferences;
CREATE TRIGGER trg_np_updated_at BEFORE UPDATE ON notification_preferences
  FOR EACH ROW EXECUTE FUNCTION np_set_updated_at();

-- ============================================================
-- STEP 2: notification_log（送信履歴）
-- ============================================================
CREATE TABLE IF NOT EXISTS notification_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_kind   text NOT NULL,
  actor_id     uuid NOT NULL,
  channel      text NOT NULL,      -- email / push / line
  event_type   text NOT NULL,      -- new_parent_message / reschedule_decision / ...
  status       text NOT NULL,      -- queued / sent / skipped / failed
  recipient    text,               -- 実際の宛先（email/line_user_id）
  subject      text,
  body         text,
  error        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nl_actor    ON notification_log(actor_kind, actor_id);
CREATE INDEX IF NOT EXISTS idx_nl_created  ON notification_log(created_at DESC);

-- ============================================================
-- STEP 3: RLS
--   prefs:
--     保護者は自分の行のみ参照・更新可
--     講師は自分の行と全保護者・生徒の prefs を参照可（運用補助）
--     生徒は自分の行のみ
--   log:
--     講師は全件、保護者/生徒は自分宛のみ参照可
-- ============================================================
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS np_select ON notification_preferences;
DROP POLICY IF EXISTS np_insert ON notification_preferences;
DROP POLICY IF EXISTS np_update ON notification_preferences;
DROP POLICY IF EXISTS np_delete ON notification_preferences;

CREATE POLICY np_select ON notification_preferences FOR SELECT
  USING (
    auth_is_teacher()
    OR (actor_kind = 'parent'  AND actor_id = auth_parent_id())
    OR (actor_kind = 'student' AND actor_id IN (SELECT id FROM students WHERE auth_user_id = auth.uid()))
    OR (actor_kind = 'teacher' AND actor_id IN (SELECT id FROM teachers WHERE email = auth.email()))
  );

CREATE POLICY np_insert ON notification_preferences FOR INSERT
  WITH CHECK (
    auth_is_teacher()
    OR (actor_kind = 'parent'  AND actor_id = auth_parent_id())
    OR (actor_kind = 'student' AND actor_id IN (SELECT id FROM students WHERE auth_user_id = auth.uid()))
  );

CREATE POLICY np_update ON notification_preferences FOR UPDATE
  USING (
    auth_is_teacher()
    OR (actor_kind = 'parent'  AND actor_id = auth_parent_id())
    OR (actor_kind = 'student' AND actor_id IN (SELECT id FROM students WHERE auth_user_id = auth.uid()))
    OR (actor_kind = 'teacher' AND actor_id IN (SELECT id FROM teachers WHERE email = auth.email()))
  );

CREATE POLICY np_delete ON notification_preferences FOR DELETE
  USING (auth_is_teacher());

ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS nl_select ON notification_log;
DROP POLICY IF EXISTS nl_insert ON notification_log;

CREATE POLICY nl_select ON notification_log FOR SELECT
  USING (
    auth_is_teacher()
    OR (actor_kind = 'parent'  AND actor_id = auth_parent_id())
    OR (actor_kind = 'student' AND actor_id IN (SELECT id FROM students WHERE auth_user_id = auth.uid()))
  );

-- insert は基本サーバ側（service-role 不要の anon でも書ける）
CREATE POLICY nl_insert ON notification_log FOR INSERT WITH CHECK (true);
