-- ============================================================
-- class-stock-voice-setup.sql
-- 株主の声（意見ボックス）
--   自塾株を保有する生徒が、教室への意見・要望を投稿できる。講師が一覧で読む。
--   「株主のみ投稿可」は API 側で保有株数>0を検証（insert は service role 経由）。
--   Supabase SQL Editor で実行（冪等）。
-- ============================================================

CREATE TABLE IF NOT EXISTS shareholder_voices (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id   uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  student_name text,
  school_id    uuid REFERENCES schools(id) ON DELETE SET NULL,
  shares       integer,                       -- 投稿時点の保有株数（発言の重み表示用）
  message      text NOT NULL,
  status       text NOT NULL DEFAULT 'open'
                 CHECK (status IN ('open','read','done')),
  reply        text,                          -- 講師の返信（任意）
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sv_status ON shareholder_voices(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sv_school ON shareholder_voices(school_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_sv_touch ON shareholder_voices;
CREATE TRIGGER trg_sv_touch BEFORE UPDATE ON shareholder_voices
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

ALTER TABLE shareholder_voices ENABLE ROW LEVEL SECURITY;

-- 閲覧：本人（自分の声）・保護者（子の声）・講師。
DROP POLICY IF EXISTS sv_select ON shareholder_voices;
CREATE POLICY sv_select ON shareholder_voices FOR SELECT
  USING (student_id = auth_student_id()
         OR auth_is_teacher()
         OR student_id IN (SELECT auth_parent_student_ids()));

-- 更新（講師が status/返信）：講師のみ。作成は API(service role)経由。
DROP POLICY IF EXISTS sv_update ON shareholder_voices;
CREATE POLICY sv_update ON shareholder_voices FOR UPDATE
  USING (auth_is_teacher()) WITH CHECK (auth_is_teacher());

-- ============================================================
-- 完了。投稿は /api/economy/voice(POST・requireStudent＋保有株>0検証)。
-- 一覧は講師画面。
-- ============================================================
