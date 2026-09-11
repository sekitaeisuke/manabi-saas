import { NextRequest, NextResponse } from "next/server";
import { requireTeacher } from "@/lib/apiAuth";

import { generateText, extractJson, aiErrorPayload } from "@/lib/ai";
import { mathText } from "@/lib/mathText";
import { CHOICE_COUNT, shuffleChoices, type VerifyStatus } from "@/lib/testHtml";
import { questionKey } from "@/lib/questionCheck";
import { pickFromBank } from "@/lib/questionBank";
import {
  attachPassages, isReadingUnit, needsMissingPassage, newPassagePrefix, passageLength, readingMode,
} from "@/lib/passages";

export const maxDuration = 60;

// テスト作成AIパイプラインの第1段階「下書き」。
//
// 以前は「HTML＋全問のJSON」を1回の応答で書かせていたため、出力トークンの上限に当たって
// 20問頼んでも10問前後で切れていた。ここでは次の2点で問題数を出し切る:
//   ① HTMLは書かせない（用紙の組版は renderTestHtml が機械的に行う）→ トークンを全部問題に使う
//   ② 10問ずつ分けて生成し、既出の問題文を渡して重複を避けながら積み上げる
// 1リクエストの時間には上限があるので、途中までしか作れなかった場合は complete:false を返し、
// 呼び出し側が existingQuestions を渡して続きを頼めるようにする。
//
// 出題はすべて四択にそろえている。記述式は生徒の書く力の差がそのまま点差になり、
// 「その単元が分かっているか」を測れないため。全問四択なら採点も機械で確定する。
//
// 選択肢の並べ替えは最後にこのファイルの中で行う。「正解を1番目に偏らせないで」と
// AIに頼んでも守られない（実測で全問が①に寄った）ので、位置の分散はコードで確定させる。

const BATCH_SIZE = 10;
const MAX_ROUNDS = 6;
const DEADLINE_MS = 45_000;

type Draft = {
  id?: string;
  difficulty?: string;
  section?: string;
  text: string;
  type?: string;
  options?: string[] | null;
  correct_answer?: string;
  points?: number;
  explanation?: string;
  passage?: string;
  passage_id?: string;
  /** どの単元の問題か。問題バンクから引き当てるために付ける */
  unit?: string;
  verify_status?: VerifyStatus;
  verify_note?: string;
};

const DIFF_GUIDE: Record<string, string> = {
  basic: "【基礎】基礎計算・基礎語彙・基礎知識・基礎英文法・基礎漢字を中心に出題（100%基礎問題）",
  standard: "【標準】基礎問題70%＋利用問題・英作文など30%を混在させる",
  advanced: "【応用】すべて利用問題・思考力問題（記述はさせず、四択で考えさせる）",
};

/** 難易度ごとの必要数を目標問題数から割り振る */
function quotaByDifficulty(difficulties: string[], target: number): Record<string, number> {
  const q: Record<string, number> = {};
  const n = difficulties.length;
  const base = Math.floor(target / n);
  let rest = target - base * n;
  difficulties.forEach((d) => {
    q[d] = base + (rest > 0 ? 1 : 0);
    if (rest > 0) rest--;
  });
  return q;
}

const DIFF_JA = (d: string) => (d === "basic" ? "基礎" : d === "standard" ? "標準" : "応用");

/** 全プロンプト共通の書き方の約束 */
const FORMAT_RULES = `【数式・記号の書き方（そのまま画面に文字として表示されます）】
- **HTMLタグ（<sup> <sub> <span> <br> など）は絶対に使わない**
- **LaTeX記法（$...$、\\frac、\\sqrt、^{}、_{} 等）も絶対に使わない**
- 累乗は上付き文字をそのまま書く: x²、a³、2⁴（x^2 や x<sup>2</sup> は不可）
- 添字も下付き文字をそのまま書く: a₁、x₂
- 分数: 3/4 ／ 平方根: √2、√3 ／ 記号: ×、÷、±、≤、≥、≠、π、°、∠、△
- 分数と文字の積は **(1/2)x** のように括弧を付ける（1/2x では 1/(2x) とも読めてしまう）
- 方程式: 2x + 3 = 7 のように半角英数字と記号で表現する

【出題形式（必ず守ること）】
- **すべて四択**にする。type は必ず "multiple-choice"
- options はちょうど${CHOICE_COUNT}つ。**同じ内容・言い換えただけの選択肢を入れない**
- correct_answer には options の中の文字列を**一字一句そのまま**入れる
- 誤答の選択肢は「ありそうな間違い」にする（計算ミス・符号の取り違え・語の混同など）。
  明らかに的外れな選択肢で埋めない
- explanation に「なぜその答えになるか」を1〜2文で書く
- unit に、その問題がどの単元のものかを**下の「出題単元」に挙げた名前のまま**入れる`;

