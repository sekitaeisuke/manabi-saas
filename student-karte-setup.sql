-- student-karte-setup.sql
-- 生徒ごと1枚の「日次カルテ」。
-- 3か月ビジョン(learning_plans)・教材進捗(textbook_progress)・最新報告書(lesson_reports,17項目)・
-- 保護者ニーズ(parent_messages)を素材に、1回のAI呼び出しで「現状＋今日/今週すべきこと」を集約してキャッシュする。
-- Supabase SQL エディタで手動実行する（既存の *-setup.sql と同運用）。

CREATE TABLE IF NOT EXISTS student_karte (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id         uuid REFERENCES students(id) ON DELETE CASCADE,
  student_name       text NOT NULL,            -- 保護者/表示用に非正規化
  grade              text,
  learning_plan_id   uuid REFERENCES learning_plans(id) ON DELETE SET NULL,  -- 反映中の3か月ビジョン
  source_snapshot    jsonb,                    -- 生成時に使った素材の要約（監査・再現用）
  karte_html         text,                     -- sanitizeHtml で表示する集約ビュー
  karte_json         jsonb,                    -- {visionSummary,currentStatus,parentNeeds,todaysActions[],weeklyActions[]}
  status             text NOT NULL DEFAULT 'shared' CHECK (status IN ('draft','shared')),
  generated_at       timestamptz NOT NULL DEFAULT now(),
  generated_by       text,                     -- 生成した講師email（任意）
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- 生徒1人1枚（再生成は onConflict: student_id で upsert 上書き）
CREATE UNIQUE INDEX IF NOT EXISTS uq_student_karte_student ON student_karte(student_id);
CREATE INDEX IF NOT EXISTS idx_student_karte_name ON student_karte(student_name);

-- updated_at トリガー（textbook_progress と同型）
CREATE OR REPLACE FUNCTION update_student_karte_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS trg_student_karte_updated_at ON student_karte;
CREATE TRIGGER trg_student_karte_updated_at
  BEFORE UPDATE ON student_karte FOR EACH ROW
  EXECUTE FUNCTION update_student_karte_updated_at();

-- ── RLS（daily_tasks / parent-portal のヘルパーを再利用）──────────────
-- 生成は API の service role（RLSバイパス）で行うため、ここは「閲覧・講師操作」の制御。
ALTER TABLE student_karte ENABLE ROW LEVEL SECURITY;

-- 参照：講師=全件 / 生徒=自分のshared / 保護者=子のshared
DROP POLICY IF EXISTS sk_select ON student_karte;
CREATE POLICY sk_select ON student_karte FOR SELECT
  USING (
    auth_is_teacher()
    OR (status = 'shared' AND student_id IN (SELECT id FROM students WHERE auth_user_id = auth.uid()))
    OR (status = 'shared' AND student_name IN (SELECT auth_parent_student_names()))
  );

-- 追加・更新・削除：講師のみ
DROP POLICY IF EXISTS sk_write_teacher ON student_karte;
CREATE POLICY sk_write_teacher ON student_karte FOR ALL
  USING (auth_is_teacher())
  WITH CHECK (auth_is_teacher());
