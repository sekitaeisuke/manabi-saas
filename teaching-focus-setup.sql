-- ============================================================
-- teaching-focus-setup.sql
-- 講師ホーム「今日この授業で詰めること」
--
-- daily_tasks（3か月ビジョンから展開・生徒が家でやる宿題）とは【別物】。
--   daily_tasks     … 生徒に見せる。チェック式。単一の真実は3か月ビジョン。
--   teaching_focus  … 講師だけに見せる。今日この授業で講師が詰める点。毎朝AIが選び直す。
-- 役割が違うので両立させる。teaching_focus は daily_tasks を書き換えない。
--
-- 素材: 教材進捗 / 報告書17項目 / 保護者メッセージ / 多層診断 / 講師連携
-- Supabase SQL Editor で実行してください。
-- ============================================================

CREATE TABLE IF NOT EXISTS teaching_focus (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  student_name  text NOT NULL,                        -- 表示用に非正規化
  school_id     uuid REFERENCES schools(id) ON DELETE SET NULL,
                                                       -- 教室カードの集計に使う
  focus_date    date NOT NULL DEFAULT current_date,    -- 何日ぶんか（日次キャッシュのキー）

  -- AI が選んだ「今日詰めること」。UI が読む形:
  --   { "headline": "…",
  --     "items": [ { "action": "…", "why": "…",
  --                  "source": "progress|report|parent|diagnosis|collab",
  --                  "sourceDate": "2026-07-24", "priority": "high|normal" } ] }
  -- 教材の列挙は textbook_progress から機械的に出すので、ここには含めない
  -- （AIに事実を作文させない。判断の部分だけを持たせる）。
  focus_json    jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- 何を根拠に生成したか。素材が薄いのに断定していないかを後から検証するため。
  source_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,

  generated_at  timestamptz NOT NULL DEFAULT now(),
  generated_by  text,                                  -- 生成した講師のemail / 'cron'
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- 1生徒1日1件。再生成は upsert で上書きする。
CREATE UNIQUE INDEX IF NOT EXISTS idx_tf_student_date
  ON teaching_focus(student_id, focus_date);
CREATE INDEX IF NOT EXISTS idx_tf_date   ON teaching_focus(focus_date DESC);
CREATE INDEX IF NOT EXISTS idx_tf_school ON teaching_focus(school_id, focus_date DESC);

-- ── RLS ──────────────────────────────────────────────────
-- 講師だけ。生徒・保護者には見せない（指導側のメモであり、本人向けの言葉ではない）。
ALTER TABLE teaching_focus ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tf_select ON teaching_focus;
DROP POLICY IF EXISTS tf_insert ON teaching_focus;
DROP POLICY IF EXISTS tf_update ON teaching_focus;
DROP POLICY IF EXISTS tf_delete ON teaching_focus;

CREATE POLICY tf_select ON teaching_focus FOR SELECT
  USING (auth_teacher_role() IS NOT NULL);

-- 書き込みは基本 service role（生成API・cron）。管理者の手動修正だけ許す。
CREATE POLICY tf_insert ON teaching_focus FOR INSERT
  WITH CHECK (auth_teacher_role() = 'admin');

CREATE POLICY tf_update ON teaching_focus FOR UPDATE
  USING (auth_teacher_role() = 'admin');

CREATE POLICY tf_delete ON teaching_focus FOR DELETE
  USING (auth_teacher_role() = 'admin');
