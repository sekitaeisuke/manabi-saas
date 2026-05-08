import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type SectionAnswers = Record<string, number>;

const SECTION_A_LABELS: Record<string, string> = {
  a1: "毎日決まった時間に勉強している",
  a2: "塾の宿題を期日までに提出している",
  a3: "予習・復習を自分でしている",
  a4: "勉強中にスマホやゲームをしない",
  a5: "テスト前は計画を立てて勉強している",
  a6: "塾以外でも毎日30分以上勉強している",
  a7: "苦手な単元を避けずに取り組んでいる",
  a8: "暗記・基礎練習を毎日続けている",
};

const SECTION_B_LABELS: Record<string, string> = {
  b1: "問題文をよく読んでから解いている",
  b2: "解説をしっかり読んで理解している",
  b3: "例題・見本を参考にして問題を解いている",
  b4: "計算や解法の途中式を書いている",
  b5: "授業のノートをきれいに取っている",
  b6: "新出単語・語彙を記録している",
  b7: "わからないことを先生に質問している",
  b8: "テストの範囲・形式を事前に確認している",
  b9: "理解できるまで先生に聞き直している",
  b10: "間違えた問題の原因を説明できる",
  b11: "間違えた問題をやり直して説明できる",
  b12: "どの教科にどれだけ時間をかけるか説明できる",
};

const SECTION_C_LABELS: Record<string, string> = {
  c1: "問題文の言葉の意味を正しく理解できる",
  c2: "問題文の文法・文章の構造を理解できる",
  c3: "問題の条件や制約を正確に把握できる",
  c4: "選択肢や記述の形式に合った答え方ができる",
  c5: "自分の考えを文章や式で表現できる",
  c6: "難しい問題でも部分点を取る工夫ができる",
  c7: "時間内に問題を解き終えることができる",
};

function ratingText(r: number): string {
  return r === 4 ? "いつもそう" : r === 3 ? "だいたいそう" : r === 2 ? "あまりそうでない" : "ほとんどない";
}

function sectionScore(answers: SectionAnswers): number {
  const vals = Object.values(answers);
  if (vals.length === 0) return 0;
  return Math.round((vals.reduce((a, b) => a + b, 0) / (vals.length * 4)) * 100);
}

