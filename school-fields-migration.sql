-- ============================================================
-- high_schools テーブルに新フィールドを追加
-- Supabase SQL Editor で実行してください
-- ============================================================

ALTER TABLE high_schools
  ADD COLUMN IF NOT EXISTS access              text,   -- アクセス（最寄り駅・バス等）
  ADD COLUMN IF NOT EXISTS club_features       text,   -- 部活動特色
  ADD COLUMN IF NOT EXISTS academic_features   text,   -- 学習上の特色
  ADD COLUMN IF NOT EXISTS student_atmosphere  text,   -- 生徒の雰囲気
  ADD COLUMN IF NOT EXISTS teacher_atmosphere  text;   -- 先生方の雰囲気

-- ※ appeal_points = オススメポイント（既存）
-- ※ university_results = 進路実績（既存）
-- ※ address = 住所（既存）
-- ※ name = 学校名（既存）
