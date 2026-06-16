import { NextRequest, NextResponse } from "next/server";
import { requireTeacher } from "@/lib/apiAuth";
import { createClient } from "@supabase/supabase-js";

type SectionAnswers = Record<string, number>;

// ラベルは受験ページ（test/[token]）の実際の設問文に同期している。
const SECTION_A_LABELS: Record<string, string> = {
  a1: "毎日、決まった時間に勉強している",
  a2: "宿題を決められた日までに終わらせている",
  a3: "毎日2時間以上勉強している",
  a4: "授業の前に前回の内容を見直している",
  a5: "授業が終わったその日に内容を復習している",
  a6: "テスト前に計画を立てて勉強している",
  a7: "勉強中にスマホやゲームが気になって集中できないことがある",
  a8: "「今日はいいや」と勉強をやめてしまうことがある",
};

const SECTION_B_LABELS: Record<string, string> = {
  b1: "わからない問題でも自分でじっくり考え続けている",
  b2: "間違えた問題をもう一度自分で解きなおしている",
  b3: "解説を読んで「なるほど」と理解できている",
  b4: "教科書や参考書の例題を自分で読んで学ぼうとしている",
  b5: "ノートに大事なことをまとめている",
  b6: "新しい言葉や公式を書いて覚えるようにしている",
  b7: "わからないとき先生に積極的に質問している",
  b8: "自分の得意な科目と苦手な科目がわかっている",
};

const SECTION_C_LABELS: Record<string, string> = {
  c1: "問題文に知らない言葉や用語が出てきて困ることがある",
  c2: "文の意味や言葉のルールがよくわからなくなることがある",
  c3: "問題が「何を答えればいいのか」わからなくなることがある",
  c4: "答えはわかっているのに、どう書けばいいかわからないことがある",
  c5: "頭ではわかっているのに、うまく答えを書けないことがある",
  c6: "計算や暗記（単語・公式）はスムーズにできている",
  c7: "間違えた問題について、なぜ間違えたか自分で説明できる",
};

// 逆転項目：「〜で困る／やめてしまう」など、高評価ほど“悪い”設問。
// 5 - r で反転し、全指標を「高いほど良い」に統一して採点する。
const REVERSE_KEYS = new Set(["a7", "a8", "c1", "c2", "c3", "c4", "c5"]);

// 言語力（読解・表現・説明）= C1〜C5、技能（計算・暗記・メタ認知）= C6・C7
const VERBAL_KEYS = ["c1", "c2", "c3", "c4", "c5"];
const SKILL_KEYS = ["c6", "c7"];

function ratingText(r: number): string {
  return r === 4 ? "いつもそう" : r === 3 ? "だいたいそう" : r === 2 ? "あまりそうでない" : "ほとんどない";
}

// 指定キー群を極性補正して 0〜100 で採点（回答が無いキーは除外）
function scoreItems(answers: SectionAnswers, keys: string[]): number {
  const present = keys.filter((k) => typeof answers[k] === "number");
  if (present.length === 0) return 0;
  const sum = present.reduce((s, k) => {
    const v = answers[k] as number;
    return s + (REVERSE_KEYS.has(k) ? 5 - v : v);
  }, 0);
  return Math.round((sum / (present.length * 4)) * 100);
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
  const auth = await requireTeacher(req);
  if (auth instanceof NextResponse) return auth;
  const { session_id } = await req.json() as { session_id: string };

  // RLS を貫通するため service role で読み書き（呼び出し元は requireTeacher 済み）
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
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

  const habitScore = scoreItems(sA, Object.keys(SECTION_A_LABELS));
  const methodScore = scoreItems(sB, Object.keys(SECTION_B_LABELS));
  const verbalScore = scoreItems(sC, VERBAL_KEYS);   // 言語力（C1〜C5）
  const skillScore = scoreItems(sC, SKILL_KEYS);     // 技能（C6・C7）
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

【C. 言語力・技能 自己評価】（言語力: ${verbalScore}/100 ／ 技能: ${skillScore}/100）
※「困る/わからない」系の設問は、回答が低いほど良い（採点時に極性補正済み）。
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
  const { error: updateErr } = await supabase.from("questionnaire_responses").update({
    habit_score: habitScore,
    method_score: methodScore,
    verbal_score: verbalScore,
    skill_score: skillScore,
    report_html: reportHtml,
    status: "analyzed",
  }).eq("session_id", session_id);
  if (updateErr) {
    console.error("questionnaire_responses update failed:", updateErr);
    return NextResponse.json({ error: "診断結果の保存に失敗しました: " + updateErr.message }, { status: 500 });
  }

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