async function callClaude(prompt: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Claude APIエラー: ${(err as { error?: { message?: string } }).error?.message ?? res.status}`);
  }
  const data = await res.json() as { content?: { text?: string }[] };
  return data.content?.[0]?.text ?? "";
}

export async function POST(req: NextRequest) {
  const { session_id } = await req.json() as { session_id: string };

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Fetch questionnaire response
  const { data: qr, error } = await supabase
    .from("questionnaire_responses")
    .select("*")
    .eq("session_id", session_id)
    .single();

  if (error || !qr) {
    return NextResponse.json({ error: "アンケートデータが見つかりません" }, { status: 404 });
  }

  const sA = (qr.section_a ?? {}) as SectionAnswers;
  const sB = (qr.section_b ?? {}) as SectionAnswers;
  const sC = (qr.section_c ?? {}) as SectionAnswers;

  const habitScore = sectionScore(sA);
  const methodScore = sectionScore({ ...Object.fromEntries(Object.entries(sB).slice(0, 9)) });
  const verbalScore = sectionScore({ ...Object.fromEntries(Object.entries(sB).slice(9)) });
  const skillScore = sectionScore(sC);
  const testRate = qr.test_percentage ?? null;

  // Format section answers for prompt
  const formatSection = (labels: Record<string, string>, answers: SectionAnswers) =>
    Object.entries(labels)
      .map(([k, label]) => `  ・${label}：${ratingText(answers[k] ?? 1)}（${answers[k] ?? 1}点）`)
      .join("\n");

  const aiAnalysisSection = qr.ai_analysis
    ? `\n【学力テスト 解答分析（AI自動分析済み）】\n${qr.ai_analysis}\n`
    : "";

  const prompt = `あなたは日本の学習塾の教育分析の専門家です。
以下の生徒アンケートとテスト結果をもとに「学力・学習習慣・学習法 多層診断レポート」を作成してください。

━━━━━━━━━━━━━━━━━━━━
【生徒情報】
氏名: ${qr.student_name}　学年: ${qr.grade ?? "不明"}　科目: ${qr.subject ?? "不明"}

【テスト結果】
得点: ${qr.test_score ?? "未実施"}点 / ${qr.test_total ?? "-"}点（正答率 ${testRate ?? "-"}%）
${aiAnalysisSection}

━━━━━━━━━━━━━━━━━━━━
【A. 学習習慣セクション】（スコア: ${habitScore}/100）
${formatSection(SECTION_A_LABELS, sA)}

【B. 学習法セクション】（スコア: ${methodScore}/100）
読む・書く・聞く・話す の視点で:
${formatSection(SECTION_B_LABELS, sB)}

【C. 学力スキル自己評価】（スコア: ${skillScore}/100）
${formatSection(SECTION_C_LABELS, sC)}

━━━━━━━━━━━━━━━━━━━━
【スコアサマリー】
学習習慣スコア: ${habitScore}/100
学習法（読む・書く・聞く）スコア: ${methodScore}/100
言語化・説明力スコア: ${verbalScore}/100
学力スキル自己評価スコア: ${skillScore}/100
テスト正答率: ${testRate ?? "-"}%

【レポート作成指示】
A4用紙1〜2枚に収まるHTMLで、以下の構成でレポートを作成してください。

1. 総合診断サマリー（学力・学習習慣・学習法の3軸評価、100字程度）
2. テスト結果から見る学力診断（正答率と傾向の分析）
3. 学習習慣診断（8項目の評価から継続力・自律性を分析）
4. 学習法診断（読む・書く・聞く・話すの4視点を分析）
5. 学力スキル自己評価（語彙・文法・設問条件・解答型・表現力を分析）
6. 最優先改善ポイント（3項目、具体的なアクション付き）
7. 今後の学習方針（具体的・実践的に）
8. 講師へのメモ（指導時の注意点・観察ポイント）
9. 保護者へのメッセージ（温かく丁寧に、200字程度）

【HTML作成ルール】
- <div id="diagnosis-report">〜</div> で返す
- A4印刷を想定した構成（@media printで改ページ制御）
- スコアは色分けで視覚化（80以上=緑、60-79=青、40-59=黄、40未満=赤）
- 表やボックスを使って見やすくする
- LaTeX記法は使わない
- 数式はHTML上付き文字や Unicode 記号を使う

HTMLのみを返してください（説明文・JSONは不要）。`;

  let reportHtml: string;
  try {
    reportHtml = await callClaude(prompt);
    // Strip markdown code fences (```html ... ``` or ``` ... ```)
    reportHtml = reportHtml.trim();
    if (reportHtml.startsWith("```html")) reportHtml = reportHtml.slice(7);
    else if (reportHtml.startsWith("```")) reportHtml = reportHtml.slice(3);
    if (reportHtml.endsWith("```")) reportHtml = reportHtml.slice(0, -3);
    reportHtml = reportHtml.trim();
    // Extract <div id="diagnosis-report">...</div> if wrapped in extra text
    const match = reportHtml.match(/<div id="diagnosis-report">[\s\S]*<\/div>/);
    if (match) reportHtml = match[0];
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }

  // Save report HTML and scores back to the questionnaire_responses row
  await supabase.from("questionnaire_responses").update({
    habit_score: habitScore,
    method_score: methodScore,
    verbal_score: verbalScore,
    skill_score: skillScore,
    report_html: reportHtml,
    status: "analyzed",
  }).eq("session_id", session_id);

  return NextResponse.json({
    reportHtml,
    habitScore,
    methodScore,
    verbalScore,
    skillScore,
    studentName: qr.student_name,
    grade: qr.grade,
    subject: qr.subject,
    testScore: qr.test_score,
    testTotal: qr.test_total,
    testRate,
  });
}
