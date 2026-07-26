-- ============================================================
-- class-stock-setup.sql
-- 自塾成長連動型「教室株式」× 塾内経済（アカデミーコイン / CLASS_STOCK）
--   Phase 1: 塾内経済コア（実課金なし。ACは現金価値を持たない塾内ポイント）
--
--   生徒の行動（チェックイン・課題・テスト・貢献）で AC を獲得し、
--   その AC で「自塾株（教室株式）」を売買できる。株価は毎週日曜 23:59 の
--   Cron で全生徒の学習・貢献・成長・ペナルティから算出・更新する。
--
--   既存の作法に合わせる:
--     - uuid PK / gen_random_uuid()
--     - 表示用の非正規化カラム（student_name 等）
--     - RLS: 生徒は「本人」のみ、講師は auth_is_teacher()、管理は auth_teacher_role()='admin'
--     - 金額の変わる処理は原子性のため RPC(SECURITY DEFINER) に閉じる
--
--   Supabase SQL Editor で実行してください（冪等・再実行可）。
-- ============================================================

-- ------------------------------------------------------------
-- STEP 0: ヘルパー関数（単体実行できるよう再定義）
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION auth_is_teacher()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM teachers WHERE email = auth.email());
$$;

CREATE OR REPLACE FUNCTION auth_teacher_role()
RETURNS text LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT role FROM teachers WHERE email = auth.email() LIMIT 1;
$$;

-- ログイン中の生徒の students.id（生徒でなければ NULL）。RLS/RPC 共用。
CREATE OR REPLACE FUNCTION auth_student_id()
RETURNS uuid LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT id FROM students WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

-- ------------------------------------------------------------
-- STEP 1: schools に自塾株の現在値を持たせる（加算的 ALTER）
--   current_stock_price … 現在の始値株価（AC単位）
--   shares_outstanding  … 参考：発行済株式数（配当計算等の将来拡張用）
-- ------------------------------------------------------------
ALTER TABLE schools ADD COLUMN IF NOT EXISTS current_stock_price integer NOT NULL DEFAULT 1000;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS shares_outstanding integer NOT NULL DEFAULT 0;

