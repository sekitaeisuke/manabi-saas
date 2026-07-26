-- ============================================================
-- class-stock-earn-setup.sql
-- 塾内経済 Phase 2：AC獲得の自動化 ＋ 紹介(講師確認型) ＋ 購入ショップ拡張
--
--   前提：class-stock-setup.sql（Phase 1）実行済み。
--   このスクリプトは冪等・再実行可。Supabase SQL Editor で実行してください。
--
--   要点：
--     - ac_transactions に source_type/source_id を足し、ユニーク索引で
--       「同じ源泉は一度だけ付与」を DB で担保（自動スキャンの二重付与を根絶）。
--     - ac_rules で pt・合格ラインを表側で編集可能に（コード直書きにしない）。
--     - ac_award_once RPC：source key で冪等付与。EXECUTE は service_role のみ。
--     - referral_rewards ＋ award_referral（紹介1000/被紹介100）。
--     - reward_items に category/image_url（購入ショップのカテゴリ表示）。
-- ============================================================

-- ------------------------------------------------------------
-- STEP 1: ac_transactions に冪等キー ＋ type 種別の拡張
-- ------------------------------------------------------------
ALTER TABLE ac_transactions ADD COLUMN IF NOT EXISTS source_type text;
ALTER TABLE ac_transactions ADD COLUMN IF NOT EXISTS source_id   text;

-- (source_type, source_id) の一意。NULL 同士は「相異」と扱われるため（Postgres 既定）、
-- Phase1 の source 無し行（NULL,NULL）は何行あってもOK。非NULLの源泉ペアだけ一意になる。
CREATE UNIQUE INDEX IF NOT EXISTS idx_actx_source ON ac_transactions(source_type, source_id);

-- type の CHECK を拡張（自動獲得・紹介の種別を追加）。
ALTER TABLE ac_transactions DROP CONSTRAINT IF EXISTS ac_transactions_type_check;
ALTER TABLE ac_transactions ADD CONSTRAINT ac_transactions_type_check CHECK (type IN (
  'EARN_CHECKIN','EARN_TASK','EARN_TEST','EARN_CONTRIBUTION',
  'EARN_ATTENDANCE','EARN_MANABI','EARN_REPORT','EARN_REFERRAL','EARN_REFERRED',
  'INVEST_BUY_STOCK','INVEST_SELL_STOCK','INVEST_DIVIDEND',
  'EXCHANGE_REWARD','ADMIN_ADJUSTMENT'));

