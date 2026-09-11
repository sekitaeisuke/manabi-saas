import { NextRequest, NextResponse } from "next/server";
import { requireTeacher } from "@/lib/apiAuth";

import { generateText, extractJson, aiErrorPayload } from "@/lib/ai";
import { mathText, normalizeQuestionMath } from "@/lib/mathText";
import { CHOICE_COUNT, CHOICE_MARKS, shuffleChoices, type TestQuestion } from "@/lib/testHtml";
import { checkQuestion } from "@/lib/questionCheck";

export const maxDuration = 60;

// 問題を1問だけ作る／作り直す。
//
// テスト全体が気に入っているのに1問だけおかしい、というときに全部作り直すのは無駄が多い。
// 講師が編集画面で「この1問を作り直す」を押したときにここが呼ばれる。
//
// 1問だけなので、作成 → 検算（別のAIが解く）→ 直し を1回のリクエストの中で通しでやる。
// 検算が通らなければ最大2回まで作り直し、それでも駄目なら要確認の印を付けて返す。

const MAX_TRIES = 3;

type Draft = {
  text?: string;
  options?: string[];
  correct_answer?: string;
  explanation?: string;
};

const DIFF_JA = (d: string) => (d === "basic" ? "基礎" : d === "standard" ? "標準" : "応用");

