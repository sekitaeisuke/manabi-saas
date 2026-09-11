import { NextRequest, NextResponse } from "next/server";
import { requireTeacher } from "@/lib/apiAuth";

import { generateText, extractJson, aiErrorPayload } from "@/lib/ai";
import { mathText } from "@/lib/mathText";
import { CHOICE_COUNT, shuffleChoices } from "@/lib/testHtml";
import { questionKey } from "@/lib/questionCheck";
import { attachPassages, needsMissingPassage, newPassagePrefix, passageLength } from "@/lib/passages";

export const maxDuration = 60;

// 講師が確認した「原題」をもとに、類似問題を作る。
//
// 原題は写真・PDFから読み取り、講師が中身を直したもの。ここでは:
//   ・**原題をそのまま出さない**。数値・場面・語を変えた別の問題にする。
//     市販教材をそのまま複製して配ることにならないようにするため。
//   ・国語の読解は、原文を使わず**題材と長さだけをまねて本文を書き起こす**。
//   ・図が要る問題（needs_figure）は渡ってこない。図は作れないので画面側で外している。
//
// 出てきた問題はまだ検算していない。呼び出し側はこのあと /api/generate/verify に
// 1問ずつ通し、引っかかったものを /api/generate/repair で直す（通常の作成と同じ流れ）。

const BATCH = 4;
const DEADLINE_MS = 45_000;

type Source = {
  text: string;
  options?: string[] | null;
  correct_answer?: string;
  unit_guess?: string;
  difficulty_guess?: string;
};

type Draft = {
  text?: string;
  options?: string[];
  correct_answer?: string;
  explanation?: string;
  passage?: string;
  passage_id?: string;
};

const DIFF_JA = (d: string) => (d === "basic" ? "基礎" : d === "standard" ? "標準" : "応用");