-- ------------------------------------------------------------
-- STEP 2: 生徒ウォレット（保有AC・投資運用中AC）
--   balance       … 保有AC（自由に使える）
--   locked_balance… 自塾株に投資運用中のAC（取得原価ベース）
--   破産防止: locked_balance <= (balance + locked_balance) * 0.50
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS student_wallets (
  student_id     uuid PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
  balance        integer NOT NULL DEFAULT 0 CHECK (balance >= 0),
  locked_balance integer NOT NULL DEFAULT 0 CHECK (locked_balance >= 0),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- STEP 3: AC 台帳（追記のみ・監査可能）
--   正: 獲得/付与、負: 消費/投資支出。type は将来拡張のため text + CHECK。
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ac_transactions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id   uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  student_name text,                                   -- 表示用に非正規化
  amount       integer NOT NULL,                        -- 正=増加 / 負=減少
  type         text NOT NULL CHECK (type IN (
                 'EARN_CHECKIN','EARN_TASK','EARN_TEST','EARN_CONTRIBUTION',
                 'INVEST_BUY_STOCK','INVEST_SELL_STOCK','INVEST_DIVIDEND',
                 'EXCHANGE_REWARD','ADMIN_ADJUSTMENT')),
  description  text NOT NULL DEFAULT '',
  meta         jsonb,                                   -- {shares, price, ...}
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_actx_student ON ac_transactions(student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_actx_type    ON ac_transactions(type);

-- ------------------------------------------------------------
-- STEP 4: 自塾株の価格変動履歴（校舎ごと・週次）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS class_stock_history (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  price         integer NOT NULL,                       -- 算出後の株価
  prev_price    integer,                                -- 直前株価（変化率表示用）
  study_score   double precision NOT NULL DEFAULT 0,    -- 週次 学習貢献 Δ
  contrib_score double precision NOT NULL DEFAULT 0,    -- 週次 教室貢献 Δ
  growth_score  double precision NOT NULL DEFAULT 0,    -- 週次 成長(入塾等) Δ
  penalty_score double precision NOT NULL DEFAULT 0,    -- 週次 ペナルティ Δ
  detail        jsonb,                                  -- 集計の内訳（監査用）
  calculated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_csh_school ON class_stock_history(school_id, calculated_at DESC);

-- ------------------------------------------------------------
-- STEP 5: 生徒の自塾株 保有状況（生徒は自校の株のみ保有＝1行）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS class_stock_holdings (
  student_id uuid PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
  school_id  uuid REFERENCES schools(id) ON DELETE SET NULL,
  shares     integer NOT NULL DEFAULT 0 CHECK (shares >= 0),
  avg_price  integer NOT NULL DEFAULT 0,                -- 平均取得単価（AC）
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- STEP 6: 貢献イベント（清掃・消毒・自習室ルール遵守 等）
--   株価の Δcontrib と生徒のAC獲得(EARN_CONTRIBUTION)の両方の源泉。
--   penalty 系（遅刻・宿題未提出）も同表に負イベントとして記録できる。
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contribution_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id   uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  student_name text,
  school_id    uuid REFERENCES schools(id) ON DELETE SET NULL,
  teacher_id   uuid REFERENCES teachers(id) ON DELETE SET NULL,
  teacher_name text,
  kind         text NOT NULL,                           -- 'clean'|'disinfect'|'rule'|'tardy'|'homework_missing'|...
  polarity     text NOT NULL DEFAULT 'positive' CHECK (polarity IN ('positive','negative')),
  note         text,
  occurred_on  date NOT NULL DEFAULT current_date,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ce_school ON contribution_events(school_id, occurred_on DESC);
CREATE INDEX IF NOT EXISTS idx_ce_student ON contribution_events(student_id, occurred_on DESC);

-- ------------------------------------------------------------
-- STEP 7: チェックイン（1日1回のログイン報酬）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS check_ins (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  checkin_on date NOT NULL DEFAULT current_date,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, checkin_on)                        -- 1日1回を構造で担保
);

-- ------------------------------------------------------------
-- STEP 8: 報酬アイテム マスター ＋ 交換申請
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reward_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid REFERENCES schools(id) ON DELETE CASCADE,  -- NULL=全校共通
  title       text NOT NULL,
  description text NOT NULL DEFAULT '',
  cost        integer NOT NULL CHECK (cost > 0),
  stock       integer,                                        -- NULL=無制限
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reward_exchanges (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  student_name text,
  reward_id   uuid NOT NULL REFERENCES reward_items(id) ON DELETE RESTRICT,
  reward_title text,                                          -- 表示用に非正規化
  cost        integer NOT NULL,                               -- 交換時点の必要AC（AC は交換時に前引き）
  status      text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','approved','rejected','completed')),
  decided_by  text,                                           -- 承認/却下した講師 email
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rex_status ON reward_exchanges(status, created_at DESC);

-- ------------------------------------------------------------
-- STEP 9: updated_at 自動更新トリガー（共通関数を再利用）
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_wallet_touch ON student_wallets;
CREATE TRIGGER trg_wallet_touch BEFORE UPDATE ON student_wallets
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
DROP TRIGGER IF EXISTS trg_holding_touch ON class_stock_holdings;
CREATE TRIGGER trg_holding_touch BEFORE UPDATE ON class_stock_holdings
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
DROP TRIGGER IF EXISTS trg_rex_touch ON reward_exchanges;
CREATE TRIGGER trg_rex_touch BEFORE UPDATE ON reward_exchanges
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ============================================================
-- STEP 10: RLS
--   読取り: 生徒は本人 / 講師は全件（管理・監査のため）
--   書込み: 台帳・ウォレット・保有は RPC(SECURITY DEFINER) 経由のみ。
--           直接 INSERT/UPDATE は許可しない（なりすまし・二重計上防止）。
-- ============================================================
ALTER TABLE student_wallets      ENABLE ROW LEVEL SECURITY;
ALTER TABLE ac_transactions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_stock_history  ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_stock_holdings ENABLE ROW LEVEL SECURITY;
ALTER TABLE contribution_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE check_ins            ENABLE ROW LEVEL SECURITY;
ALTER TABLE reward_items         ENABLE ROW LEVEL SECURITY;
ALTER TABLE reward_exchanges     ENABLE ROW LEVEL SECURITY;

-- wallets: 本人 or 講師が参照。書込みは RPC(service definer) のみ。
DROP POLICY IF EXISTS wallet_select ON student_wallets;
CREATE POLICY wallet_select ON student_wallets FOR SELECT
  USING (student_id = auth_student_id() OR auth_is_teacher());

-- ac_transactions: 本人 or 講師が参照。
DROP POLICY IF EXISTS actx_select ON ac_transactions;
CREATE POLICY actx_select ON ac_transactions FOR SELECT
  USING (student_id = auth_student_id() OR auth_is_teacher());

-- class_stock_history: ログイン済みなら誰でも参照（自校株価は生徒に見せる）。
DROP POLICY IF EXISTS csh_select ON class_stock_history;
CREATE POLICY csh_select ON class_stock_history FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- holdings: 本人 or 講師。
DROP POLICY IF EXISTS holding_select ON class_stock_holdings;
CREATE POLICY holding_select ON class_stock_holdings FOR SELECT
  USING (student_id = auth_student_id() OR auth_is_teacher());

-- contribution_events: 本人 or 講師が参照。作成/更新は講師のみ（記録の主体は講師）。
DROP POLICY IF EXISTS ce_select ON contribution_events;
CREATE POLICY ce_select ON contribution_events FOR SELECT
  USING (student_id = auth_student_id() OR auth_is_teacher());
DROP POLICY IF EXISTS ce_write ON contribution_events;
CREATE POLICY ce_write ON contribution_events FOR ALL
  USING (auth_is_teacher()) WITH CHECK (auth_is_teacher());

-- check_ins: 本人 or 講師が参照。作成は RPC 経由。
DROP POLICY IF EXISTS ci_select ON check_ins;
CREATE POLICY ci_select ON check_ins FOR SELECT
  USING (student_id = auth_student_id() OR auth_is_teacher());

-- reward_items: ログイン済みなら参照可。編集は講師のみ。
DROP POLICY IF EXISTS ri_select ON reward_items;
CREATE POLICY ri_select ON reward_items FOR SELECT
  USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS ri_write ON reward_items;
CREATE POLICY ri_write ON reward_items FOR ALL
  USING (auth_is_teacher()) WITH CHECK (auth_is_teacher());

-- reward_exchanges: 本人 or 講師が参照。作成/更新は RPC・講師経由。
DROP POLICY IF EXISTS rex_select ON reward_exchanges;
CREATE POLICY rex_select ON reward_exchanges FOR SELECT
  USING (student_id = auth_student_id() OR auth_is_teacher());

-- ============================================================
-- STEP 11: 原子的 RPC（金額の変わる処理はすべてここに閉じる）
--   すべて SECURITY DEFINER。呼び出し前の認可は API ルート側で行う
--   （生徒本人チェック / requireTeacher）。RPC 内でも本人整合を再検証する。
-- ============================================================

-- ウォレット行を確実に用意する内部関数
CREATE OR REPLACE FUNCTION ensure_wallet(p_student uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO student_wallets (student_id) VALUES (p_student)
  ON CONFLICT (student_id) DO NOTHING;
END;
$$;

-- 汎用 AC 付与（講師/管理/システムから）。負値も可（調整）。
-- 返り値: 新残高。ウォレットが負にならないよう下限0でクランプ。
CREATE OR REPLACE FUNCTION ac_award(
  p_student uuid, p_amount integer, p_type text, p_desc text DEFAULT '', p_meta jsonb DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_name text; v_new integer;
BEGIN
  PERFORM ensure_wallet(p_student);
  SELECT name INTO v_name FROM students WHERE id = p_student;
  UPDATE student_wallets
     SET balance = GREATEST(0, balance + p_amount)
   WHERE student_id = p_student
   RETURNING balance INTO v_new;
  INSERT INTO ac_transactions (student_id, student_name, amount, type, description, meta)
  VALUES (p_student, v_name, p_amount, p_type, COALESCE(p_desc,''), p_meta);
  RETURN v_new;
END;
$$;

-- チェックイン（1日1回）。既に本日分があれば amount=0 / already=true を返す。
CREATE OR REPLACE FUNCTION ac_checkin(p_student uuid, p_reward integer DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_new integer; v_bal integer;
BEGIN
  PERFORM ensure_wallet(p_student);
  BEGIN
    INSERT INTO check_ins (student_id) VALUES (p_student);
  EXCEPTION WHEN unique_violation THEN
    SELECT balance INTO v_bal FROM student_wallets WHERE student_id = p_student;
    RETURN jsonb_build_object('already', true, 'awarded', 0, 'balance', v_bal);
  END;
  v_new := ac_award(p_student, p_reward, 'EARN_CHECKIN', '本日のチェックイン');
  RETURN jsonb_build_object('already', false, 'awarded', p_reward, 'balance', v_new);
END;
$$;

-- 自塾株 買付。50%アロケーション制限・現在株価は schools.current_stock_price。
CREATE OR REPLACE FUNCTION buy_class_stock(p_student uuid, p_shares integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_school uuid; v_name text; v_price integer; v_cost integer;
  v_bal integer; v_locked integer; v_total integer; v_max_locked integer;
  v_shares integer; v_avg integer;
BEGIN
  IF p_shares IS NULL OR p_shares <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', '株数が不正です');
  END IF;
  PERFORM ensure_wallet(p_student);
  SELECT s.school_id, s.name INTO v_school, v_name FROM students s WHERE s.id = p_student;
  IF v_school IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', '所属校舎が未設定です');
  END IF;
  SELECT current_stock_price INTO v_price FROM schools WHERE id = v_school;
  v_cost := v_price * p_shares;

  SELECT balance, locked_balance INTO v_bal, v_locked
    FROM student_wallets WHERE student_id = p_student FOR UPDATE;
  IF v_cost > v_bal THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ACが不足しています', 'need', v_cost, 'balance', v_bal);
  END IF;
  -- 破産防止: 投資後の locked が (balance+locked) の 50% を超えない
  v_total := v_bal + v_locked;                       -- 買付では総額不変
  v_max_locked := (v_total * 0.50)::int;
  IF v_locked + v_cost > v_max_locked THEN
    RETURN jsonb_build_object('ok', false, 'error',
      'ウォレットの50%を超える投資はできません（破産防止）',
      'max_investable', GREATEST(0, v_max_locked - v_locked));
  END IF;

  -- ウォレット: balance -> locked へ移動
  UPDATE student_wallets
     SET balance = balance - v_cost, locked_balance = locked_balance + v_cost
   WHERE student_id = p_student;

  -- 保有: 平均取得単価を更新
  INSERT INTO class_stock_holdings (student_id, school_id, shares, avg_price)
  VALUES (p_student, v_school, p_shares, v_price)
  ON CONFLICT (student_id) DO UPDATE
     SET shares    = class_stock_holdings.shares + EXCLUDED.shares,
         avg_price = ((class_stock_holdings.shares * class_stock_holdings.avg_price)
                      + (EXCLUDED.shares * EXCLUDED.avg_price))
                     / NULLIF(class_stock_holdings.shares + EXCLUDED.shares, 0),
         school_id = EXCLUDED.school_id
  RETURNING shares, avg_price INTO v_shares, v_avg;

  INSERT INTO ac_transactions (student_id, student_name, amount, type, description, meta)
  VALUES (p_student, v_name, -v_cost, 'INVEST_BUY_STOCK',
          format('自塾株 %s株 買付 @%s', p_shares, v_price),
          jsonb_build_object('shares', p_shares, 'price', v_price));

  RETURN jsonb_build_object('ok', true, 'shares', v_shares, 'avg_price', v_avg,
                            'price', v_price, 'cost', v_cost);
END;
$$;

-- 自塾株 売却。売却代金 = 株数 * 現在株価。locked は取得原価ぶん減らす。
CREATE OR REPLACE FUNCTION sell_class_stock(p_student uuid, p_shares integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_school uuid; v_name text; v_price integer; v_proceeds integer;
  v_shares integer; v_avg integer; v_cost_basis integer; v_locked integer;
BEGIN
  IF p_shares IS NULL OR p_shares <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', '株数が不正です');
  END IF;
  SELECT school_id, shares, avg_price INTO v_school, v_shares, v_avg
    FROM class_stock_holdings WHERE student_id = p_student FOR UPDATE;
  IF v_shares IS NULL OR v_shares < p_shares THEN
    RETURN jsonb_build_object('ok', false, 'error', '保有株数が足りません', 'have', COALESCE(v_shares,0));
  END IF;
  SELECT name INTO v_name FROM students WHERE id = p_student;
  SELECT current_stock_price INTO v_price FROM schools WHERE id = v_school;
  v_proceeds   := v_price * p_shares;
  v_cost_basis := v_avg   * p_shares;

  PERFORM ensure_wallet(p_student);
  SELECT locked_balance INTO v_locked FROM student_wallets WHERE student_id = p_student FOR UPDATE;
  -- 売却: 代金を balance に戻し、locked から取得原価ぶんを差し引く（下限0）
  UPDATE student_wallets
     SET balance = balance + v_proceeds,
         locked_balance = GREATEST(0, locked_balance - v_cost_basis)
   WHERE student_id = p_student;

  UPDATE class_stock_holdings
     SET shares = shares - p_shares,
         avg_price = CASE WHEN shares - p_shares = 0 THEN 0 ELSE avg_price END
   WHERE student_id = p_student
   RETURNING shares INTO v_shares;

  INSERT INTO ac_transactions (student_id, student_name, amount, type, description, meta)
  VALUES (p_student, v_name, v_proceeds, 'INVEST_SELL_STOCK',
          format('自塾株 %s株 売却 @%s', p_shares, v_price),
          jsonb_build_object('shares', p_shares, 'price', v_price,
                             'pl', v_proceeds - v_cost_basis));

  RETURN jsonb_build_object('ok', true, 'shares', v_shares, 'price', v_price,
                            'proceeds', v_proceeds, 'pl', v_proceeds - v_cost_basis);
END;
$$;

-- 報酬交換申請（AC を交換時に前引き。却下時は refund_reward で返金）。
CREATE OR REPLACE FUNCTION redeem_reward(p_student uuid, p_reward uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_cost integer; v_title text; v_active boolean; v_stock integer;
        v_name text; v_bal integer; v_exid uuid;
BEGIN
  SELECT cost, title, active, stock INTO v_cost, v_title, v_active, v_stock
    FROM reward_items WHERE id = p_reward;
  IF v_cost IS NULL OR v_active IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'error', 'この報酬は交換できません');
  END IF;
  IF v_stock IS NOT NULL AND v_stock <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', '在庫切れです');
  END IF;
  PERFORM ensure_wallet(p_student);
  SELECT balance INTO v_bal FROM student_wallets WHERE student_id = p_student FOR UPDATE;
  IF v_bal < v_cost THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ACが不足しています', 'need', v_cost, 'balance', v_bal);
  END IF;
  SELECT name INTO v_name FROM students WHERE id = p_student;

  UPDATE student_wallets SET balance = balance - v_cost WHERE student_id = p_student;
  IF v_stock IS NOT NULL THEN
    UPDATE reward_items SET stock = stock - 1 WHERE id = p_reward;
  END IF;
  INSERT INTO reward_exchanges (student_id, student_name, reward_id, reward_title, cost, status)
  VALUES (p_student, v_name, p_reward, v_title, v_cost, 'pending')
  RETURNING id INTO v_exid;
  INSERT INTO ac_transactions (student_id, student_name, amount, type, description, meta)
  VALUES (p_student, v_name, -v_cost, 'EXCHANGE_REWARD', format('報酬交換: %s', v_title),
          jsonb_build_object('reward_id', p_reward, 'exchange_id', v_exid));

  RETURN jsonb_build_object('ok', true, 'exchange_id', v_exid, 'balance', v_bal - v_cost);
END;
$$;

-- 交換の承認/却下（講師）。却下時は AC と在庫を返す。
CREATE OR REPLACE FUNCTION decide_reward_exchange(p_exchange uuid, p_approve boolean, p_by text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_student uuid; v_reward uuid; v_cost integer; v_status text; v_name text;
BEGIN
  SELECT student_id, reward_id, cost, status, student_name
    INTO v_student, v_reward, v_cost, v_status, v_name
    FROM reward_exchanges WHERE id = p_exchange FOR UPDATE;
  IF v_status IS NULL OR v_status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'この申請は処理済みです');
  END IF;
  IF p_approve THEN
    UPDATE reward_exchanges SET status = 'approved', decided_by = p_by WHERE id = p_exchange;
    RETURN jsonb_build_object('ok', true, 'status', 'approved');
  ELSE
    -- 返金＋在庫戻し
    PERFORM ac_award(v_student, v_cost, 'ADMIN_ADJUSTMENT', format('報酬交換の却下による返金'));
    UPDATE reward_items SET stock = stock + 1 WHERE id = v_reward AND stock IS NOT NULL;
    UPDATE reward_exchanges SET status = 'rejected', decided_by = p_by WHERE id = p_exchange;
    RETURN jsonb_build_object('ok', true, 'status', 'rejected');
  END IF;
END;
$$;

-- ============================================================
-- STEP 12: RPC の実行権限を service_role のみに絞る（重要）
--   SECURITY DEFINER 関数は既定で PUBLIC に EXECUTE が付く。そのままだと生徒が
--   ブラウザの anon セッションから p_student を任意指定して他人のウォレットを
--   操作／自分に AC 付与できてしまう。これらは必ず API ルート（requireStudent /
--   requireTeacher で認可）を通し、service role でのみ呼ばせる。
-- ============================================================
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'ensure_wallet(uuid)',
    'ac_award(uuid,integer,text,text,jsonb)',
    'ac_checkin(uuid,integer)',
    'buy_class_stock(uuid,integer)',
    'sell_class_stock(uuid,integer)',
    'redeem_reward(uuid,uuid)',
    'decide_reward_exchange(uuid,boolean,text)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated;', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role;', fn);
  END LOOP;
END $$;

-- ============================================================
-- 完了。次に週次株価 Cron 用の集計は API(/api/cron/calculate-stock) 側で行い、
-- 算出結果を class_stock_history へ INSERT・schools.current_stock_price を UPDATE する。
-- ============================================================
