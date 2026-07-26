-- ============================================================
-- class-stock-benchmarks-setup.sql
-- 自塾株の「ライバル塾（目標）」ベンチマーク
--   森塾=M塾・明光義塾=月光G塾 等を “目標株価” として表示するためのテーブル。
--   生徒は自塾のみ売買可能（ベンチマークは表示専用・売買不可）。
--   Supabase SQL Editor で実行（冪等・再実行可）。
-- ============================================================

CREATE TABLE IF NOT EXISTS stock_benchmarks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,                 -- 表示名（例: M塾 / 月光G塾）
  price       integer NOT NULL DEFAULT 0,    -- 現在の株価(AC)
  prev_price  integer,                       -- 直前株価（▲▼表示用）
  note        text,                          -- ひとこと（例: 全員で目指すライバル）
  sort_order  integer NOT NULL DEFAULT 0,
  active      boolean NOT NULL DEFAULT true,
  auto_move   boolean NOT NULL DEFAULT true,       -- 週次で自動変動するか
  volatility  double precision NOT NULL DEFAULT 0.04, -- 1週間の上下の幅（0.04=±4%）
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- 既存テーブルにも列を追加（再実行で足りるように）
ALTER TABLE stock_benchmarks ADD COLUMN IF NOT EXISTS prev_price integer;
ALTER TABLE stock_benchmarks ADD COLUMN IF NOT EXISTS auto_move  boolean NOT NULL DEFAULT true;
ALTER TABLE stock_benchmarks ADD COLUMN IF NOT EXISTS volatility double precision NOT NULL DEFAULT 0.04;

-- seed（存在しなければ）。目標株価は仮の初期値。講師画面で編集してください。
INSERT INTO stock_benchmarks (name, price, note, sort_order)
SELECT v.name, v.price, v.note, v.sort_order
FROM (VALUES
  ('M塾',    5000,  '全員で目指すライバル塾（森塾モデル）',   1),
  ('月光G塾', 10000, '全員で目指すライバル塾（明光義塾モデル）', 2)
) AS v(name, price, note, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM stock_benchmarks b WHERE b.name = v.name);

DROP TRIGGER IF EXISTS trg_benchmark_touch ON stock_benchmarks;
CREATE TRIGGER trg_benchmark_touch BEFORE UPDATE ON stock_benchmarks
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- RLS: ログイン済みなら閲覧可（生徒に目標を見せる）。編集は管理者のみ。
ALTER TABLE stock_benchmarks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS benchmark_select ON stock_benchmarks;
CREATE POLICY benchmark_select ON stock_benchmarks FOR SELECT
  USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS benchmark_write ON stock_benchmarks;
CREATE POLICY benchmark_write ON stock_benchmarks FOR ALL
  USING (auth_teacher_role() = 'admin') WITH CHECK (auth_teacher_role() = 'admin');

-- ============================================================
-- 完了。/api/stock/leaderboard が schools(自塾各教室) と stock_benchmarks(目標)を返し、
-- 生徒「経済」タブでランキング表示する。売買は従来どおり自塾のみ。
-- ============================================================
