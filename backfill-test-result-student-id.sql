-- ============================================================
-- 既存のテスト結果（student_id 未設定）を氏名照合で生徒に紐付ける
-- ------------------------------------------------------------
-- 背景：受験URLは氏名を手入力する方式で、これまで test_assignments が
--       無いため lesson_reports / questionnaire_responses の
--       student_id が NULL のまま保存されていた。
--       そのため講師の生徒別ページ・保護者の多層診断に出てこない。
--
-- 対応：氏名（空白除去・小文字化で正規化）＋学年で students を照合し、
--       一意に定まるものだけ student_id を補完する。
--       同名が複数いる場合は誤紐付けを避けて NULL のまま残す
--       （講師が画面から手当てする）。
--
-- 安全性：student_id が既に入っている行は変更しない（冪等）。
--         Supabase SQL Editor で1回実行すればよい。
-- ============================================================

-- 氏名正規化：前後空白除去 → 半角/全角スペース除去 → 小文字化
create or replace function _norm_name(s text)
returns text
language sql
immutable
as $$
  select lower(replace(replace(btrim(coalesce(s, '')), ' ', ''), '　', ''));
$$;

-- ── 1) 授業報告書（lesson_reports）──────────────────────────
update lesson_reports lr
set student_id = s.id
from students s
where lr.student_id is null
  and _norm_name(lr.student_name) = _norm_name(s.name)
  and (lr.test_grade is null or lr.test_grade = s.grade)
  -- 同名（＋学年条件）が複数いる場合は対象外にして誤紐付けを防ぐ
  and (
    select count(*) from students s2
    where _norm_name(s2.name) = _norm_name(lr.student_name)
      and (lr.test_grade is null or lr.test_grade = s2.grade)
  ) = 1;

-- ── 2) 多層診断（questionnaire_responses）──────────────────
update questionnaire_responses qr
set student_id = s.id
from students s
where qr.student_id is null
  and _norm_name(qr.student_name) = _norm_name(s.name)
  and (qr.grade is null or qr.grade = s.grade)
  and (
    select count(*) from students s2
    where _norm_name(s2.name) = _norm_name(qr.student_name)
      and (qr.grade is null or qr.grade = s2.grade)
  ) = 1;

-- 補完結果の確認（紐付け済 / 未紐付けの件数）
select 'lesson_reports' as tbl,
       count(*) filter (where student_id is not null) as linked,
       count(*) filter (where student_id is null)     as unlinked
from lesson_reports
union all
select 'questionnaire_responses',
       count(*) filter (where student_id is not null),
       count(*) filter (where student_id is null)
from questionnaire_responses;

-- 後始末：照合用の一時関数を削除
drop function if exists _norm_name(text);