export async function POST(req: NextRequest) {
  const auth = await requireTeacher(req);
  if (auth instanceof NextResponse) return auth;
  const { sources, subject, grade, title, perSource, instructions } = await req.json();

  const list = (Array.isArray(sources) ? (sources as Source[]) : [])
    .filter((s) => s && typeof s.text === "string" && s.text.trim());
  if (list.length === 0) {
    return NextResponse.json({ error: "もとにする問題がありません" }, { status: 400 });
  }

  const n = Math.max(1, Math.min(Number(perSource) || 1, 5));
  // 読み取りの段は、本文にぶら下がる原題に「（本文つき）」と印を付けてくる
  const isReading = (subject === "国語" || subject === "英語") && list.some((s) => s.text.includes("（本文つき）"));

  const collected: (Draft & { difficulty: string; unit?: string })[] = [];
  const seen = new Set<string>();
  const startedAt = Date.now();

  for (let i = 0; i < list.length; i += BATCH) {
    if (i > 0 && Date.now() - startedAt > DEADLINE_MS) break;
    const chunk = list.slice(i, i + BATCH);

    const body = chunk
      .map((s, k) => {
        const opts = Array.isArray(s.options) && s.options.length > 0
          ? `\n　選択肢：${s.options.join(" / ")}`
          : "";
        const ans = s.correct_answer ? `\n　誌面の解答：${s.correct_answer}` : "";
        return `[${k + 1}] （${DIFF_JA(s.difficulty_guess ?? "basic")}${s.unit_guess ? `・${s.unit_guess}` : ""}）\n　${s.text}${opts}${ans}`;
      })
      .join("\n\n");

    const already = collected.slice(-30).map((q, k) => `${k + 1}. ${String(q.text).slice(0, 50)}`).join("\n");

    const readingBlock = isReading
      ? `
【本文つきの原題があります（読解）】
- **原題の本文は手元にありません。また、あっても使いません**（そのまま配ると複製になるため）
- 同じ題材の方向・同じくらいの長さで、**本文をあなたが新しく書いて**ください
- 本文は${passageLength(subject, grade)}。1つの本文に設問3〜4問をぶら下げる
- 本文は "passages" に1本ずつ入れる（id は "s1" "s2" …）。**本文の全文は passages にだけ書く**
- 設問の側には "passage_id" で、どの本文の設問かを書く（同じ本文の設問は同じ id）
- **「次の文章を読んで」「本文中」「筆者」などと書く設問には、必ず passage_id を付ける**
`
      : `
【本文を読ませる設問は作らない】
- 「次の文章を読んで」「本文中」「筆者」のような、別の本文を前提にした設問は作らない
- 例文・会話が要る設問は、その例文・会話を問題文の中に全部書く
`;

    const prompt = `あなたは日本の学習塾の問題作成の専門家です。
下に、ある教材に載っていた問題（原題）を書き出しました。
これを**まねて、別の問題を作って**ください。「${title ?? ""}」（${grade}・${subject}）で使います。

【いちばん大事なこと】
- **原題をそのまま出さない。** 数値・場面・登場する語・問い方を変え、別の問題にすること
- ただし**測っている力は同じ**にする（同じ単元・同じ考え方・同じくらいの難しさ）
- 原題1問につき${n}問作る（合計 ちょうど${chunk.length * n}問）
${readingBlock}
【出題形式（必ず守ること）】
- すべて四択。options はちょうど${CHOICE_COUNT}つ
- **同じ内容・言い換えただけの選択肢を入れない**
- correct_answer には options の中の文字列を**一字一句そのまま**入れる
- 誤答は「ありそうな間違い」にする（計算ミス・符号の取り違え・語の混同など）
- explanation に「なぜその答えになるか」を1〜2文で書く
- **図・グラフ・表がないと解けない問題は作らない**（用紙に図を載せられないため）
- **図に言及する言い回しを使わない**（「右の図のように」「下の表から」「次のグラフを見て」など）。
  原題にそういう言い回しがあっても、図に頼らない形に言い換えて出題すること

【数式・記号の書き方（そのまま文字として表示されます）】
- **HTMLタグもLaTeX（$…$、\\frac、^{}、_{}）も使わない**
- 累乗は x²、a³ ／ 添字は a₁ ／ 分数は 3/4 ／ 平方根は √2 ／ 記号は ×÷±≤≥≠π°∠△
- 分数と文字の積は **(1/2)x** のように括弧を付ける（1/2x では 1/(2x) とも読めてしまう）

【追加指示】${instructions || "なし"}
${already ? `\n【すでに作った問題（重複禁止）】\n${already}\n` : ""}
【原題】
${body}

【出力】次の形のJSONのみ（説明文・コードフェンス不要）:
{${isReading ? `"passages": [{"id":"s1","text":"本文の全文"}],\n` : ""}"questions": [
  {"from": 1, "text":"…","options":["…","…","…","…"],"correct_answer":"…","explanation":"…"${isReading ? ',"passage_id":"s1"' : ""}}
]}
from は上の [n] の番号（どの原題をまねたか）です。`;

    let raw: string;
    try {
      raw = (await generateText({
        provider: "openai", prompt, maxTokens: 8192, json: true, feature: "test_similar",
      })).text;
    } catch (e) {
      if (collected.length === 0) {
        return NextResponse.json(aiErrorPayload(e, "test_similar"), { status: 502 });
      }
      break;
    }

    const parsed = extractJson<{ questions?: (Draft & { from?: number })[]; passages?: unknown }>(raw);
    const rawGot = Array.isArray(parsed?.questions) ? parsed!.questions!.filter(Boolean) : [];
    // 本文をひも付ける。id は束をまたいでも一意にする（束ごとに "s1" から振るとかたまりが混ざる）
    const got = attachPassages(rawGot, parsed?.passages, newPassagePrefix("s"), (s) => mathText(s));

    for (const q of got) {
      const text = mathText(q?.text ?? "");
      if (!text.trim()) continue;
      const passage = q.passage ?? "";
      // 本文を読む前提なのに本文が無い設問は、生徒が解けないので入れない
      if (needsMissingPassage({ text, passage })) continue;
      const key = questionKey(text);
      if (seen.has(key)) continue;
      seen.add(key);

      const src = chunk[Math.max(0, Math.min(chunk.length - 1, Number(q?.from ?? 1) - 1))];

      collected.push({
        difficulty: ["basic", "standard", "advanced"].includes(src?.difficulty_guess ?? "")
          ? (src.difficulty_guess as string)
          : "basic",
        unit: src?.unit_guess || undefined,
        text,
        options: Array.isArray(q?.options) ? q.options.map((o) => mathText(o)) : undefined,
        correct_answer: mathText(q?.correct_answer ?? ""),
        explanation: mathText(q?.explanation ?? ""),
        ...(passage ? { passage, passage_id: q.passage_id } : {}),
      });
    }
  }

  if (collected.length === 0) {
    return NextResponse.json(
      { error: "類似問題を作れませんでした。原題の文が短すぎないかご確認ください。" }, { status: 500 },
    );
  }

  const questions = collected.map((q, i) => ({
    id: `q${i + 1}`,
    difficulty: q.difficulty,
    section: DIFF_JA(q.difficulty),
    text: q.text as string,
    type: "multiple-choice",
    options: q.options ?? null,
    correct_answer: q.correct_answer ?? "",
    explanation: q.explanation ?? "",
    unit: q.unit,
    ...(q.passage ? { passage: q.passage, passage_id: q.passage_id } : {}),
    points: 5,
  }));

  // 選択肢はここで並べ替える（AIに頼んでも正解が1番目に寄るため）
  return NextResponse.json({
    questions: questions.map((q) => shuffleChoices(q)),
    fromSources: list.length,
  });
}
