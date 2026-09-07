-- ============================================================
-- テスト作成機能の品質改良
--   Supabase SQL Editor でそのまま実行する（何度流しても安全）
--
-- 入れるもの:
--   ① questions に列を足す
--      … いままで difficulty / section を保存していなかったため、保存したテストを
--        開き直すと「基礎・標準・応用」のまとまりが復元できなかった。
--        あわせて 解説(explanation)・国語の本文(passage) と、検算の結果を持たせる。
--   ② question_bank … 一度作った問題を貯めて使い回す問題バンク
--
-- 既存データは触らない（追加する列はすべて NULL 可）。
-- ============================================================

-- 講師判定。rls-hardening.sql と同じ定義（この1本だけでも流せるように再掲）。
CREATE OR REPLACE FUNCTION auth_is_teacher()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM teachers WHERE email = auth.email());
$$;

-- ============================================================
-- ① questions の列追加
-- ============================================================
ALTER TABLE questions ADD COLUMN IF NOT EXISTS difficulty   text;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS section      text;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS explanation  text;
-- 国語の読解: 同じ本文にぶら下がる設問は同じ passage_id を持つ。
-- 本文そのものは各行に持たせる（設問だけを別テストへ持ち出しても本文が付いてくる）。
ALTER TABLE questions ADD COLUMN IF NOT EXISTS passage      text;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS passage_id   text;
-- 検算（別のAIに正解を伏せて解かせる工程）の結果。
--   ok / fixed / needs_review / unverified
ALTER TABLE questions ADD COLUMN IF NOT EXISTS verify_status text;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS verify_note   text;

CREATE INDEX IF NOT EXISTS idx_questions_passage ON questions (test_id, passage_id);


-- ============================================================
-- ② 問題バンク
--   テストを保存するたびに、その問題をここへ貯める。
--   次にテストを作るときは、まずここから使える問題を拾い、
--   足りない分だけAIに作らせる（生成時間・APIコストが下がり、重複も止まる）。
--
--   text_key は問題文をゆるく正規化したもの。これで同じ問題を二度貯めない。
-- ============================================================
CREATE TABLE IF NOT EXISTS question_bank (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  subject         text NOT NULL,
  grade           text NOT NULL,
  unit            text,
  difficulty      text NOT NULL DEFAULT 'basic',
  type            text NOT NULL DEFAULT 'multiple-choice',

  text            text NOT NULL,
  text_key        text NOT NULL,
  options         jsonb,
  correct_answer  text,
  explanation     text,

  passage         text,
  passage_id      text,

  -- 検算を通った問題だけを再利用の対象にする
  verify_status   text NOT NULL DEFAULT 'unverified',
  verify_note     text,
  verified_by     text,

  times_used      integer NOT NULL DEFAULT 0,
  last_used_at    timestamptz,
  source_test_id  uuid,
  created_by      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- 同じ問題を二度貯めない。取り込みは ON CONFLICT でこのキーに当てる。
CREATE UNIQUE INDEX IF NOT EXISTS uq_question_bank_key
  ON question_bank (subject, grade, text_key);

-- 「この科目・学年・単元・難易度で、検算済みの、しばらく使っていないもの」を引くための索引
CREATE INDEX IF NOT EXISTS idx_question_bank_pick
  ON question_bank (subject, grade, difficulty, verify_status, last_used_at);
CREATE INDEX IF NOT EXISTS idx_question_bank_unit
  ON question_bank (subject, grade, unit);

ALTER TABLE question_bank ENABLE ROW LEVEL SECURITY;

-- 問題バンクは正解を持つ。生徒・保護者・匿名には一切見せない（講師のみ）。
DROP POLICY IF EXISTS "question_bank_select" ON question_bank;
DROP POLICY IF EXISTS "question_bank_insert" ON question_bank;
DROP POLICY IF EXISTS "question_bank_update" ON question_bank;
DROP POLICY IF EXISTS "question_bank_delete" ON question_bank;
CREATE POLICY "question_bank_select" ON question_bank FOR SELECT USING (auth_is_teacher());
CREATE POLICY "question_bank_insert" ON question_bank FOR INSERT WITH CHECK (auth_is_teacher());
CREATE POLICY "question_bank_update" ON question_bank FOR UPDATE USING (auth_is_teacher());
CREATE POLICY "question_bank_delete" ON question_bank FOR DELETE USING (auth_is_teacher());
