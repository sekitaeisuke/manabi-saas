-- ============================================================
-- shift-events-setup.sql
-- イベント管理テーブル
-- Supabase SQL Editor で実行してください
-- ============================================================

CREATE TABLE IF NOT EXISTS shift_events (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id           uuid REFERENCES schools(id) ON DELETE CASCADE,
  period_id           uuid REFERENCES shift_periods(id) ON DELETE SET NULL,
  date                date NOT NULL,
  start_time          time,
  end_time            time,
  title               text NOT NULL,
  description         text,
  event_type          text NOT NULL DEFAULT 'event'
                      CHECK (event_type IN ('event','exam','holiday','class','info')),
  visible_to_teachers boolean NOT NULL DEFAULT true,
  visible_to_parents  boolean NOT NULL DEFAULT true,
  visible_to_students boolean NOT NULL DEFAULT true,
  created_by          uuid REFERENCES teachers(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_se_school ON shift_events(school_id);
CREATE INDEX IF NOT EXISTS idx_se_date   ON shift_events(date);
CREATE INDEX IF NOT EXISTS idx_se_period ON shift_events(period_id);

-- RLS
ALTER TABLE shift_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS se_select_teacher ON shift_events;
DROP POLICY IF EXISTS se_select_parent  ON shift_events;
DROP POLICY IF EXISTS se_select_student ON shift_events;
DROP POLICY IF EXISTS se_write          ON shift_events;

-- 講師: visible_to_teachers=true なら閲覧可
CREATE POLICY se_select_teacher ON shift_events FOR SELECT
  USING (visible_to_teachers = true AND auth.uid() IS NOT NULL);

-- 書き込みはadminのみ
CREATE POLICY se_write ON shift_events FOR INSERT  WITH CHECK (auth_teacher_role() = 'admin');
CREATE POLICY se_update ON shift_events FOR UPDATE USING (auth_teacher_role() = 'admin');
CREATE POLICY se_delete ON shift_events FOR DELETE USING (auth_teacher_role() = 'admin');
