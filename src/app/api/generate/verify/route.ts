import { NextRequest, NextResponse } from "next/server";
import { requireTeacher } from "@/lib/apiAuth";

import { verifyOne } from "@/lib/verifyQuestion";
import type { TestQuestion } from "@/lib/testHtml";

export const maxDuration = 60;

// テスト作成AIパイプラインの第2段階「検算」。
//
// ここまでの段はどれも「推敲」だった。つまり、誰も問題を解いていない。
// 正解として書かれた選択肢が本当に正しいかを確かめる工程が無く、答えの間違った問題が
// そのまま用紙になって印刷されていた。
//
// 速さより正しさを優先する。以前は8問まとめて1回のAI呼び出しにし、時間が来たら
// 残りを「未検算」で通していたが、それでは検算していない問題が混ざったまま配られる。
// いまは**1問ずつ独立に**見て、全問必ず検算する。時間は画面側が1問ずつ呼ぶことで稼ぐ
// （1リクエストの上限に当たらず、進み具合もその場で見える）。

/** 1リクエストで受ける上限。画面は1問ずつ呼ぶので、まとめ呼びは保険 */
const MAX_PER_REQUEST = 4;

export async function POST(req: NextRequest) {
  const auth = await requireTeacher(req);
  if (auth instanceof NextResponse) return auth;
  const { questions, subject, grade } = await req.json();

  if (!Array.isArray(questions) || questions.length === 0) {
    return NextResponse.json({ error: "検算対象の問題がありません（先に作成を実行してください）" }, { status: 400 });
  }
  if (questions.length > MAX_PER_REQUEST) {
    return NextResponse.json(
      { error: `一度に検算できるのは${MAX_PER_REQUEST}問までです（画面は1問ずつ呼びます）` },
      { status: 400 },
    );
  }

  const ctx = { subject: String(subject ?? ""), grade: String(grade ?? "") };
  const result: TestQuestion[] = [];
  let solver: string | null = null;

  for (const q of questions as TestQuestion[]) {
    const { question, outcome } = await verifyOne(q, ctx);
    if (!solver && outcome.solver) solver = outcome.solver;
    result.push({ ...question, verify_status: outcome.status, verify_note: outcome.note });
  }

  return NextResponse.json({ questions: result, solver });
}
