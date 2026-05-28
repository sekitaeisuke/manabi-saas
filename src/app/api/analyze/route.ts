import { NextRequest, NextResponse } from "next/server";

type Question = {
  id: string;
  difficulty: string;
  section: string;
  text: string;
  type: string;
  correct_answer: string;
  points: number;
};

type AnswerEntry = {
  questionId: string;
  answer: string;
  isCorrect: boolean;
  points: number;
};

export async function POST(req: NextRequest) {
  const { testType, title, subject, grade, questions, answers, studentName } = await req.json();

  const scored: AnswerEntry[] = (questions as Question[]).map((q) => {
    const given = (answers as Record<string, string>)[q.id] ?? "";
    const givenNorm = given.trim();
    const correctNorm = q.correct_answer.trim();
    let isCorrect = givenNorm === correctNorm;
    if (!isCorrect && q.type === "multiple-choice") {
      // "C. -1" vs "C" — compare only the leading option letter/label
      const givenLetter = givenNorm.split(/[\s.。]/)[0];
      const correctLetter = correctNorm.split(/[\s.。]/)[0];
      isCorrect = givenLetter.length > 0 && givenLetter === correctLetter;
    }
    return { questionId: q.id, answer: given, isCorrect, points: isCorrect ? q.points : 0 };
  });

  const totalPoints = (questions as Question[]).reduce((s: number, q: Question) => s + q.points, 0);
  const earned = scored.reduce((s, a) => s + a.points, 0);
  const rate = totalPoints > 0 ? Math.round((earned / totalPoints) * 100) : 0;

  const byDifficulty: Record<string, { earned: number; total: number; wrong: string[] }> = {};
  (questions as Question[]).forEach((q, i) => {
    const d = q.difficulty ?? "unknown";
    if (!byDifficulty[d]) byDifficulty[d] = { earned: 0, total: 0, wrong: [] };
    byDifficulty[d].total += q.points;
    if (scored[i].isCorrect) {
      byDifficulty[d].earned += q.points;
    } else {
      byDifficulty[d].wrong.push(q.text.slice(0, 30));
    }
  });

  const diffSummary = Object.entries(byDifficulty)
    .map(([d, v]) => `${d}：${v.earned}/${v.total}点（${v.total > 0 ? Math.round(v.earned/v.total*100) : 0}%）`)
    .join("\n");

  const wrongList = scored
    .map((a, i) => {
      if (a.isCorrect) return null;
      const q = (questions as Question[])[i];
      const studentAns = a.answer.trim() || "未回答";
      return `・${q.text.slice(0, 50)}（生徒の解答：「${studentAns}」／正解：「${q.correct_answer}」）`;
    })
    .filter(Boolean)
    .join("\n");

  const typeLabel = testType === "diagnostic"
    ? "学力学習習慣診断分析多層型テスト"
    : "授業確認テスト（報告書）";

  const prompt = testType === "diagnostic"
    ? `あなたは学習塾の教育分析の専門家です。
以下の診断テスト結果を分析し、学力診断レポートを日本語で作成してください。

【テスト情報】
テスト名: ${title}　生徒名: ${studentName}
科目: ${subject}　学年: ${grade}

【得点結果】
合計: ${earned}/${totalPoints}点（${rate}%）
${diffSummary}

【間違えた問題】
${wrongList || "（なし）"}

【レポート内容（HTML形式で作成）】
1. 総合評価コメント（200字程度）
2. 難易度別分析（基礎/標準/応用それぞれの習熟度と課題）
3. 弱点単元と重点学習アドバイス
4. 今後の学習方針（具体的に）
5. 保護者向けひとことメッセージ

HTMLを含むJSON形式で返してください:
{"reportHtml": "<div>...レポートHTML...</div>", "score": ${earned}, "total": ${totalPoints}, "rate": ${rate}}`
    : `あなたは学習塾の教師です。
以下の授業確認テスト結果をもとに、保護者向け授業報告書を日本語で作成してください。

【テスト情報】
テスト名: ${title}　生徒名: ${studentName}
科目: ${subject}　学年: ${grade}

【得点結果】
合計: ${earned}/${totalPoints}点（${rate}%）
${diffSummary}

【間違えた問題】
${wrongList || "（なし）"}

【報告書内容（HTML形式）】
1. 本日の授業内容まとめ（箇条書き）
2. テスト結果と理解度評価
3. できていた点（具体的に）
4. 課題・復習ポイント（具体的に）
5. 次回授業の予定
6. 保護者へのメッセージ（温かく丁寧に）

HTMLを含むJSON形式で返してください:
{"reportHtml": "<div>...報告書HTML...</div>", "score": ${earned}, "total": ${totalPoints}, "rate": ${rate}}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("Claude API error:", res.status, errText);
    return NextResponse.json({ error: "分析に失敗しました" }, { status: 502 });
  }
  const data = await res.json();
  let content = (data.content?.[0]?.text ?? "") as string;
  // Strip markdown code fences if present
  content = content.trim();
  if (content.startsWith("```json")) content = content.slice(7);
  else if (content.startsWith("```")) content = content.slice(3);
  if (content.endsWith("```")) content = content.slice(0, -3);
  content = content.trim();
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) return NextResponse.json({ error: "分析に失敗しました" }, { status: 500 });

  let result: Record<string, unknown>;
  try {
    result = JSON.parse(match[0]);
  } catch (parseErr) {
    console.error("analyze JSON.parse failed:", parseErr, "raw:", match[0].slice(0, 200));
    return NextResponse.json({ error: "分析結果のパースに失敗しました" }, { status: 500 });
  }
  // Strip code fences from reportHtml if Claude wrapped it
  if (typeof result.reportHtml === "string") {
    let html = result.reportHtml.trim();
    if (html.startsWith("```html")) html = html.slice(7);
    else if (html.startsWith("```")) html = html.slice(3);
    if (html.endsWith("```")) html = html.slice(0, -3);
    result.reportHtml = html.trim();
  }
  return NextResponse.json({ ...result, byDifficulty, scored });
}
