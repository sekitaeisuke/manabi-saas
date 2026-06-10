-- ============================================================
-- データ整合性の補強（採点・提出まわり）
--   Supabase SQL Editor で実行してください。
--   ⚠ 既存データに重複がある場合は先に重複を解消してから実行すること
--      （重複があると UNIQUE 制約の作成が失敗する）。
-- ============================================================

-- ── results：同一セッション×生徒名で1件のみ（二重提出の競合を防止）──
--   submit ルートは事前 SELECT で重複を弾いているが、ほぼ同時の二重送信では
--   両方が「無し」と判定して二重 INSERT し得る。DB 側で最終的に防ぐ。
ALTER TABLE results
  ADD CONSTRAINT results_session_student_unique
  UNIQUE (session_id, student_name);

-- ── answers：同一セッション×生徒名×設問で1件のみ ──
ALTER TABLE answers
  ADD CONSTRAINT answers_session_student_question_unique
  UNIQUE (session_id, student_name, question_id);

-- 補足（アプリ側で対応済み／推奨）：
--   * submit ルートの results 事前チェックは (session_id, student_name) キー。
--     同名生徒の取り違えを避けるには student_id を併用するのが望ましい。
--   * answers→results→lesson_reports/questionnaire_responses の複数INSERTは
--     本来トランザクション（RPC: SECURITY DEFINER 関数）で一括化し、途中失敗時の
--     孤児行を防ぐのが理想。導入する場合は submit ルートを supabase.rpc(...) 化する。
