-- ============================================================
-- class-stock-parent-access.sql
-- 保護者が「自分の子」の AC 残高・利用履歴・交換申請を見られるように、
-- 既存の RLS(SELECT) に保護者条件を追加する（lessons_select と同型）。
--   前提: class-stock-setup.sql / parent-portal-setup.sql 実行済み
--         （auth_parent_student_ids() は parent-portal-setup.sql 定義）。
--   Supabase SQL Editor で実行（冪等・再実行可）。
--   ※ reward_items（商店の品揃え）は既に「ログイン済みなら閲覧可」のため変更不要。
-- ============================================================

-- ウォレット（残高）：本人・講師・保護者(子のみ)
DROP POLICY IF EXISTS wallet_select ON student_wallets;
CREATE POLICY wallet_select ON student_wallets FOR SELECT
  USING (student_id = auth_student_id()
         OR auth_is_teacher()
         OR student_id IN (SELECT auth_parent_student_ids()));

-- AC 台帳（利用履歴）：本人・講師・保護者(子のみ)
DROP POLICY IF EXISTS actx_select ON ac_transactions;
CREATE POLICY actx_select ON ac_transactions FOR SELECT
  USING (student_id = auth_student_id()
         OR auth_is_teacher()
         OR student_id IN (SELECT auth_parent_student_ids()));

-- 交換申請（何を交換/購入したか）：本人・講師・保護者(子のみ)
DROP POLICY IF EXISTS rex_select ON reward_exchanges;
CREATE POLICY rex_select ON reward_exchanges FOR SELECT
  USING (student_id = auth_student_id()
         OR auth_is_teacher()
         OR student_id IN (SELECT auth_parent_student_ids()));

-- 保有株（任意・保護者にも見せる）：本人・講師・保護者(子のみ)
DROP POLICY IF EXISTS holding_select ON class_stock_holdings;
CREATE POLICY holding_select ON class_stock_holdings FOR SELECT
  USING (student_id = auth_student_id()
         OR auth_is_teacher()
         OR student_id IN (SELECT auth_parent_student_ids()));

-- ============================================================
-- 完了。保護者は /parent/dashboard/economy で子のAC・利用履歴・商店を閲覧できる（閲覧のみ）。
-- ============================================================
