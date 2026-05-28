-- ============================================================
-- shift-setup.sql
-- シフト管理機能 新規テーブル & RLS
-- Supabase SQL Editor で実行してください
-- ============================================================

-- ① シフト期間テーブル（先に作成。shift_requestsが参照する）
CREATE TABLE IF NOT EXISTS shift_periods (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       uuid REFERENCES schools(id) ON DELETE CASCADE,
  label           text NOT NULL,
  start_date      date NOT NULL,
  end_date        date NOT NULL,
  deadline        timestamptz,
  assignment_mode text NOT NULL DEFAULT 'flexible'
                  CHECK (assignment_mode IN ('flexible','dedicated')),
  status          text NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open','closed','published')),
  created_by      uuid REFERENCES teachers(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sp_school ON shift_periods(school_id);
CREATE INDEX IF NOT EXISTS idx_sp_status ON shift_periods(status);

-- ② シフト希望テーブル
CREATE TABLE IF NOT EXISTS shift_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id     uuid NOT NULL REFERENCES shift_periods(id) ON DELETE CASCADE,
  teacher_id    uuid NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  date          date NOT NULL,
  slot_start    time NOT NULL,
  slot_end      time NOT NULL,
  availability  text NOT NULL DEFAULT 'available'
                CHECK (availability IN ('available','unavailable','preferred')),
  note          text,
  submitted_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(teacher_id, period_id, date, slot_start)
);
CREATE INDEX IF NOT EXISTS idx_sr_period   ON shift_requests(period_id);
CREATE INDEX IF NOT EXISTS idx_sr_teacher  ON shift_requests(teacher_id);
CREATE INDEX IF NOT EXISTS idx_sr_date     ON shift_requests(date);

-- ③ 確定シフトテーブル
CREATE TABLE IF NOT EXISTS shift_assignments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id    uuid NOT NULL REFERENCES shift_periods(id) ON DELETE CASCADE,
  teacher_id   uuid NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  school_id    uuid NOT NULL REFERENCES schools(id),
  date         date NOT NULL,
  slot_start   time NOT NULL,
  slot_end     time NOT NULL,
  status       text NOT NULL DEFAULT 'draft'
               CHECK (status IN ('draft','confirmed')),
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE(teacher_id, period_id, date, slot_start)
);
CREATE INDEX IF NOT EXISTS idx_sa_period  ON shift_assignments(period_id);
CREATE INDEX IF NOT EXISTS idx_sa_teacher ON shift_assignments(teacher_id);
CREATE INDEX IF NOT EXISTS idx_sa_date    ON shift_assignments(date);

-- ④ AI調整履歴テーブル
CREATE TABLE IF NOT EXISTS shift_ai_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id       uuid NOT NULL REFERENCES shift_periods(id) ON DELETE CASCADE,
  custom_prompt   text,
  assignment_mode text NOT NULL DEFAULT 'flexible',
  raw_response    text,
  result_json     jsonb,
  executed_by     uuid REFERENCES teachers(id) ON DELETE SET NULL,
  executed_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_air_period ON shift_ai_runs(period_id);

-- ============================================================
-- RLS設定
-- ============================================================

-- shift_periods: 読み取りは全講師、書き込みはadminのみ
ALTER TABLE shift_periods ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sp_select ON shift_periods;
DROP POLICY IF EXISTS sp_insert ON shift_periods;
DROP POLICY IF EXISTS sp_update ON shift_periods;
DROP POLICY IF EXISTS sp_delete ON shift_periods;
CREATE POLICY sp_select ON shift_periods FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY sp_insert ON shift_periods FOR INSERT WITH CHECK (auth_teacher_role() = 'admin');
CREATE POLICY sp_update ON shift_periods FOR UPDATE USING (auth_teacher_role() = 'admin');
CREATE POLICY sp_delete ON shift_periods FOR DELETE USING (auth_teacher_role() = 'admin');

-- shift_requests: 自分の希望は自分のみ操作可。adminは全件閲覧可。
ALTER TABLE shift_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sr_select ON shift_requests;
DROP POLICY IF EXISTS sr_insert ON shift_requests;
DROP POLICY IF EXISTS sr_update ON shift_requests;
DROP POLICY IF EXISTS sr_delete ON shift_requests;
CREATE POLICY sr_select ON shift_requests FOR SELECT
  USING (auth_teacher_role() = 'admin'
    OR teacher_id = (SELECT id FROM teachers WHERE email = auth.email() LIMIT 1));
CREATE POLICY sr_insert ON shift_requests FOR INSERT
  WITH CHECK (teacher_id = (SELECT id FROM teachers WHERE email = auth.email() LIMIT 1));
CREATE POLICY sr_update ON shift_requests FOR UPDATE
  USING (teacher_id = (SELECT id FROM teachers WHERE email = auth.email() LIMIT 1)
    OR auth_teacher_role() = 'admin');
CREATE POLICY sr_delete ON shift_requests FOR DELETE
  USING (teacher_id = (SELECT id FROM teachers WHERE email = auth.email() LIMIT 1)
    OR auth_teacher_role() = 'admin');

-- shift_assignments: 自分のシフトは閲覧可。書き込みはadminのみ。
ALTER TABLE shift_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sa_select ON shift_assignments;
DROP POLICY IF EXISTS sa_insert ON shift_assignments;
DROP POLICY IF EXISTS sa_update ON shift_assignments;
DROP POLICY IF EXISTS sa_delete ON shift_assignments;
CREATE POLICY sa_select ON shift_assignments FOR SELECT
  USING (auth_teacher_role() = 'admin'
    OR teacher_id = (SELECT id FROM teachers WHERE email = auth.email() LIMIT 1));
CREATE POLICY sa_insert ON shift_assignments FOR INSERT WITH CHECK (auth_teacher_role() = 'admin');
CREATE POLICY sa_update ON shift_assignments FOR UPDATE USING (auth_teacher_role() = 'admin');
CREATE POLICY sa_delete ON shift_assignments FOR DELETE USING (auth_teacher_role() = 'admin');

-- shift_ai_runs: adminのみ
ALTER TABLE shift_ai_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS air_select ON shift_ai_runs;
DROP POLICY IF EXISTS air_insert ON shift_ai_runs;
CREATE POLICY air_select ON shift_ai_runs FOR SELECT USING (auth_teacher_role() = 'admin');
CREATE POLICY air_insert ON shift_ai_runs FOR INSERT WITH CHECK (auth_teacher_role() = 'admin');