export async function POST(req: NextRequest) {
  const auth = await requireTeacher(req);
  if (auth instanceof NextResponse) return auth;
  const {
    testType, title, subject, grade,
    selectedUnits, difficulties, count,
    instructions,
    existingQuestions,
    useBank,
  } = await req.json();

  const typeLabel = testType === "diagnostic"
    ? "学力学習習慣診断分析多層型テスト"
    : "授業確認テスト（報告書用）";

  const units = (selectedUnits as { grade: string; unit: string }[] | undefined) ?? [];
  const unitList = units.map((u) => `・${u.grade}「${u.unit}」`).join("\n")
    || "（指定なし：学年・科目に沿った標準的な単元から出題）";

  const diffs = ((difficulties as string[] | undefined) ?? []).filter((d) => DIFF_GUIDE[d]);
  const useDiffs = diffs.length > 0 ? diffs : ["basic"];
  const difficultyGuide = useDiffs.map((d) => DIFF_GUIDE[d]).join("\n");

  const target = Math.max(1, Math.min(Number(count) || 10, 60));
  const reading = readingMode(subject, units, instructions);
  const readingUnits = units.filter((u) => isReadingUnit(subject, u.unit ?? "")).map((u) => u.unit);

  // すでに作られている問題（続きを頼まれた場合）
  const collected: Draft[] = Array.isArray(existingQuestions)
    ? (existingQuestions as Draft[]).filter((q) => q && typeof q.text === "string")
    : [];
  const seen = new Set(collected.map((q) => questionKey(q.text)));
  // 本文つきの場合、すでに使った本文の主題を渡して同じ話を書かせない
  const usedPassages = new Set(
    collected.map((q) => String(q.passage ?? "").slice(0, 40)).filter(Boolean),
  );

  const quota = quotaByDifficulty(useDiffs, target);

  // ── まず問題バンクから使えるものを拾う ────────────────
  // 毎回ゼロから作ると時間も費用もかかり、テストをまたいだ重複も防げない。
  // 貯めてあるのは検算を通った問題だけなので、拾ったものはそのまま使える。
  let fromBank = 0;
  if (useBank !== false && collected.length < target) {
    const remaining: Record<string, number> = {};
    for (const d of useDiffs) {
      remaining[d] = quota[d] - collected.filter((q) => q.difficulty === d).length;
    }
    try {
      const pick = await pickFromBank({
        subject, grade,
        units: units.map((u) => u.unit).filter(Boolean),
        quota: remaining,
        excludeKeys: seen,
      });
      for (const q of pick.questions) {
        if (collected.length >= target) break;
        collected.push({
          difficulty: q.difficulty,
          section: "",
          text: q.text,
          type: "multiple-choice",
          options: q.options ?? null,
          correct_answer: q.correct_answer ?? "",
          explanation: q.explanation ?? "",
          unit: q.unit,
          ...(q.passage ? { passage: q.passage, passage_id: q.passage_id } : {}),
          points: 5,
          verify_status: q.verify_status,
          verify_note: q.verify_note,
        });
        fromBank++;
      }
    } catch {
      // バンクが引けなくても作成は止めない（全部AIで作る）
    }
  }

  const startedAt = Date.now();
  let rounds = 0;
  /** 本文を付け忘れた設問として落とした数（講師への注意書きに使う） */
  let droppedNoPassage = 0;

  while (collected.length < target && rounds < MAX_ROUNDS) {
    if (rounds > 0 && Date.now() - startedAt > DEADLINE_MS) break;

    // 今回の分の難易度内訳（不足している難易度から順に埋める）
    const need = Math.min(BATCH_SIZE, target - collected.length);
    const shortage = useDiffs.map((d) => ({
      d,
      lack: quota[d] - collected.filter((q) => q.difficulty === d).length,
    }));
    const plan: { d: string; n: number }[] = [];
    let left = need;
    for (const s of shortage.sort((a, b) => b.lack - a.lack)) {
      if (left <= 0) break;
      if (s.lack <= 0) continue;
      const n = Math.min(s.lack, left);
      plan.push({ d: s.d, n });
      left -= n;
    }
    if (plan.length === 0) plan.push({ d: useDiffs[0], n: need });
    if (left > 0) plan[0].n += left;

    const batchTotal = plan.reduce((s, p) => s + p.n, 0);
    const planText = plan
      .map((p) => `${DIFF_JA(p.d)}（difficulty:"${p.d}"）を${p.n}問`)
      .join("、");

    const already = collected.slice(-40).map((q, i) => `${i + 1}. ${q.text.slice(0, 50)}`).join("\n");

    // 読解は、本文を作ってそこに設問をぶら下げる。1本文につき3〜4問。
    // 本文は passages に1本ずつ書かせ、設問は passage_id で指す。
    // 「各設問に本文の全文を入れて」と頼んでいた頃は、2問目以降の本文を空にされて抜け落ちていた。
    const lang = subject === "英語" ? "英文" : "文章";
    const usedNote = usedPassages.size > 0
      ? `\n- すでに次の本文を使っています。**同じ題材・同じ書き出しにしない**:\n${[...usedPassages].map((p) => `　「${p}…」`).join("\n")}`
      : "";
    const passageHowTo = `- 本文は "passages" に1本ずつ入れる（id は "p1" "p2" …）。**本文の全文は passages にだけ書く**
- 設問の側には "passage_id" で、どの本文の設問かを書く（同じ本文の設問は同じ id）
- **text に「次の${lang}を読んで」「本文中」「筆者」などと書く設問には、必ず passage_id を付ける。**
  本文の付いていない設問に、本文があるかのような書き方をしない（生徒は本文が無いと解けない）`;
    const readingBlock = reading === "required"
      ? `
【本文つきの設問（読解）】
- 読解の単元（${readingUnits.join("・") || "追加指示のとおり"}）の設問は、本文を**あなたが創作**し、その本文に設問をぶら下げる
- 本文は**${passageLength(subject, grade)}**。${grade}の生徒が読み切れる長さ・語彙にする
- 詩・短歌・俳句の単元は作品そのものを本文にする。古文・漢文は、有名な作品の**確実に正確に書ける一節**だけを使う（うろ覚えの本文を書かない）
- **1つの本文につき設問は3〜4問**
${passageHowTo}${usedNote}
- 設問は「指示語の指す内容」「筆者の主張」「気持ちの変化」「理由」「語句の意味」など、
  **本文を読まないと答えられないもの**にする。一般常識で解けるものにしない
- 読解でない単元（漢字・文法・語彙など）の設問は passage_id を付けず、問題文だけで完結させる
`
      : reading === "allowed"
        ? `
【読解の設問を入れる場合】
- 本文を**あなたが創作**して passages に入れ、1つの本文に設問3〜4問をぶら下げる（本文は${passageLength(subject, grade)}）
${passageHowTo}${usedNote}
`
        : `
【本文を読ませる設問は作らない】
- 「次の文章を読んで」「本文中」「筆者」「次の英文を読んで」のような、別の本文を前提にした設問は作らない
- 例文・会話が要る設問は、**その例文・会話を問題文の中に全部書く**
`;

    const prompt = `あなたは日本の学習塾の問題作成の専門家です。
「${typeLabel}」の問題を作成してください。

【テスト情報】
テスト名: ${title}
主要学年: ${grade}　科目: ${subject}

【今回作る問題】
${planText}（合計 ちょうど${batchTotal}問）
※このテストは全${target}問で、そのうち今回はこの分だけを作ります。指定した数をちょうど作ってください。

【出題単元】
${unitList}

【難易度区分と出題方針】
${difficultyGuide}

【追加指示】
${instructions || "なし"}
${readingBlock}${already ? `\n【すでに作成済みの問題（重複禁止）】\n${already}\n※上と同じ設問・同じ数値・同じ言い換えは作らないこと。別の切り口・別の数値にすること。` : ""}

${FORMAT_RULES}

以下のJSON形式のみで返してください（説明文・HTMLは不要）:
{${reading !== "none" ? `\n  "passages": [\n    { "id": "p1", "text": "本文の全文（本文を使う設問が無ければ passages は空の配列）" }\n  ],` : ""}
  "questions": [
    {
      "difficulty": "basic",
      "section": "基礎",
      "text": "問題文（プレーンテキスト）",
      "type": "multiple-choice",
      "options": ["選択肢1","選択肢2","選択肢3","選択肢4"],
      "correct_answer": "選択肢1",
      "explanation": "なぜその答えになるかを1〜2文で",
      "unit": "出題単元に挙げた名前のいずれか",
      "points": 5${reading !== "none" ? `,\n      "passage_id": "p1"` : ""}
    }
  ]
}

JSONのみを返してください。`;

    let content: string;
    try {
      content = (await generateText({
        provider: "openai", prompt, maxTokens: 8192, json: true, feature: "test_draft",
      })).text;
    } catch (e) {
      // 1問も作れていないときだけ失敗として返す。途中まで作れていれば手元の分を返す
      if (collected.length === 0) {
        return NextResponse.json(aiErrorPayload(e, "test_draft"), { status: 502 });
      }
      break;
    }

    const parsed = extractJson<{ questions?: Draft[]; passages?: unknown }>(content);
    const rawGot = Array.isArray(parsed?.questions)
      ? parsed!.questions!.filter((q) => q && typeof q.text === "string" && q.text.trim())
      : [];
    if (rawGot.length === 0) {
      if (collected.length === 0 && rounds >= 1) {
        return NextResponse.json({ error: "生成結果のJSON解析に失敗しました" }, { status: 500 });
      }
      rounds++;
      continue;
    }

    // 本文を設問にひも付ける。id はリクエストをまたいでも一意にする
    // （"r1_p1" を毎回使っていた頃は、続きの作成やバンクの本文とかたまりが混ざった）
    const got = attachPassages(rawGot, parsed?.passages, newPassagePrefix(), (s) => mathText(s));

    let added = 0;
    let dropped = 0;
    for (const q of got) {
      // 指示してもタグやLaTeXが混ざることがあるので、ここで読める表記にそろえる
      const text = mathText(q.text);
      if (!text) continue;
      const passage = q.passage ?? "";
      const passageId = q.passage_id;
      // 「本文中で」「筆者が」と書いてあるのに本文が無い設問は、生徒が解けないので入れない。
      // 足りない分は次の回で作り直す
      if (needsMissingPassage({ text, passage })) {
        dropped++;
        continue;
      }
      const k = questionKey(text);
      if (seen.has(k)) continue;
      seen.add(k);

      if (passage) usedPassages.add(passage.slice(0, 40));

      collected.push({
        difficulty: useDiffs.includes(q.difficulty ?? "") ? q.difficulty : plan[0].d,
        section: q.section ?? "",
        text,
        // 全問四択にそろえる。AIが short-answer と書いてきても選択肢があれば四択として扱い、
        // 選択肢が無いものは（形の検査で落ちるので）ここでは通しておく
        type: "multiple-choice",
        options: Array.isArray(q.options) && q.options.length > 0 ? q.options.map((o) => mathText(o)) : null,
        correct_answer: mathText(q.correct_answer ?? ""),
        explanation: mathText(q.explanation ?? ""),
        // 単元名は選んだものに限る（AIが勝手な名前を書いてもバンクで引けなくなるだけなので落とす）
        unit: units.some((u) => u.unit === q.unit) ? q.unit : units[0]?.unit,
        ...(passage ? { passage, passage_id: passageId } : {}),
        points: Number(q.points) > 0 ? Number(q.points) : 5,
      });
      added++;
      if (collected.length >= target) break;
    }
    droppedNoPassage += dropped;
    rounds++;
    // 重複ばかりで増えないなら打ち切る。本文の付け忘れで落としただけなら、もう一度作らせる
    if (added === 0 && dropped === 0) break;
  }

  if (collected.length === 0) {
    return NextResponse.json({ error: "問題を作成できませんでした。もう一度お試しください。" }, { status: 500 });
  }

  // 選択肢はここで並べ替える。AIに「正解を1番目に偏らせないで」と頼んでも守られず、
  // 実測でも全問が①に寄った。位置の分散はコードで確定させる。
  const questions = collected.map((q, i) => shuffleChoices({ ...q, id: `q${i + 1}` }));
  return NextResponse.json({
    questions,
    requested: target,
    fromBank,
    generated: questions.length - fromBank,
    complete: questions.length >= target,
    ...(droppedNoPassage > 0 ? { droppedNoPassage } : {}),
  });
}
