import { NextRequest, NextResponse } from "next/server";
import { requireTeacher } from "@/lib/apiAuth";

import { generateText, extractJson, PROVIDER_LABEL } from "@/lib/ai";
import { checkAll } from "@/lib/questionCheck";
import { CHOICE_MARKS, type TestQuestion, type VerifyStatus } from "@/lib/testHtml";

export const maxDuration = 60;

// テスト作成AIパイプラインの第2段階「検算」。
//
// ここまでの段はどれも「推敲」だった。つまり、誰も問題を解いていない。
// 正解として書かれた選択肢が本当に正しいかを確かめる工程が無く、答えの間違った問題が
// そのまま用紙になって印刷されていた。
//
// この段でやることは2つ:
//   ① 形の点検（AIを呼ばない）… 選択肢が4つあるか、正解が選択肢に実在するか、
//      同じ選択肢が2つ無いか、タグ・LaTeXの書き残しが無いか
//   ② 盲解き … correct_answer と explanation を**外して**別のAIに渡し、実際に解かせる。
//      出てきた答えが用意した正解と違う問題だけを「要修正」として次の段へ回す
//
// 鍵が1社しか無い塾では作成と同じ会社のモデルが解くことになるが、正解を伏せている以上、
// 「その問題がちゃんと解けるか」の検査としては成立する。どの会社が解いたかは返り値に出す。

const CHUNK = 8;
const DEADLINE_MS = 45_000;

type Solved = { no?: number; choice?: number; defect?: string };

export async function POST(req: NextRequest) {
  const auth = await requireTeacher(req);
  if (auth instanceof NextResponse) return auth;
  const { questions, subject, grade, title } = await req.json();

  if (!Array.isArray(questions) || questions.length === 0) {
    return NextResponse.json({ error: "検算対象の問題がありません（先に作成を実行してください）" }, { status: 400 });
  }

  // ── ① 形の点検（機械）──────────────────────────────
  const checked = checkAll(questions as TestQuestion[]);
  const work: TestQuestion[] = checked.map((c) => c.question);
  const issues: string[][] = checked.map((c) => [...c.issues]);
  const fixes: string[][] = checked.map((c) => [...c.fixes]);

  // ── ② 盲解き（AI）────────────────────────────────
  // 形が壊れている問題（選択肢が足りない等）は解かせても意味が無いので飛ばす
  const solvableIdx = work
    .map((q, i) => i)
    .filter((i) => issues[i].length === 0 && Array.isArray(work[i].options) && work[i].options!.length >= 2);

  const chunks: number[][] = [];
  for (let i = 0; i < solvableIdx.length; i += CHUNK) chunks.push(solvableIdx.slice(i, i + CHUNK));

  const startedAt = Date.now();
  const solvedBy = new Map<number, number>(); // 問題index → AIが選んだ選択肢(1始まり)
  const unsolved = new Set<number>(solvableIdx);
  let solverLabel = "";

  for (const chunk of chunks) {
    if (Date.now() - startedAt > DEADLINE_MS) break; // 時間切れ。残りは未検算として返す

    const body = chunk
      .map((idx, n) => {
        const q = work[idx];
        const opts = (q.options ?? [])
          .map((o, i) => `　${CHOICE_MARKS[i] ?? i + 1} ${o}`)
          .join("\n");
        const passage = q.passage ? `【本文】\n${q.passage}\n` : "";
        return `[${n + 1}]\n${passage}${q.text}\n${opts}`;
      })
      .join("\n\n");

    const prompt = `あなたは${grade}の${subject}を教えるベテラン講師です。
次の四択問題を、あなた自身で解いてください。「${title}」という確認テストの原稿です。

【やること】
・各問について、正しいと考える選択肢の番号（1〜4）を答える
・答えが1つに決まらない、問題文が成り立っていない、正しい選択肢が無い、
　選択肢が実質同じ、といった不備があれば defect に短く書く（無ければ空文字）
・**勝手に問題を書き直さない。解くだけ**

【問題】
${body}

【出力】次の形のJSONのみ（説明文・コードフェンス不要）:
{"answers": [{"no": 1, "choice": 2, "defect": ""}, ...]}
no は上の [n] の番号、choice は選んだ選択肢の番号です。全${chunk.length}問ぶん返してください。`;

    try {
      // 作成した会社（OpenAI）とは別の目で見たいので Google を優先。
      // 鍵が無ければ lib/ai が別社へ寄せる（どこが解いたかは下で控える）。
      const res = await generateText({
        provider: "google", prompt, maxTokens: 2048, temperature: 0, json: true,
        feature: "test_verify",
      });
      if (!solverLabel) solverLabel = PROVIDER_LABEL[res.provider];
      const parsed = extractJson<{ answers?: Solved[] }>(res.text);
      const answers = Array.isArray(parsed?.answers) ? parsed!.answers! : [];
      for (const a of answers) {
        const n = Number(a?.no);
        if (!Number.isFinite(n) || n < 1 || n > chunk.length) continue;
        const idx = chunk[n - 1];
        const choice = Number(a?.choice);
        if (Number.isFinite(choice) && choice >= 1) solvedBy.set(idx, choice);
        const defect = String(a?.defect ?? "").trim();
        if (defect) issues[idx].push(`検算AIの指摘：${defect}`);
        unsolved.delete(idx);
      }
    } catch {
      // 検算が落ちても作成そのものは止めない。未検算として画面に出す
      break;
    }
  }

  // ── 突き合わせ ────────────────────────────────────
  let okCount = 0;
  let flaggedCount = 0;
  let unverifiedCount = 0;

  const result = work.map((q, i) => {
    const notes = [...fixes[i]];
    let status: VerifyStatus;

    if (issues[i].length > 0) {
      status = "needs_review";
      notes.push(...issues[i]);
    } else if (unsolved.has(i) || !solvedBy.has(i)) {
      status = "unverified";
      notes.push("時間内に検算できませんでした");
    } else {
      const choice = solvedBy.get(i)!;
      const picked = (q.options ?? [])[choice - 1];
      if (picked !== undefined && picked === q.correct_answer) {
        status = "ok";
      } else {
        status = "needs_review";
        notes.push(
          `検算AIは${CHOICE_MARKS[choice - 1] ?? choice}「${picked ?? "?"}」を選びました（用意した正解は「${q.correct_answer}」）`,
        );
      }
    }

    if (status === "ok") okCount++;
    else if (status === "unverified") unverifiedCount++;
    else flaggedCount++;

    return { ...q, verify_status: status, verify_note: notes.join(" / ") };
  });

  return NextResponse.json({
    questions: result,
    solver: solverLabel || null,
    summary: { ok: okCount, flagged: flaggedCount, unverified: unverifiedCount, total: result.length },
    ...(flaggedCount > 0
      ? { warning: `${flaggedCount}問は正解が確認できませんでした。次の段で直します。` }
      : {}),
  });
}