export async function POST(req: NextRequest) {
  const auth = await requireTeacher(req);
  if (auth instanceof NextResponse) return auth;
  const {
    subject, grade, title, difficulty, instructions,
    selectedUnits, avoidTexts, passage, points,
    // 講師がこの1問に対して出した指示（例「もっとやさしく」「分数を使って」）と、
    // いま入っている問題。「数値だけ変えて」のような指示は、元の問題が無いと効かない。
    instruction, basedOn,
  } = await req.json();

  const units = (selectedUnits as { grade: string; unit: string }[] | undefined) ?? [];
  const unitList = units.map((u) => `・${u.grade}「${u.unit}」`).join("\n")
    || "（指定なし：学年・科目に沿った標準的な単元から出題）";
  const diff = typeof difficulty === "string" && difficulty ? difficulty : "basic";

  const avoid = (Array.isArray(avoidTexts) ? (avoidTexts as string[]) : [])
    .slice(0, 40)
    .map((t, i) => `${i + 1}. ${String(t).slice(0, 50)}`)
    .join("\n");

  const passageText = String(passage ?? "").trim();
  const order = String(instruction ?? "").trim();

  // いま入っている問題。作り直しのときは、これを置き換える形で作らせる
  const cur = basedOn as
    | { text?: string; options?: string[] | null; correct_answer?: string }
    | undefined;
  const basedOnBlock = cur?.text
    ? `
【いまこの問題が入っています。これを置き換える1問を作ってください】
${cur.text}` +
      (Array.isArray(cur.options) && cur.options.length > 0
        ? `
　選択肢：${cur.options.join(" / ")}`
        : "") +
      (cur.correct_answer ? `
　正解：${cur.correct_answer}` : "") +
      `
`
    : "";

  // 講師の指示はいちばん強く効かせたいので、プロンプトの先頭に置く
  const orderBlock = order
    ? `
★★ 講師からのこの1問への指示（**最優先で従うこと**）★★
${order}
` +
      `※この指示と下の一般的な決まりがぶつかったら、**この指示を優先**してください` +
      `（ただし「四択にする」「正解は選択肢の中の文字列そのまま」だけは必ず守ること）。
`
    : "";

  const makePrompt = (retryNote: string) => `あなたは日本の学習塾の問題作成の専門家です。
「${title}」（${grade}・${subject}）の確認テストに入れる問題を**1問だけ**作ってください。
${orderBlock}${basedOnBlock}
【難易度】${DIFF_JA(diff)}（difficulty:"${diff}"）${order ? "（指示に「やさしく」「難しく」とあれば、そちらを優先）" : ""}
【出題単元】
${unitList}
【テスト全体への指示】${instructions || "なし"}
${passageText
    ? `\n【この本文に対する設問を作ること（本文は変えない）】\n${passageText}\n`
    : `\n【本文は付きません】「次の文章を読んで」「本文中」「筆者」のような、別の本文を前提にした設問にしない。例文・会話が要るなら問題文の中に全部書く\n`}
${avoid ? `\n【このテストにすでに入っている問題（重複禁止）】\n${avoid}\n※同じ設問・同じ数値・同じ言い換えにしないこと。\n` : ""}${retryNote}

【出題形式（必ず守ること）】
- 四択にする。options はちょうど${CHOICE_COUNT}つ
- **同じ内容・言い換えただけの選択肢を入れない**
- correct_answer には options の中の文字列を**一字一句そのまま**入れる
- 誤答は「ありそうな間違い」にする（計算ミス・符号の取り違え・語の混同など）
- explanation に「なぜその答えになるか」を1〜2文で書く

【数式・記号の書き方（そのまま文字として表示されます）】
- **HTMLタグ（<sup> <sub> <span> 等）もLaTeX（$…$、\\frac、^{}、_{}）も使わない**
- 累乗は x²、a³ ／ 添字は a₁ ／ 分数は 3/4 ／ 平方根は √2 ／ 記号は ×÷±≤≥≠π°∠△
- 分数と文字の積は **(1/2)x** のように括弧を付ける（1/2x では 1/(2x) とも読めてしまう）

【出力】次の形のJSONのみ（説明文・コードフェンス不要）:
{"text":"問題文","options":["…","…","…","…"],"correct_answer":"…","explanation":"…"}`;

  let last: TestQuestion | null = null;
  let lastIssues: string[] = [];
  let retryNote = "";

  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    let raw: string;
    try {
      raw = (await generateText({
        provider: "openai", prompt: makePrompt(retryNote), maxTokens: 1500,
        json: true, feature: "test_one",
      })).text;
    } catch (e) {
      if (last) break; // 前の試行の結果があるならそれを返す
      return NextResponse.json(aiErrorPayload(e, "test_one"), { status: 502 });
    }

    const d = extractJson<Draft>(raw);
    if (!d || typeof d.text !== "string" || !d.text.trim()) {
      retryNote = "\n【前回の失敗】JSONが読み取れませんでした。指定した形だけを返してください。\n";
      continue;
    }

    const candidate: TestQuestion = normalizeQuestionMath({
      difficulty: diff,
      section: DIFF_JA(diff),
      text: mathText(d.text),
      type: "multiple-choice",
      options: Array.isArray(d.options) ? d.options.map((o) => mathText(o)) : null,
      correct_answer: mathText(d.correct_answer ?? ""),
      explanation: mathText(d.explanation ?? ""),
      points: Number(points) > 0 ? Number(points) : 5,
      ...(passageText ? { passage: passageText } : {}),
    });

    // ① 形の点検
    const checked = checkQuestion(candidate);
    last = checked.question;
    lastIssues = checked.issues;
    if (checked.issues.length > 0) {
      retryNote = `\n【前回の失敗】${checked.issues.join(" / ")}\nこれを直して作り直してください。\n`;
      continue;
    }

    // ② 盲解き（正解を伏せて別のAIに解かせる）
    const solved = await blindSolve(checked.question, subject, grade);
    if (solved === null) {
      // 検算できなかった。形は通っているのでそのまま返す（未検算の印を付ける）
      return NextResponse.json({
        question: { ...shuffleChoices(checked.question), verify_status: "unverified", verify_note: "検算できませんでした" },
      });
    }
    const picked = (checked.question.options ?? [])[solved - 1];
    if (picked !== undefined && picked === checked.question.correct_answer) {
      return NextResponse.json({
        question: { ...shuffleChoices(checked.question), verify_status: "ok", verify_note: "" },
      });
    }
    retryNote =
      `\n【前回の失敗】別のAIに解かせたところ、用意した正解「${checked.question.correct_answer}」ではなく` +
      `「${picked ?? "?"}」を選びました。答えが1つに決まる問題に作り直してください。\n`;
    lastIssues = ["検算で答えが食い違いました"];
  }

  if (!last) {
    return NextResponse.json({ error: "問題を作成できませんでした。もう一度お試しください。" }, { status: 500 });
  }
  return NextResponse.json({
    question: {
      ...shuffleChoices(last),
      verify_status: "needs_review",
      verify_note: lastIssues.join(" / ") || "正解を確認できませんでした",
    },
  });
}

/** 正解を伏せて別のAIに解かせ、選んだ選択肢の番号（1始まり）を返す。できなければ null */
async function blindSolve(q: TestQuestion, subject: string, grade: string): Promise<number | null> {
  const opts = (q.options ?? []).map((o, i) => `　${CHOICE_MARKS[i] ?? i + 1} ${o}`).join("\n");
  const prompt = `あなたは${grade}の${subject}を教えるベテラン講師です。次の四択問題を解いてください。
${q.passage ? `【本文】\n${q.passage}\n` : ""}
${q.text}
${opts}

正しいと考える選択肢の番号だけを、次の形のJSONで返してください: {"choice": 2}`;
  try {
    const { text } = await generateText({
      provider: "google", prompt, maxTokens: 200, temperature: 0, json: true, feature: "test_verify",
    });
    const parsed = extractJson<{ choice?: number }>(text);
    const c = Number(parsed?.choice);
    return Number.isFinite(c) && c >= 1 ? c : null;
  } catch {
    return null;
  }
}