-- ------------------------------------------------------------
-- STEP 2: 獲得ルール表（pt・合格ライン・ON/OFF を admin が編集）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ac_rules (
  event_key   text PRIMARY KEY,     -- 'attend'|'testpass'|'manabi'|'report'|'clean'|'refer'|'refereed'
  label       text NOT NULL,
  points      integer NOT NULL DEFAULT 0,
  threshold   integer,              -- 合格ライン等（testpass の % など・不要なら NULL）
  enabled     boolean NOT NULL DEFAULT true,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO ac_rules (event_key, label, points, threshold, enabled) VALUES
  ('attend',   '出席（顔認証入室）',        3,   NULL, true),
  ('testpass', '確認テスト合格',            10,  80,   true),
  ('manabi',   'まなび使用（教材進捗）',    1,   NULL, true),
  ('report',   '報告書提出',                0,   NULL, false),
  ('clean',    '掃除（kiosk）',             1,   NULL, true),
  ('refer',    '友人紹介（紹介者）',        1000, NULL, true),
  ('refereed', '友人紹介（被紹介者）',      100, NULL, true)
ON CONFLICT (event_key) DO NOTHING;   -- 既存値は上書きしない（運用中の調整を尊重）

DROP TRIGGER IF EXISTS trg_ac_rules_touch ON ac_rules;
CREATE TRIGGER trg_ac_rules_touch BEFORE UPDATE ON ac_rules
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

ALTER TABLE ac_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ac_rules_select ON ac_rules;
CREATE POLICY ac_rules_select ON ac_rules FOR SELECT USING (auth_is_teacher());
DROP POLICY IF EXISTS ac_rules_write ON ac_rules;
CREATE POLICY ac_rules_write ON ac_rules FOR ALL
  USING (auth_teacher_role() = 'admin') WITH CHECK (auth_teacher_role() = 'admin');

-- ------------------------------------------------------------
-- STEP 3: 冪等付与 RPC（source key で「一度だけ」付与）
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION ac_award_once(
  p_student uuid, p_amount integer, p_type text, p_desc text,
  p_source_type text, p_source_id text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_name text; v_cnt integer;
BEGIN
  IF p_amount IS NULL OR p_amount = 0 THEN RETURN 0; END IF;
  PERFORM ensure_wallet(p_student);
  SELECT name INTO v_name FROM students WHERE id = p_student;
  INSERT INTO ac_transactions (student_id, student_name, amount, type, description, source_type, source_id)
  VALUES (p_student, v_name, p_amount, p_type, COALESCE(p_desc,''), p_source_type, p_source_id)
  ON CONFLICT (source_type, source_id) DO NOTHING;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  IF v_cnt = 0 THEN RETURN 0; END IF;             -- 既に付与済み → 何もしない
  UPDATE student_wallets SET balance = GREATEST(0, balance + p_amount) WHERE student_id = p_student;
  RETURN p_amount;
END;
$$;

-- ------------------------------------------------------------
-- STEP 4: 紹介（講師確認型）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS referral_rewards (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  referrer_name      text,
  friend_name        text NOT NULL,
  friend_student_id  uuid REFERENCES students(id) ON DELETE SET NULL,  -- 入塾後に紐付け
  status             text NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','enrolled','completed')),
  referrer_pt        integer NOT NULL DEFAULT 1000,
  friend_pt          integer NOT NULL DEFAULT 100,
  note               text,
  created_by         text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ref_status ON referral_rewards(status, created_at DESC);

DROP TRIGGER IF EXISTS trg_ref_touch ON referral_rewards;
CREATE TRIGGER trg_ref_touch BEFORE UPDATE ON referral_rewards
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

ALTER TABLE referral_rewards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ref_select ON referral_rewards;
CREATE POLICY ref_select ON referral_rewards FOR SELECT
  USING (referrer_student_id = auth_student_id()
         OR friend_student_id = auth_student_id()
         OR auth_is_teacher());
-- 作成/更新は RPC（service role）経由のみ。

-- 紹介の段階付与。stage='refer'（入塾確定→紹介者へ）/ 'friend'（友人が生徒化→被紹介者へ）。
CREATE OR REPLACE FUNCTION award_referral(p_referral uuid, p_stage text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE r referral_rewards%ROWTYPE; v_awarded integer;
BEGIN
  SELECT * INTO r FROM referral_rewards WHERE id = p_referral FOR UPDATE;
  IF r.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', '紹介が見つかりません'); END IF;

  IF p_stage = 'refer' THEN
    v_awarded := ac_award_once(r.referrer_student_id, r.referrer_pt, 'EARN_REFERRAL',
      format('友人紹介（%s さんの入塾）', r.friend_name), 'refer', p_referral::text);
    UPDATE referral_rewards SET status = 'enrolled' WHERE id = p_referral AND status = 'pending';
    RETURN jsonb_build_object('ok', true, 'stage', 'refer', 'awarded', v_awarded);

  ELSIF p_stage = 'friend' THEN
    IF r.friend_student_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', '被紹介者(生徒)が未紐付けです');
    END IF;
    v_awarded := ac_award_once(r.friend_student_id, r.friend_pt, 'EARN_REFERRED',
      format('友人紹介ボーナス（%s さんの紹介）', COALESCE(r.referrer_name,'')), 'refereed', p_referral::text);
    UPDATE referral_rewards SET status = 'completed' WHERE id = p_referral;
    RETURN jsonb_build_object('ok', true, 'stage', 'friend', 'awarded', v_awarded);
  END IF;
  RETURN jsonb_build_object('ok', false, 'error', 'stage は refer / friend');
END;
$$;

-- ------------------------------------------------------------
-- STEP 5: 購入ショップ拡張（カテゴリ・画像）
-- ------------------------------------------------------------
ALTER TABLE reward_items ADD COLUMN IF NOT EXISTS category  text NOT NULL DEFAULT 'goods';
ALTER TABLE reward_items ADD COLUMN IF NOT EXISTS image_url text;
-- category: 'goods'|'card'|'pass'|'online'|'other'

-- seed（存在しなければ入れる。全校共通 school_id=NULL）
INSERT INTO reward_items (title, description, cost, category, active)
SELECT v.title, v.description, v.cost, v.category, true
FROM (VALUES
  ('オリジナルグッズ', '塾オリジナルの文房具などと交換', 500, 'goods'),
  ('友人紹介カード',   '友だちに渡せる紹介カード（入塾で紹介ボーナス）', 300, 'card'),
  ('1週間通い放題',    '1週間、自習室・授業を使い放題', 3000, 'pass'),
  ('オンライン授業1回','オンラインで個別授業を1コマ', 2000, 'online')
) AS v(title, description, cost, category)
WHERE NOT EXISTS (SELECT 1 FROM reward_items ri WHERE ri.title = v.title);

-- ------------------------------------------------------------
-- STEP 6: RPC の EXECUTE を service_role のみに（Phase1 と同じ方針）
-- ------------------------------------------------------------
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'ac_award_once(uuid,integer,text,text,text,text)',
    'award_referral(uuid,text)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated;', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role;', fn);
  END LOOP;
END $$;

-- ============================================================
-- 完了。獲得の自動付与は API(/api/economy/scan-earnings) が直近N日窓で各ソースを読み、
-- ac_award_once を source key 付きで呼ぶ（毎回走査しても冪等）。
-- ============================================================
