import { generateText, extractJson, PROVIDER_LABEL, type Provider } from "@/lib/ai";
import { checkQuestion } from "@/lib/questionCheck";
import { CHOICE_MARKS, type TestQuestion, type VerifyStatus } from "@/lib/testHtml";

// 問題1問の検算。
//
// 「速く作れる」より「正しく作れる」を優先する。そのため:
//   ・1問ずつ独立に見る（まとめて聞くと、1つの応答が壊れただけで束ごと未検算になる）
//   ・正解を伏せて実際に解かせる
//   ・**「正しいと言える選択肢を全部挙げさせる」**。四択でいちばん多い欠陥は
//     「正解が2つある」で、1つ選ばせるだけでは絶対に見つからない
//   ・食い違ったら、別の会社にもう一度聞いてから判定する（早合点で直しに回さない）
//
// 迷いが残ったものは黙って通さない。needs_review にして講師の目に必ず入れる。

export type VerifyOutcome = {
  status: VerifyStatus;
  note: string;
  /** 実際に解いた会社（画面に出す） */
  solver: string | null;
};

type Solved = {
  /** 正しいと言える選択肢の番号（1始まり）。複数ありうる */
  correct?: number[];
  /** 本文・設問だけで答えが1つに決まるか */
  unique?: boolean;
  /** 設問そのものの不備 */
  defect?: string;
};

/** 正解を伏せて解かせる。解けなければ null */
async function solve(
  q: TestQuestion,
  ctx: { subject: string; grade: string },
  preferred: Provider,
): Promise<{ picked: number[]; unique: boolean; defect: string; provider: string } | null> {
  const opts = (q.options ?? [])
    .map((o, i) => `　${CHOICE_MARKS[i] ?? i + 1} ${o}`)
    .join("\n");

  const prompt = `あなたは${ctx.grade}の${ctx.subject}を教えるベテラン講師です。
次の四択問題を、あなた自身で解いて点検してください。

${q.passage ? `【本文】\n${q.passage}\n\n` : ""}【問題】
${q.text}
${opts}

【答えること】
1. correct … **正しいと言える選択肢の番号をすべて**挙げてください。
   　「いちばんそれらしいもの」ではなく、**正解として成り立つものを漏れなく**挙げます。
   　2つ以上正しい場合は2つとも、1つも正しくない場合は空の配列にしてください。
2. unique … 本文と設問だけを読んで、答えが1つに決まるなら true、
   　解釈によって変わる・条件が足りない・複数成り立つなら false。
3. defect … 設問そのものの不備を短く（例：条件が足りない、選択肢が実質同じ、
   　学年に対して難しすぎる）。無ければ空文字。

**勝手に問題を書き直さないでください。解いて点検するだけです。**

【出力】次の形のJSONのみ（説明文・コードフェンス不要）:
{"correct": [2], "unique": true, "defect": ""}`;

  try {
    const res = await generateText({
      provider: preferred, prompt, maxTokens: 500, temperature: 0, json: true,
      feature: "test_verify",
    });
    const parsed = extractJson<Solved>(res.text);
    if (!parsed) return null;
    const picked = Array.isArray(parsed.correct)
      ? parsed.correct.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n >= 1)
      : [];
    return {
      picked,
      unique: parsed.unique !== false,
      defect: String(parsed.defect ?? "").trim(),
      provider: PROVIDER_LABEL[res.provider],
    };
  } catch {
    return null;
  }
}

/**
 * 1問を検算する。
 *
 * 形の点検 → 盲解き → （食い違ったら）別の会社に確認、の順。
 * どこかで引っかかったら needs_review にして、何が起きたかを note に残す。
 */
export async function verifyOne(
  input: TestQuestion,
  ctx: { subject: string; grade: string },
): Promise<{ question: TestQuestion; outcome: VerifyOutcome }> {
  // ① 形の点検（AIを呼ばない）
  const checked = checkQuestion(input);
  const q = checked.question;
  const notes = [...checked.fixes];

  if (checked.issues.length > 0) {
    return {
      question: q,
      outcome: { status: "needs_review", note: [...notes, ...checked.issues].join(" / "), solver: null },
    };
  }

  const answerNo = (q.options ?? []).indexOf(q.correct_answer ?? "") + 1;

  // ② 盲解き（作成した会社とは別の目で見たいので Google を優先。鍵が無ければ別社へ寄る）
  const first = await solve(q, ctx, "google");
  if (!first) {
    return {
      question: q,
      outcome: { status: "unverified", note: [...notes, "検算できませんでした（AIの応答が得られません）"].join(" / "), solver: null },
    };
  }

  const agrees = first.picked.length === 1 && first.picked[0] === answerNo;
  const clean = agrees && first.unique && !first.defect;

  if (clean) {
    return { question: q, outcome: { status: "ok", note: notes.join(" / "), solver: first.provider } };
  }

  // ③ 食い違った・答えが1つに決まらない → 別の会社にもう一度聞いてから判定する。
  //    1社の勘違いで作り直しに回すと、正しい問題まで壊してしまう。
  const second = await solve(q, ctx, "anthropic");
  const detail: string[] = [...notes];

  const label = (n: number[]) =>
    n.length === 0 ? "「正解なし」" : n.map((i) => CHOICE_MARKS[i - 1] ?? String(i)).join("・");

  if (first.defect) detail.push(`${first.provider}の指摘：${first.defect}`);
  if (!first.unique) detail.push(`${first.provider}：答えが1つに決まらないと判断`);
  if (!agrees) {
    detail.push(
      `${first.provider}は${label(first.picked)}を正しいとしました` +
        `（用意した正解は${CHOICE_MARKS[answerNo - 1] ?? answerNo}「${q.correct_answer}」）`,
    );
  }

  if (second) {
    const secondAgrees = second.picked.length === 1 && second.picked[0] === answerNo;
    if (second.defect) detail.push(`${second.provider}の指摘：${second.defect}`);
    if (!secondAgrees) {
      detail.push(`${second.provider}は${label(second.picked)}を正しいとしました`);
    } else {
      detail.push(`${second.provider}は用意した正解と一致`);
    }
    // 2社とも同じ別の答えを出した＝用意した正解のほうが間違っている可能性が高い
    if (!agrees && !secondAgrees &&
        second.picked.length === 1 && first.picked.length === 1 &&
        second.picked[0] === first.picked[0]) {
      detail.push("2社とも同じ選択肢を正解としています。用意した正解のほうが誤っている可能性が高いです");
    }
  }

  return {
    question: q,
    outcome: {
      status: "needs_review",
      note: detail.join(" / "),
      solver: first.provider,
    },
  };
}
