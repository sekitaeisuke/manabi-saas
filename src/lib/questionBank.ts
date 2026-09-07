import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { questionKey } from "@/lib/questionCheck";
import type { TestQuestion } from "@/lib/testHtml";

// 問題バンク。
//
// これまでテストを作るたびにゼロから生成していたので、時間もAPIの費用もかかり、
// テストをまたいで同じ問題が出ることも防げなかった。作った問題をここに貯めておき、
// 次からは使えるものを先に拾って、足りない分だけAIに作らせる。
//
// 貯めるのは「検算を通った問題」だけ。答えが確認できていない問題を使い回すと、
// 間違いが増えるほど広がってしまう。

/** バンクに入れる1行 */
export type BankRow = {
  subject: string;
  grade: string;
  unit: string | null;
  difficulty: string;
  type: string;
  text: string;
  text_key: string;
  options: string[] | null;
  correct_answer: string | null;
  explanation: string | null;
  passage: string | null;
  passage_id: string | null;
  verify_status: string;
  verify_note: string | null;
  source_test_id: string | null;
  created_by: string | null;
};

/** 貯める価値がある（＝答えが確認できている）問題か */
export function isBankable(q: TestQuestion): boolean {
  if (q.verify_status !== "ok" && q.verify_status !== "fixed") return false;
  if (!q.text?.trim()) return false;
  if (!Array.isArray(q.options) || q.options.length < 2) return false;
  if (!q.correct_answer || !q.options.includes(q.correct_answer)) return false;
  return true;
}

/** 問題の配列をバンクの行に直す。検算を通っていないものは落とす */
export function toBankRows(
  questions: TestQuestion[],
  meta: { subject: string; grade: string; testId?: string | null; createdBy?: string | null },
): BankRow[] {
  const rows: BankRow[] = [];
  const seen = new Set<string>();
  for (const q of questions) {
    if (!isBankable(q)) continue;
    const key = questionKey(q.text);
    if (seen.has(key)) continue; // 同じテストの中の重複
    seen.add(key);
    rows.push({
      subject: meta.subject,
      grade: meta.grade,
      unit: q.unit?.trim() ? q.unit.trim() : null,
      difficulty: q.difficulty ?? "basic",
      type: "multiple-choice",
      text: q.text,
      text_key: key,
      options: q.options ?? null,
      correct_answer: q.correct_answer ?? null,
      explanation: q.explanation ?? null,
      passage: q.passage ?? null,
      passage_id: q.passage_id ?? null,
      verify_status: q.verify_status ?? "unverified",
      verify_note: q.verify_note ?? null,
      source_test_id: meta.testId ?? null,
      created_by: meta.createdBy ?? null,
    });
  }
  return rows;
}

/**
 * バンクへ貯める。すでに同じ問題があれば何もしない（重複させない）。
 * 講師のログインで書けるので、画面からもAPIからも同じ関数で呼べる。
 */
export async function saveToBank(
  db: SupabaseClient,
  rows: BankRow[],
): Promise<{ saved: number; error: string | null }> {
  if (rows.length === 0) return { saved: 0, error: null };
  const { error } = await db
    .from("question_bank")
    .upsert(rows, { onConflict: "subject,grade,text_key", ignoreDuplicates: true });
  return { saved: error ? 0 : rows.length, error: error?.message ?? null };
}

/* ------------------------------------------------------------------ *
 * 取り出し（サーバ側）
 * ------------------------------------------------------------------ */

function serviceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

type PickedRow = {
  id: string;
  unit: string | null;
  difficulty: string;
  text: string;
  text_key: string;
  options: string[] | null;
  correct_answer: string | null;
  explanation: string | null;
  passage: string | null;
  passage_id: string | null;
  verify_status: string;
};

export type BankPick = { questions: TestQuestion[]; usedIds: string[] };

/**
 * バンクから使える問題を取り出す。
 *
 * 国語の読解のように本文を共有する問題は、1問だけ抜くと本文からはぐれるので、
 * **本文のかたまりごと**取る。かたまりが必要数に収まらないときは使わない。
 *
 * 直近に使ったものは避けたいので、最後に使った日が古い順に見る。
 */
export async function pickFromBank(opts: {
  subject: string;
  grade: string;
  units: string[];
  /** 難易度ごとの必要数 */
  quota: Record<string, number>;
  /** すでにこのテストに入っている問題（重複させない） */
  excludeKeys: Set<string>;
}): Promise<BankPick> {
  const db = serviceClient();
  if (!db) return { questions: [], usedIds: [] };

  const picked: TestQuestion[] = [];
  const usedIds: string[] = [];

  for (const [difficulty, needRaw] of Object.entries(opts.quota)) {
    let need = needRaw;
    if (need <= 0) continue;

    let q = db
      .from("question_bank")
      .select("id, unit, difficulty, text, text_key, options, correct_answer, explanation, passage, passage_id, verify_status")
      .eq("subject", opts.subject)
      .eq("grade", opts.grade)
      .eq("difficulty", difficulty)
      .in("verify_status", ["ok", "fixed"])
      .order("last_used_at", { ascending: true, nullsFirst: true })
      .limit(need * 5);
    // 単元が分かっている問題だけを対象にする（単元が違う問題が混ざるのを防ぐ）
    if (opts.units.length > 0) q = q.in("unit", opts.units);

    const { data } = await q;
    const rows = (data ?? []) as PickedRow[];

    // 本文つきはかたまりにまとめる
    const groups = new Map<string, PickedRow[]>();
    const singles: PickedRow[] = [];
    for (const r of rows) {
      if (opts.excludeKeys.has(r.text_key)) continue;
      if (r.passage_id) {
        const k = r.passage_id;
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k)!.push(r);
      } else {
        singles.push(r);
      }
    }

    const take = (r: PickedRow) => {
      picked.push({
        id: r.id,
        difficulty: r.difficulty,
        unit: r.unit ?? undefined,
        text: r.text,
        type: "multiple-choice",
        options: r.options,
        correct_answer: r.correct_answer ?? "",
        explanation: r.explanation ?? "",
        passage: r.passage ?? undefined,
        passage_id: r.passage_id ?? undefined,
        points: 5,
        verify_status: (r.verify_status as TestQuestion["verify_status"]) ?? "ok",
        verify_note: "問題バンクから",
      });
      usedIds.push(r.id);
      opts.excludeKeys.add(r.text_key);
    };

    // 本文のかたまりを先に（収まるものだけ）
    for (const [, members] of groups) {
      if (members.length > need) continue;
      members.forEach(take);
      need -= members.length;
      if (need <= 0) break;
    }
    for (const r of singles) {
      if (need <= 0) break;
      take(r);
      need--;
    }
  }

  // 使った印を付ける（次は後回しになる）
  if (usedIds.length > 0) {
    await db
      .from("question_bank")
      .update({ last_used_at: new Date().toISOString() })
      .in("id", usedIds);
  }

  return { questions: picked, usedIds };
}
