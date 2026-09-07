import { NextRequest, NextResponse } from "next/server";
import { requireTeacher } from "@/lib/apiAuth";

import { generateText, extractJson } from "@/lib/ai";
import {
  renderTestHtml, sortByDifficulty, normalizePoints, renumber, shuffleAllChoices,
  CHOICE_COUNT, type TestQuestion,
} from "@/lib/testHtml";
import { checkQuestion } from "@/lib/questionCheck";
import { normalizeQuestionMath } from "@/lib/mathText";

export const maxDuration = 60;

// テスト作成AIパイプラインの第3段階「仕上げ＋用紙化」。
//
// 以前はHTML用紙そのものをAIに書かせていたため、問題数が増えると出力上限で途中で切れ、
// 作った問題が用紙に載らなかった。いまは役割を分ける:
//   ・AI  … 検算(第2段)で引っかかった問題**だけ**を直す
//   ・コード… 選択肢の並べ替え・並び順・採番・配点100点・用紙の組版
//
// 全問をAIに通さないのがここの肝。60問あっても直すのは数問なので、
// 問題数が増えても仕上げは重くならず、直っていない問題を時間切れで取りこぼさない。
// 直せなかったものは黙って通さず needs_review のまま残し、画面と解答用紙に印を出す。

const CHUNK = 5;
const DEADLINE_MS = 40_000;

/** 直しを依頼する対象か（検算で引っかかったもの） */
const needsRepair = (q: TestQuestion) =>
  q.verify_status === "needs_review" || q.verify_status === "fixed";

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

  const src = (questions as TestQuestion[]).map((q) => ({ ...q }));
  const targets = src.map((q, i) => (needsRepair(q) ? i : -1)).filter((i) => i >= 0);

  const chunks: number[][] = [];
  for (let i = 0; i < targets.length; i += CHUNK) chunks.push(targets.slice(i, i + CHUNK));

  const startedAt = Date.now();
  let repaired = 0;
  let unresolved = 0;

  for (const chunk of chunks) {
    if (Date.now() - startedAt > DEADLINE_MS) {
      unresolved += chunk.length;
      continue;
    }

    const body = chunk
      .map((idx, n) => {
        const q = src[idx];
        return `[${n + 1}] 指摘：${q.verify_note || "（記載なし）"}\n${JSON.stringify({
          text: q.text,
          options: q.options,
          correct_answer: q.correct_answer,
          explanation: q.explanation ?? "",
          ...(q.passage ? { passage: q.passage } : {}),
        })}`;
      })
      .join("\n\n");

    const prompt = `あなたは日本の教育専門家です。「${title}」（${grade}・${subject}・${typeLabel}）の四択問題のうち、
別のAIに解かせる検算で引っかかったものを直してください。

【指摘の意味】
検算では、正解を伏せた状態で別のAIに問題を解かせています。そのAIの答えが用意した正解と
食い違った問題、または形が壊れている問題がここに来ています。

【直し方】
・まずどちらが正しいかを自分で解いて判断する
・用意した correct_answer が間違っていれば、正しい選択肢に直す
・問題文があいまいで答えが1つに決まらないなら、**設問ごと書き直して**1つに決まるようにする
・選択肢は必ずちょうど${CHOICE_COUNT}つ。同じ内容・言い換えただけの選択肢を作らない
・correct_answer は options の中の文字列を一字一句そのまま入れる
・explanation に、なぜその答えになるかを1〜2文で書く
・**本文(passage)は変えない**。設問だけ直す
・追加指示: ${instructions || "なし"}

【数式・記号の書き方（そのまま文字として表示されます）】
・**HTMLタグ（<sup> <sub> <span> 等）もLaTeX（$…$、\\frac、^{}、_{}）も使わない**
・累乗は x²、a³ ／ 添字は a₁ ／ 分数は 3/4 ／ 平方根は √2 ／ 記号は ×÷±≤≥≠π°∠△

【直す問題（${chunk.length}問）】
${body}

【出力】次の形のJSONのみ（説明文・コードフェンス不要）:
{"fixed": [{"no": 1, "text": "...", "options": ["...","...","...","..."], "correct_answer": "...", "explanation": "..."}, ...]}
no は上の [n] の番号です。全${chunk.length}問ぶん返してください。`;

    try {
      const { text } = await generateText({
        prompt, maxTokens: 4096, temperature: 0.2, json: true, feature: "test_finalize",
      });
      const parsed = extractJson<{ fixed?: Record<string, unknown>[] }>(text);
      const fixed = Array.isArray(parsed?.fixed) ? parsed!.fixed! : [];

      const done = new Set<number>();
      for (const f of fixed) {
        const n = Number(f?.no);
        if (!Number.isFinite(n) || n < 1 || n > chunk.length) continue;
        const idx = chunk[n - 1];
        const merged: TestQuestion = {
          ...src[idx],
          text: typeof f.text === "string" && f.text.trim() ? f.text : src[idx].text,
          options: Array.isArray(f.options) ? (f.options as string[]) : src[idx].options,
          correct_answer:
            typeof f.correct_answer === "string" && f.correct_answer.trim()
              ? f.correct_answer
              : src[idx].correct_answer,
          explanation:
            typeof f.explanation === "string" && f.explanation.trim()
              ? f.explanation
              : src[idx].explanation,
        };
        // 直った"つもり"を信用しない。形をもう一度機械で検査し、通ったものだけ fixed 扱いにする
        const re = checkQuestion(merged);
        if (re.issues.length === 0) {
          src[idx] = { ...re.question, verify_status: "fixed", verify_note: "検算の指摘を受けて修正しました" };
          repaired++;
        } else {
          src[idx] = {
            ...re.question,
            verify_status: "needs_review",
            verify_note: `修正しましたが不備が残っています：${re.issues.join(" / ")}`,
          };
          unresolved++;
        }
        done.add(idx);
      }
      // 返ってこなかった問題は直っていない。needs_review のまま残す
      for (const idx of chunk) if (!done.has(idx)) unresolved++;
    } catch {
      unresolved += chunk.length;
    }
  }

  // ── 表記そろえ → 選択肢シャッフル → 並べ替え → 採番 → 配点100点 → 用紙を組む ──
  // 問題文はここから先、解答画面・生徒の受験画面でもそのまま文字として出るので、
  // タグやLaTeXが残らないよう最後に必ず通す。
  //
  // 選択肢のシャッフルはここでしか行わない。「正解を1番目に偏らせないで」とAIに
  // 頼んでも守られない（実際に1番目へ寄る）ので、位置の分散はコードで確定させる。
  const ordered = renumber(
    normalizePoints(
      sortByDifficulty(shuffleAllChoices(src.map((q) => normalizeQuestionMath(q)))),
    ),
  );

  const stillFlagged = ordered.filter((q) => q.verify_status === "needs_review").length;
  const html = renderTestHtml({ title, grade, subject, questions: ordered });

  return NextResponse.json({
    html,
    questions: ordered,
    summary: { repaired, unresolved, flagged: stillFlagged, total: ordered.length },
    ...(stillFlagged > 0
      ? {
          warning:
            `${stillFlagged}問は正解が確定できませんでした。プレビューの「🔴要確認」の問題を、` +
            `配る前にご自身で確認するか、その問題だけ作り直してください。`,
        }
      : {}),
  });
}
