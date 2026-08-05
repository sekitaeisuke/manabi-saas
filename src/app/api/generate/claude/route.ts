import { NextRequest, NextResponse } from "next/server";
import { requireTeacher } from "@/lib/apiAuth";

import { generateText, extractJson } from "@/lib/ai";
import {
  renderTestHtml, sortByDifficulty, normalizePoints, renumber, type TestQuestion,
} from "@/lib/testHtml";

export const maxDuration = 60;

// テスト作成AIパイプラインの第3段階「最終チェック＋用紙化」。
//
// 以前はHTML用紙そのものをAIに書かせていたため、問題数が増えると出力上限で途中で切れ、
// 作った問題が用紙に載らなかった。いまは役割を分ける:
//   ・AI  … 問題文の誤字・表現・答えの整合をJSONのまま直す（10問ずつ）
//   ・コード… 用紙の組版（renderTestHtml）。全問が必ず載る・配点合計は必ず100点
// 推敲AIが落ちても用紙は必ずできる（warning を添えて返す）。

const CHUNK = 10;
const DEADLINE_MS = 40_000;

export async function POST(req: NextRequest) {
  const auth = await requireTeacher(req);
  if (auth instanceof NextResponse) return auth;
  const { questions, subject, grade, title, testType, instructions } = await req.json();

  if (!Array.isArray(questions) || questions.length === 0) {
    return NextResponse.json({ error: "仕上げ対象の問題がありません（先に作成を実行してください）" }, { status: 400 });
  }

  const typeLabel = testType === "diagnostic"
    ? "学力学習習慣診断分析多層型テスト"
    : "授業確認テスト（報告書用）";

  // ── 最終チェック（問題文の推敲）。10問ずつに分け、失敗した束は元のまま通す ──
  const src = questions as TestQuestion[];
  const chunks: TestQuestion[][] = [];
  for (let i = 0; i < src.length; i += CHUNK) chunks.push(src.slice(i, i + CHUNK));

  const startedAt = Date.now();
  const checked: TestQuestion[] = [];
  let skipped = 0;

  for (const chunk of chunks) {
    if (Date.now() - startedAt > DEADLINE_MS) {
      checked.push(...chunk);
      skipped += chunk.length;
      continue;
    }
    const prompt = `あなたは日本の教育専門家です。「${title}」（${grade}・${subject}・${typeLabel}）の問題を最終チェックしてください。

【チェック内容】
・誤字脱字・不自然な日本語を直す
・設問と correct_answer が食い違っていないか確認し、食い違っていれば正しい方に直す
・選択肢式は正答が1つに確定するようにする
・**問題数は必ず入力と同じ${chunk.length}問。順序・id・difficulty は変えない**
・追加指示: ${instructions || "なし"}

【数式の表記ルール（文字化け防止）】
・LaTeX記法（$...$や\\frac等）は使わない
・累乗は x<sup>2</sup>、平方根は √2、記号は ×÷±≤≥≠（Unicode文字）
・分数は 3/4 のように書く

【入力（問題JSON・${chunk.length}問）】
${JSON.stringify(chunk)}

【出力】次の形のJSONのみ（説明文・コードフェンス不要）:
{"questions": [ ...最終版の${chunk.length}問（入力と同じ構造・同じ順序） ]}`;

    try {
      const { text } = await generateText({ prompt, maxTokens: 8192, feature: "test_finalize" });
      const parsed = extractJson<{ questions?: TestQuestion[] }>(text);
      const fixed = parsed?.questions;
      if (Array.isArray(fixed) && fixed.length === chunk.length) {
        checked.push(...fixed.map((q, i) => ({ ...chunk[i], ...q })));
      } else {
        checked.push(...chunk);
        skipped += chunk.length;
      }
    } catch {
      checked.push(...chunk);
      skipped += chunk.length;
    }
  }

  // ── 並べ替え → 採番 → 配点を100点に正規化 → 用紙を組む ──
  const ordered = renumber(normalizePoints(sortByDifficulty(checked)));
  const html = renderTestHtml({ title, grade, subject, questions: ordered });

  return NextResponse.json({
    html,
    questions: ordered,
    ...(skipped > 0
      ? { warning: `${skipped}問はAIの最終チェックを省略しました（応答が得られなかったため）。内容をご確認ください。` }
      : {}),
  });
}
