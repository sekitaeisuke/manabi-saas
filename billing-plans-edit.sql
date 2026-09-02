-- ============================================================
-- 料金プランをまなび側で追加・修正・削除できるようにする
--   Supabase SQL Editor で実行してください
--
-- これまで同期は billing_plans を毎回まるごと消して入れ直していた。
-- そのため（1）手で直した内容が消える（2）明細からプランへの紐づけが
-- 毎回切れる、という2つの問題があった。
--
-- これ以降は「種別＋プラン名」で突き合わせて更新する（upsert）。
-- つなぐから消えたプランは、削除せず retired=true にする。
-- 明細が参照しているので、消すと過去の請求から名前が辿れなくなるため。
-- ============================================================

ALTER TABLE billing_plans
  ADD COLUMN IF NOT EXISTS source     text NOT NULL DEFAULT 'tsunagu',  -- tsunagu / manual
  ADD COLUMN IF NOT EXISTS note       text,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

COMMENT ON COLUMN billing_plans.source IS 'tsunagu=つなぐ由来（同期で更新される）/ manual=まなびで作った・直した。同期は触らない';
COMMENT ON COLUMN billing_plans.retired IS 'true=もう使わない。過去の明細が参照しているので行は消さない';

-- 突き合わせの鍵。ここが重複していると upsert できない。
-- 念のため、先に重複が無いことを確かめてから貼ること:
--   select kind, name, count(*) from billing_plans group by 1,2 having count(*) > 1;
CREATE UNIQUE INDEX IF NOT EXISTS uq_billing_plans_kind_name
  ON billing_plans (kind, name);

CREATE INDEX IF NOT EXISTS idx_billing_plans_source ON billing_plans (source, retired);

-- 既存はすべてつなぐ由来
UPDATE billing_plans SET source = 'tsunagu' WHERE source IS NULL;

-- ── RLS（単体実行できるよう再掲）─────────────────────
DROP POLICY IF EXISTS billing_plans_write ON billing_plans;
CREATE POLICY billing_plans_write ON billing_plans FOR ALL
  TO authenticated USING (auth_is_teacher()) WITH CHECK (auth_is_teacher());
