import { NextRequest, NextResponse } from "next/server";
import { requireTeacher } from "@/lib/apiAuth";

import { generateText, extractJson } from "@/lib/ai";
import { CHOICE_COUNT, CHOICE_MARKS, shuffleChoices, type TestQuestion } from "@/lib/testHtml";
import { verifyOne } from "@/lib/verifyQuestion";
import { normalizeQuestionMath } from "@/lib/mathText";

export const maxDuration = 60;

// 検算で引っかかった問題を**1問だけ**直す。
//
// まとめて直すと、1つの応答が壊れただけで束ごと直らないまま通ってしまう。
// また直したあとに解き直さないと、形が整っただけの「直ったつもり」を通してしまう。
// ここでは1問に絞り、直す → もう一度解かせて確かめる、まで必ずやる。
//
// 直しても確認が取れなければ needs_review のまま返す。黙って通さない。

const MAX_TRIES = 2;

export async function POST(req: NextRequest) {
  const auth = await requireTeacher(req);
  if (auth instanceof NextResponse) return auth;
  const body = await req.json();
  const { question, title, instructions } = body;
  // プロンプトにそのまま差し込むので、未指定でも "undefined" と書かれないようにする
  const subject = String(body.subject ?? "");
  const grade = String(body.grade ?? "");

  if (!question || typeof question.text !== "string") {
    return NextResponse.json({ error: "直す問題が渡されていません" }, { status: 400 });
  }

  let current = question as TestQuestion;
  let lastNote = current.verify_note ?? "";

  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    const opts = (current.options ?? [])
      .map((o, i) => `　${CHOICE_MARKS[i] ?? i + 1} ${o}`)
      .join("\n");

    const prompt = `あなたは日本の教育専門家です。「${title ?? ""}」（${grade}・${subject}）の四択問題を1問直してください。

【この問題は検算で引っかかりました】
検算では、正解を伏せた状態で別のAIに解かせています。その指摘が次です。

${lastNote || "（指摘の記載なし）"}

【いまの問題】
${current.passage ? `本文：\n${current.passage}\n` : ""}設問：${current.text}
${opts}
用意している正解：${current.correct_answer ?? "（未設定）"}
いまの解説：${current.explanation || "（なし）"}

【直し方】
・まず自分で解いて、どちらが正しいかを判断する
・用意した正解が間違っていれば、正しい選択肢に直す
・**答えが1つに決まらない**なら、設問ごと書き直して1つに決まるようにする。
　「正しいと言える選択肢が2つある」状態を必ず解消すること
・選択肢はちょうど${CHOICE_COUNT}つ。同じ内容・言い換えただけの選択肢を作らない
・誤答は「ありそうな間違い」にする
・correct_answer は options の中の文字列を一字一句そのまま入れる
・explanation に、なぜその答えになるかを1〜2文で書く
・**本文(passage)は変えない**。設問だけ直す
・追加指示: ${instructions || "なし"}

【数式・記号の書き方（そのまま文字として表示されます）】
・**HTMLタグ（<sup> <sub> <span> 等）もLaTeX（$…$、\\frac、^{}、_{}）も使わない**
・累乗は x²、a³ ／ 添字は a₁ ／ 分数は 3/4 ／ 平方根は √2 ／ 記号は ×÷±≤≥≠π°∠△

【出力】次の形のJSONのみ（説明文・コードフェンス不要）:
{"text":"...","options":["...","...","...","..."],"correct_answer":"...","explanation":"..."}`;

    let raw: string;
    try {
      const res = await generateText({
        prompt, maxTokens: 1500, temperature: 0.2, json: true, feature: "test_repair",
      });
      raw = res.text;
    } catch {
      break; // 直せなかった。いまの状態のまま返す
    }

    const f = extractJson<Record<string, unknown>>(raw);
    if (!f || typeof f.text !== "string" || !f.text.trim()) continue;

    const merged: TestQuestion = normalizeQuestionMath({
      ...current,
      text: f.text,
      options: Array.isArray(f.options) ? (f.options as string[]) : current.options,
      correct_answer:
        typeof f.correct_answer === "string" && f.correct_answer.trim()
          ? f.correct_answer
          : current.correct_answer,
      explanation:
        typeof f.explanation === "string" && f.explanation.trim()
          ? f.explanation
          : current.explanation,
    });

    // 直った"つもり"を信用せず、もう一度解かせて確かめる
    const re = await verifyOne(merged, { subject, grade });
    current = re.question;
    if (re.outcome.status === "ok") {
      return NextResponse.json({
        question: {
          ...shuffleChoices(current),
          verify_status: "fixed",
          verify_note: "検算の指摘を受けて直し、解き直して確認しました",
        },
        repaired: true,
      });
    }
    lastNote = re.outcome.note;
  }

  return NextResponse.json({
    question: {
      ...shuffleChoices(current),
      verify_status: "needs_review",
      verify_note: lastNote
        ? `直しましたが確認できませんでした：${lastNote}`
        : "直しても正解を確認できませんでした",
    },
    repaired: false,
  });
}
