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
