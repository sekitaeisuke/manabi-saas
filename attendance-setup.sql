-- ============================================================
-- attendance-setup.sql
-- 出勤怠管理テーブル
-- Supabase SQL Editor で実行してください
-- ============================================================

CREATE TABLE IF NOT EXISTS attendance_records (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id          uuid NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  school_id           uuid REFERENCES schools(id) ON DELETE SET NULL,
  work_date           date NOT NULL,
  clock_in            timestamptz,
  clock_out           timestamptz,
  break_minutes       int NOT NULL DEFAULT 0,
  transportation_fee  int NOT NULL DEFAULT 0,
  transportation_note text,
  notes               text,
  entry_method        text NOT NULL DEFAULT 'manual'
                      CHECK (entry_method IN ('face','manual')),
  status              text NOT NULL DEFAULT 'present'
                      CHECK (status IN ('present','absent','late','early_leave')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE(teacher_id, work_date)
);

CREATE INDEX IF NOT EXISTS idx_ar_teacher   ON attendance_records(teacher_id);
CREATE INDEX IF NOT EXISTS idx_ar_work_date ON attendance_records(work_date);
CREATE INDEX IF NOT EXISTS idx_ar_school    ON attendance_records(school_id);

-- updated_at 自動更新トリガー
CREATE OR REPLACE FUNCTION update_attendance_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_attendance_updated_at ON attendance_records;
CREATE TRIGGER trg_attendance_updated_at
  BEFORE UPDATE ON attendance_records
  FOR EACH ROW EXECUTE FUNCTION update_attendance_updated_at();

-- RLS
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ar_select ON attendance_records;
DROP POLICY IF EXISTS ar_insert ON attendance_records;
DROP POLICY IF EXISTS ar_update ON attendance_records;
DROP POLICY IF EXISTS ar_delete ON attendance_records;

-- 自分の記録は自分で操作可。adminは全件閲覧可。
CREATE POLICY ar_select ON attendance_records FOR SELECT
  USING (
    auth_teacher_role() = 'admin'
    OR teacher_id = (SELECT id FROM teachers WHERE email = auth.email() LIMIT 1)
  );

CREATE POLICY ar_insert ON attendance_records FOR INSERT
  WITH CHECK (
    teacher_id = (SELECT id FROM teachers WHERE email = auth.email() LIMIT 1)
    OR auth_teacher_role() = 'admin'
  );

CREATE POLICY ar_update ON attendance_records FOR UPDATE
  USING (
    teacher_id = (SELECT id FROM teachers WHERE email = auth.email() LIMIT 1)
    OR auth_teacher_role() = 'admin'
  );

CREATE POLICY ar_delete ON attendance_records FOR DELETE
  USING (auth_teacher_role() = 'admin');
