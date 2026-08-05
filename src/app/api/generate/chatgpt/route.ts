import { NextRequest, NextResponse } from "next/server";
import { requireTeacher } from "@/lib/apiAuth";

import { generateText, extractJson, aiErrorPayload } from "@/lib/ai";
import { mathText } from "@/lib/mathText";

export const maxDuration = 60;

// テスト作成AIパイプラインの第1段階「下書き」。
//
// 以前は「HTML＋全問のJSON」を1回の応答で書かせていたため、出力トークンの上限に当たって
// 20問頼んでも10問前後で切れていた。ここでは次の2点で問題数を出し切る:
//   ① HTMLは書かせない（用紙の組版は renderTestHtml が機械的に行う）→ トークンを全部問題に使う
//   ② 10問ずつ分けて生成し、既出の問題文を渡して重複を避けながら積み上げる
// 1リクエストの時間には上限があるので、途中までしか作れなかった場合は complete:false を返し、
// 呼び出し側が existingQuestions を渡して続きを頼めるようにする。

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
};

const DIFF_GUIDE: Record<string, string> = {
  basic: "【基礎】基礎計算・基礎語彙・基礎知識・基礎英文法・基礎漢字を中心に出題（100%基礎問題）",
  standard: "【標準】基礎問題70%＋利用問題・英作文など30%を混在させる",
  advanced: "【応用】すべて利用問題・思考力問題・記述問題で構成",
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

/** 問題文をゆるく正規化して重複判定に使う */
function keyOf(text: string): string {
  return String(text ?? "")
    .replace(/\s|　/g, "")
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .toLowerCase()
    .slice(0, 60);
}

export async function POST(req: NextRequest) {
  const auth = await requireTeacher(req);
  if (auth instanceof NextResponse) return auth;
  const {
    testType, title, subject, grade,
    selectedUnits, difficulties, count,
    instructions,
    existingQuestions,
  } = await req.json();

  const typeLabel = testType === "diagnostic"
    ? "学力学習習慣診断分析多層型テスト"
    : "授業確認テスト（報告書用）";

  const unitList = (selectedUnits as { grade: string; unit: string }[] | undefined ?? [])
    .map((u) => `・${u.grade}「${u.unit}」`)
    .join("\n") || "（指定なし：学年・科目に沿った標準的な単元から出題）";

  const diffs = ((difficulties as string[] | undefined) ?? []).filter((d) => DIFF_GUIDE[d]);
  const useDiffs = diffs.length > 0 ? diffs : ["basic"];
  const difficultyGuide = useDiffs.map((d) => DIFF_GUIDE[d]).join("\n");

  const target = Math.max(1, Math.min(Number(count) || 10, 60));

  // すでに作られている問題（続きを頼まれた場合）
  const collected: Draft[] = Array.isArray(existingQuestions)
    ? (existingQuestions as Draft[]).filter((q) => q && typeof q.text === "string")
    : [];
  const seen = new Set(collected.map((q) => keyOf(q.text)));

  const quota = quotaByDifficulty(useDiffs, target);
  const startedAt = Date.now();
  let rounds = 0;

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

    const planText = plan
      .map((p) => `${p.d === "basic" ? "基礎" : p.d === "standard" ? "標準" : "応用"}（difficulty:"${p.d}"）を${p.n}問`)
      .join("、");

    const already = collected.slice(-40).map((q, i) => `${i + 1}. ${q.text.slice(0, 50)}`).join("\n");

    const prompt = `あなたは日本の学習塾の問題作成の専門家です。
「${typeLabel}」の問題を作成してください。

【テスト情報】
テスト名: ${title}
主要学年: ${grade}　科目: ${subject}

【今回作る問題】
${planText}（合計 ちょうど${plan.reduce((s, p) => s + p.n, 0)}問）
※このテストは全${target}問で、そのうち今回はこの分だけを作ります。指定した数をちょうど作ってください。

【出題単元】
${unitList}

【難易度区分と出題方針】
${difficultyGuide}

【追加指示】
${instructions || "なし"}
${already ? `\n【すでに作成済みの問題（重複禁止）】\n${already}\n※上と同じ設問・同じ数値・同じ言い換えは作らないこと。別の切り口・別の数値にすること。` : ""}

【選択肢の正答位置バランス（必須）】
- 四択問題全体で、正解が1番目〜4番目にほぼ均等に分散するようにすること
- 正解が特定の位置（特に1番目）に偏らないよう意図的に分散させること
- correct_answer には必ず options の中の実際のテキストをそのままセットすること

【数式の書き方（そのまま画面に文字として表示されます）】
- **HTMLタグ（<sup> <sub> <span> <br> など）は絶対に使わない**
- **LaTeX記法（$...$、\\frac、\\sqrt、^{}、_{} 等）も絶対に使わない**
- 累乗は上付き文字をそのまま書く: x²、a³、2⁴（x^2 や x<sup>2</sup> は不可）
- 添字も下付き文字をそのまま書く: a₁、x₂
- 分数: 3/4 ／ 平方根: √2、√3 ／ 記号: ×、÷、±、≤、≥、≠、π、°、∠、△
- 方程式: 2x + 3 = 7 のように半角英数字と記号で表現する

以下のJSON形式のみで返してください（説明文・HTMLは不要）:
{
  "questions": [
    {
      "difficulty": "basic",
      "section": "基礎",
      "text": "問題文（プレーンテキスト）",
      "type": "multiple-choice",
      "options": ["選択肢1","選択肢2","選択肢3","選択肢4"],
      "correct_answer": "選択肢1",
      "points": 5
    }
  ]
}

typeは "multiple-choice"（選択肢式）"short-answer"（短答式）"descriptive"（記述式）のいずれか。
short-answer / descriptive のときは options を null にすること。
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

    const parsed = extractJson<{ questions?: Draft[] }>(content);
    const got = Array.isArray(parsed?.questions) ? parsed!.questions! : [];
    if (got.length === 0) {
      if (collected.length === 0 && rounds >= 1) {
        return NextResponse.json({ error: "生成結果のJSON解析に失敗しました" }, { status: 500 });
      }
      rounds++;
      continue;
    }

    let added = 0;
    for (const q of got) {
      if (!q || typeof q.text !== "string" || !q.text.trim()) continue;
      // 指示してもタグやLaTeXが混ざることがあるので、ここで読める表記にそろえる
      const text = mathText(q.text);
      if (!text) continue;
      const k = keyOf(text);
      if (seen.has(k)) continue;
      seen.add(k);
      collected.push({
        difficulty: useDiffs.includes(q.difficulty ?? "") ? q.difficulty : plan[0].d,
        section: q.section ?? "",
        text,
        type: q.type === "multiple-choice" || q.type === "descriptive" ? q.type : "short-answer",
        options: Array.isArray(q.options) && q.options.length > 0 ? q.options.map((o) => mathText(o)) : null,
        correct_answer: mathText(q.correct_answer ?? ""),
        points: Number(q.points) > 0 ? Number(q.points) : 5,
      });
      added++;
      if (collected.length >= target) break;
    }
    rounds++;
    if (added === 0) break; // 重複ばかりで増えないなら打ち切る
  }

  if (collected.length === 0) {
    return NextResponse.json({ error: "問題を作成できませんでした。もう一度お試しください。" }, { status: 500 });
  }

  const questions = collected.map((q, i) => ({ ...q, id: `q${i + 1}` }));
  return NextResponse.json({
    questions,
    requested: target,
    complete: questions.length >= target,
  });
}
