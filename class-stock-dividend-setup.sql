-- ============================================================
-- class-stock-dividend-setup.sql
-- 株主配当（AC配当）＋ 株主限定グッズ
--   ① AC配当：毎週の株価計算のたびに、保有株数に応じて AC を自動付与（INVEST_DIVIDEND）。
--      配当レート（1株あたり/週）は ac_rules の 'dividend' で編集（講師画面）。
--   ② 株主限定グッズ：reward_items に min_shares を追加。◯株以上の株主のみ交換可。
--   Supabase SQL Editor で実行（冪等）。前提: class-stock-setup.sql / *-earn-setup.sql。
-- ============================================================

-- ① 配当レート（ac_rules に1行）。points = 1株あたり毎週の配当AC。
INSERT INTO ac_rules (event_key, label, points, threshold, enabled)
VALUES ('dividend', '株主配当（1株あたり/週）', 1, NULL, true)
ON CONFLICT (event_key) DO NOTHING;

-- ② 株主限定グッズ：必要株数
ALTER TABLE reward_items ADD COLUMN IF NOT EXISTS min_shares integer NOT NULL DEFAULT 0;

-- redeem_reward を株主限定チェック付きに更新（CREATE OR REPLACE・既存の grant は維持）
CREATE OR REPLACE FUNCTION redeem_reward(p_student uuid, p_reward uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_cost integer; v_title text; v_active boolean; v_stock integer; v_min integer;
        v_name text; v_bal integer; v_shares integer; v_exid uuid;
BEGIN
  SELECT cost, title, active, stock, COALESCE(min_shares,0)
    INTO v_cost, v_title, v_active, v_stock, v_min
    FROM reward_items WHERE id = p_reward;
  IF v_cost IS NULL OR v_active IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'error', 'この報酬は交換できません');
  END IF;
  IF v_stock IS NOT NULL AND v_stock <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', '在庫切れです');
  END IF;
  -- 株主限定：保有株数チェック
  IF v_min > 0 THEN
    SELECT COALESCE(shares,0) INTO v_shares FROM class_stock_holdings WHERE student_id = p_student;
    IF COALESCE(v_shares,0) < v_min THEN
      RETURN jsonb_build_object('ok', false, 'error', format('株主限定です（%s株以上で交換できます）', v_min));
    END IF;
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

-- 念のため EXECUTE を service_role のみに（再実行でも安全）
REVOKE ALL ON FUNCTION redeem_reward(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION redeem_reward(uuid,uuid) TO service_role;

-- ============================================================
-- 完了。配当は /api/cron/calculate-stock（週次）で保有株×レートを INVEST_DIVIDEND 付与（冪等）。
-- 株主限定グッズは reward_items.min_shares>0 のアイテム（◯株以上で交換可）。
-- ============================================================
