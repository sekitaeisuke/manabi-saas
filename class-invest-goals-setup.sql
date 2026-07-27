-- ============================================================
-- class-invest-goals-setup.sql
-- 教室の投資ゴール（みんなの投資額が目標に届いたら、教室に○○を導入）
--   進捗の基準：その教室の「応援AC」＝在籍生徒の投資運用中AC(locked)の合計。
--   例：応援AC が 5000 に届いたら「ウォーターサーバー導入」。
--   Supabase SQL Editor で実行（冪等）。
-- ============================================================

CREATE TABLE IF NOT EXISTS class_investment_goals (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid REFERENCES schools(id) ON DELETE CASCADE,  -- NULL=全校共通
  title       text NOT NULL,                 -- 例: ウォーターサーバー導入
  target_ac   integer NOT NULL CHECK (target_ac > 0),
  note        text,
  status      text NOT NULL DEFAULT 'open'
                CHECK (status IN ('open','achieved','fulfilled')),
  achieved_at timestamptz,
  sort_order  integer NOT NULL DEFAULT 0,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cig_school ON class_investment_goals(school_id, sort_order);

DROP TRIGGER IF EXISTS trg_cig_touch ON class_investment_goals;
CREATE TRIGGER trg_cig_touch BEFORE UPDATE ON class_investment_goals
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

ALTER TABLE class_investment_goals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cig_select ON class_investment_goals;
CREATE POLICY cig_select ON class_investment_goals FOR SELECT
  USING (auth.uid() IS NOT NULL);           -- ログイン済みなら閲覧可（生徒に見せる）
DROP POLICY IF EXISTS cig_write ON class_investment_goals;
CREATE POLICY cig_write ON class_investment_goals FOR ALL
  USING (auth_is_teacher()) WITH CHECK (auth_is_teacher());   -- 追加・編集は講師

-- 例（全校共通の目標）。既に同名があれば入れない。
INSERT INTO class_investment_goals (school_id, title, target_ac, note, sort_order)
SELECT NULL, 'ウォーターサーバー導入', 5000, 'みんなの投資で教室にウォーターサーバーを！', 1
WHERE NOT EXISTS (SELECT 1 FROM class_investment_goals WHERE title = 'ウォーターサーバー導入');

-- ============================================================
-- 完了。生徒「経済」タブの自塾株セクションに「🎯 みんなの投資ゴール」を進捗バーで表示。
-- 講師は経済ページ⚙設定で目標を追加/編集/達成にできる。
-- ============================================================
