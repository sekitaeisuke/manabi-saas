-- 講師連携：報告書・学力診断テストからの「気がかりな生徒」自動掲載
-- Supabase の SQL エディタで実行してください。
--
-- 仕組み:
--   ・/api/collaboration/sync が報告書(lesson_reports)と学力診断(questionnaire_responses)を走査し、
--     「心配あり」と判定したものを collaboration_tasks に自動行として挿入する。
--   ・collaboration_auto_log に「処理済み」を記録し、AIの再判定・二重掲載を防ぐ。
--   ・講師が「解決済」を押すと当該タスクは status='completed' になりリストから消える（行は残る）。
--   ・同じ報告書/診断は再掲されないが、新しい報告書/診断は新IDのため未処理 → 再び自動掲載される。

-- 1) 既存 collaboration_tasks に自動掲載用カラムを追加（手動タスクは source_type='manual' のまま）
ALTER TABLE collaboration_tasks
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'manual',  -- 'manual' | 'report' | 'diagnosis'
  ADD COLUMN IF NOT EXISTS source_id   uuid,                            -- 元の報告書/診断の id（手動は NULL）
  ADD COLUMN IF NOT EXISTS auto_reason text;                            -- 自動掲載の理由（表示用）

-- 同じ報告書/診断から二重生成しないための一意制約。
-- source_id が NULL の手動タスクは（NULL 同士は非等価のため）何件あってもOK。
CREATE UNIQUE INDEX IF NOT EXISTS collaboration_tasks_source_uniq
  ON collaboration_tasks (source_type, source_id);

-- 2) 自動判定の処理済みログ（AIの再判定・重複生成を防ぐ）
CREATE TABLE IF NOT EXISTS collaboration_auto_log (
  source_type  text        NOT NULL,            -- 'report' | 'diagnosis'
  source_id    uuid        NOT NULL,
  is_concern   boolean     NOT NULL,            -- 心配ありと判定したか
  reason       text,                            -- 判定理由（あれば）
  processed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_type, source_id)
);

-- service role からのみ読み書きする想定（匿名/一般ユーザーはポリシー無しで遮断）
ALTER TABLE collaboration_auto_log ENABLE ROW LEVEL SECURITY;
