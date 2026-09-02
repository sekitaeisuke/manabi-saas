-- ============================================================
-- お月謝をつながるまなび側でも入力・削除できるようにする
--   Supabase SQL Editor で実行してください
--
-- 考え方（月単位でどちらが正かを持つ）:
--   billing_months.source = 'tsunagu' … つなぐが正。同期のたびに上書きされる
--   billing_months.source = 'manual'  … まなびが正。同期は触らず、金額が
--                                       違うときだけ知らせる
--   画面で金額に手を入れた月は、その時点で自動的に 'manual' に変わる。
--   これが無いと、せっかく入力した金額が次の同期で黙って消える。
-- ============================================================

-- 明細がどこから来たのか。手入力ぶんを見分けられるようにする。
ALTER TABLE billing_items
  ADD COLUMN IF NOT EXISTS source     text NOT NULL DEFAULT 'tsunagu',  -- tsunagu / manual
  ADD COLUMN IF NOT EXISTS note       text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

COMMENT ON COLUMN billing_items.source IS 'tsunagu=つなぐ由来 / manual=まなびで入力。manual はつなぐ側に無いので、口座振替に載せるにはつなぐへも入れる';

-- 手を入れた月が分かるように
ALTER TABLE billing_months
  ADD COLUMN IF NOT EXISTS edited_at timestamptz,
  ADD COLUMN IF NOT EXISTS edited_by text;   -- 触った講師のメール

COMMENT ON COLUMN billing_months.source IS 'tsunagu=同期で上書きしてよい / manual=まなびが正。同期は触らない';

-- 既存の明細は全部つなぐ由来
UPDATE billing_items SET source = 'tsunagu' WHERE source IS NULL;

-- 手入力ぶんを拾いやすく
CREATE INDEX IF NOT EXISTS idx_billing_items_source ON billing_items (source);
CREATE INDEX IF NOT EXISTS idx_billing_months_source ON billing_months (source, year_month);

-- ── 削除できるようにする ─────────────────────────────
-- billing-setup.sql の FOR ALL ポリシーで INSERT/UPDATE/DELETE は
-- すでに講師に許可済み。念のため再掲（単体実行できるように）。
DROP POLICY IF EXISTS billing_months_write ON billing_months;
CREATE POLICY billing_months_write ON billing_months FOR ALL
  TO authenticated USING (auth_is_teacher()) WITH CHECK (auth_is_teacher());

DROP POLICY IF EXISTS billing_items_write ON billing_items;
CREATE POLICY billing_items_write ON billing_items FOR ALL
  TO authenticated USING (auth_is_teacher()) WITH CHECK (auth_is_teacher());
