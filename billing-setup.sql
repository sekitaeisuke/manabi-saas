-- ============================================================
-- お月謝管理
--   Supabase SQL Editor で実行してください
--
-- つなぐの「料金プラン」と「契約内容確認・変更」をそのまま受ける器。
-- つなぐが正で、ai-system の scripts/sync_tsunagu_billing.py が引き継ぐ。
--
-- つなぐの数え方に合わせる:
--   ・◯月分の月謝は、前月27日に口座振替（例: 10月分 → 9月27日引き落とし）
--   ・1人の1か月ぶんは複数の明細（基本＋オプション＋設備費＋割引…）の合計
--   ・状態は 未確定 / 確定 / メール通知済み / 領収済み
-- ============================================================

-- ── 料金プラン（マスタ）──────────────────────────────
-- つなぐの料金プラン一覧。改定のたびに価格が変わるので、
-- つなぐ側の「改定」1件＝ここの1行（price_revision_id が改定の識別子）。
CREATE TABLE IF NOT EXISTS billing_plans (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tsunagu_plan_id   text,          -- つなぐの plan id
  price_revision_id text UNIQUE,   -- つなぐの改定id（契約明細が指しているのはこれ）
  kind              text NOT NULL, -- 基本 / オプション / 設備費 / パック / その他
  name              text NOT NULL, -- 例: 中学3年生（週2回）
  grades            text[],        -- 対象学年 ["中1","中2","中3"]
  price_excl        integer,       -- 税抜
  price_incl        integer,       -- 税込
  revised_at        timestamptz,   -- 改定日時
  retired           boolean NOT NULL DEFAULT false, -- 廃止されたプラン
  synced_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_billing_plans_kind ON billing_plans (kind);

-- ── 月ごとの請求（生徒×年月で1件）────────────────────
CREATE TABLE IF NOT EXISTS billing_months (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  year_month    text NOT NULL,        -- 対象月 'YYYY-MM'（例: 2026-10 ＝ 10月分）
  debit_date    date,                 -- 引き落とし日（前月27日）
  total_incl    integer NOT NULL DEFAULT 0,  -- 税込合計。明細の合計と一致させる
  total_excl    integer NOT NULL DEFAULT 0,
  status        text NOT NULL DEFAULT '未確定',  -- 未確定 / 確定 / 領収済み
  -- 保護者に見せるかどうか。確認して公開を押すまでは見えない。
  published     boolean NOT NULL DEFAULT false,
  published_at  timestamptz,
  published_by  uuid,
  note          text,                 -- 「4・5月休会」など台帳のメモ相当
  source        text NOT NULL DEFAULT 'tsunagu', -- tsunagu / manual
  synced_at     timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, year_month)
);
CREATE INDEX IF NOT EXISTS idx_billing_months_ym ON billing_months (year_month);
CREATE INDEX IF NOT EXISTS idx_billing_months_pub ON billing_months (published, year_month);

-- ── 請求の明細（つなぐの契約1行＝ここの1行）───────────
CREATE TABLE IF NOT EXISTS billing_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  billing_month_id  uuid NOT NULL REFERENCES billing_months(id) ON DELETE CASCADE,
  kind              text NOT NULL,   -- 基本 / オプション / 設備費 / パック / その他
  label             text NOT NULL,   -- 契約内容（プラン名）。保護者にはこれを見せる
  plan_id           uuid REFERENCES billing_plans(id) ON DELETE SET NULL,
  price_revision_id text,            -- つなぐの改定id（照合用）
  lesson_count      integer,         -- 授業数/月
  amount_incl       integer NOT NULL DEFAULT 0,
  amount_excl       integer NOT NULL DEFAULT 0,
  state             text,            -- つなぐ側の状態（未確定/確定/メール通知済み/領収済み）
  tsunagu_price_id  text,            -- つなぐの priceid（明細の識別子）
  sort_order        integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_billing_items_month ON billing_items (billing_month_id);

COMMENT ON TABLE  billing_months IS '生徒1人の1か月ぶんの月謝。published が true のときだけ保護者に見える';
COMMENT ON COLUMN billing_months.year_month IS '対象月。引き落としは前月27日なので debit_date とはずれる';
COMMENT ON TABLE  billing_items  IS 'つなぐの契約明細1行に対応。合計は billing_months.total_incl と一致させる';

-- ── RLS ──────────────────────────────────────────────
-- 既存のヘルパーに合わせる。teachers は auth_user_id を持たず
-- メールで突き合わせる方式なので auth_is_teacher() を使う。
-- 保護者は auth_parent_student_ids()（自分に紐づく生徒ID）で絞る。
ALTER TABLE billing_plans  ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_months ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_items  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS billing_plans_select  ON billing_plans;
DROP POLICY IF EXISTS billing_plans_write   ON billing_plans;
DROP POLICY IF EXISTS billing_months_select ON billing_months;
DROP POLICY IF EXISTS billing_months_write  ON billing_months;
DROP POLICY IF EXISTS billing_items_select  ON billing_items;
DROP POLICY IF EXISTS billing_items_write   ON billing_items;

-- プランは講師だけが見られる（保護者には料金表そのものは見せない）
CREATE POLICY billing_plans_select ON billing_plans FOR SELECT
  TO authenticated USING (auth_is_teacher());
CREATE POLICY billing_plans_write ON billing_plans FOR ALL
  TO authenticated USING (auth_is_teacher()) WITH CHECK (auth_is_teacher());

-- 月謝は 講師 または「公開済みの自分の子ぶん」だけ。
-- published を条件に入れて、確認前の金額が保護者に見えないようにする。
CREATE POLICY billing_months_select ON billing_months FOR SELECT
  TO authenticated USING (
    auth_is_teacher()
    OR (published AND student_id IN (SELECT auth_parent_student_ids()))
  );
CREATE POLICY billing_months_write ON billing_months FOR ALL
  TO authenticated USING (auth_is_teacher()) WITH CHECK (auth_is_teacher());

-- 明細は、その月の行が見えるときだけ見える（親の可視性をそのまま継ぐ）
CREATE POLICY billing_items_select ON billing_items FOR SELECT
  TO authenticated USING (
    billing_month_id IN (SELECT id FROM billing_months)
  );
CREATE POLICY billing_items_write ON billing_items FOR ALL
  TO authenticated USING (auth_is_teacher()) WITH CHECK (auth_is_teacher());
