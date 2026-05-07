import { NextRequest, NextResponse } from "next/server";
import type { VolumeRatings, QualityRatings } from "@/lib/supabase";

const RATING_LABEL: Record<number, string> = { 4: "◎", 3: "○", 2: "△", 1: "×" };

function ratingText(r: number) {
  return `${RATING_LABEL[r]}（${r === 4 ? "十分できている" : r === 3 ? "ほぼできている" : r === 2 ? "あまりできていない" : "ほとんどできていない"}）`;
}

function score(ratings: number[], max: number) {
  return Math.round((ratings.reduce((a, b) => a + b, 0) / max) * 100);
}

export async function POST(req: NextRequest) {
  const {
    studentName, grade, subject,
    testScore, testTotal, testRate,
    weakUnits, difficultyResults,
    volumeRatings, qualityRatings,
    previousDiagnoses,
  }: {
    studentName: string;
    grade: string;
    subject: string;
    testScore: number | null;
    testTotal: number | null;
    testRate: number | null;
    weakUnits: string[];
    difficultyResults: { basic: { score: number; total: number }; standard: { score: number; total: number }; advanced: { score: number; total: number } } | null;
    volumeRatings: VolumeRatings;
    qualityRatings: QualityRatings;
    previousDiagnoses: { created_at: string; volume_score: number; quality_score: number }[];
  } = await req.json();

  const vr = volumeRatings;
  const qr = qualityRatings;
  const volumeScore = score(Object.values(vr), 20);
  const qualityScore = score(Object.values(qr), 48);
  const readScore = score([qr.read_problem, qr.read_solution, qr.read_example], 12);
  const writeScore = score([qr.write_steps, qr.write_notes, qr.write_vocab], 12);
  const listenScore = score([qr.listen_teacher, qr.listen_test_info, qr.listen_until_understand], 12);
  const speakScore = score([qr.speak_error, qr.speak_resolving, qr.speak_balance], 12);

  const prevSummary = previousDiagnoses.length > 0
    ? previousDiagnoses.slice(-3).map((d) =>
        `${d.created_at.slice(0, 10)}：学習量${d.volume_score}点 学習の質${d.quality_score}点`
      ).join("\n")
    : "（初回診断）";

  const diffSummary = difficultyResults
    ? [
        `基礎：${difficultyResults.basic.score}/${difficultyResults.basic.total}点（${Math.round(difficultyResults.basic.score / Math.max(difficultyResults.basic.total, 1) * 100)}%）`,
        `標準：${difficultyResults.standard.score}/${difficultyResults.standard.total}点（${Math.round(difficultyResults.standard.score / Math.max(difficultyResults.standard.total, 1) * 100)}%）`,
        `応用：${difficultyResults.advanced.score}/${difficultyResults.advanced.total}点（${Math.round(difficultyResults.advanced.score / Math.max(difficultyResults.advanced.total, 1) * 100)}%）`,
      ].join("\n")
    : "（テストデータなし）";

  const prompt = `あなたは日本の学習塾の教育分析の専門家です。
以下のデータをもとに「学力・学習法・学習習慣 多層診断レポート」を作成してください。

━━━━━━━━━━━━━━━━━━━━
【生徒情報】
氏名: ${studentName}　学年: ${grade}　科目: ${subject}

【テスト結果（学力診断）】
合計得点: ${testScore ?? "未実施"}/${testTotal ?? "-"}点（正答率 ${testRate ?? "-"}%）
${diffSummary}
苦手単元・間違えた問題: ${weakUnits.length > 0 ? weakUnits.join("、") : "なし"}

【過去の診断推移】
${prevSummary}

━━━━━━━━━━━━━━━━━━━━
【学習量（生産性）評価】
① 一日の学習量達成: ${ratingText(vr.daily_completion)}
② スケジュール遵守: ${ratingText(vr.schedule_adherence)}
③ 暗記暗算・基礎学力: ${ratingText(vr.basic_fluency)}
④ 苦手単元への取り組み: ${ratingText(vr.weak_unit)}
⑤ 演習量: ${ratingText(vr.practice_volume)}
→ 学習量スコア: ${volumeScore}/100点

【学習の質（効率性）評価】
■ 読む（${readScore}/100）
　・問題の理解: ${ratingText(qr.read_problem)}
　・解答解説の理解: ${ratingText(qr.read_solution)}
　・例題読解: ${ratingText(qr.read_example)}

■ 書く（${writeScore}/100）
　・途中式: ${ratingText(qr.write_steps)}
　・ノート: ${ratingText(qr.write_notes)}
　・語彙記録: ${ratingText(qr.write_vocab)}

■ 聞く（${listenScore}/100）
　・先生への質問相談: ${ratingText(qr.listen_teacher)}
　・テスト情報収集: ${ratingText(qr.listen_test_info)}
　・理解するまで聞く: ${ratingText(qr.listen_until_understand)}

■ 話す（${speakScore}/100）
　・誤答原因の説明: ${ratingText(qr.speak_error)}
　・解きなおしの説明: ${ratingText(qr.speak_resolving)}
　・教科バランスの説明: ${ratingText(qr.speak_balance)}
→ 学習の質スコア: ${qualityScore}/100点
━━━━━━━━━━━━━━━━━━━━

【レポート作成指示】
A4用紙1〜2枚に収まるHTMLで、以下の構成でレポートを作成してください。

1. 総合診断サマリー（学力・学習量・学習の質の3軸評価、100字程度）
2. 学力診断（テスト結果から読み取れる学力レベル・苦手単元の分析）
3. 学習量診断（5項目の評価から生産性・継続力を分析）
4. 学習の質診断（読む・書く・聞く・話すの4領域を分析）
5. 最優先改善ポイント（3項目、具体的なアクション付き）
6. 今後の学習方針（具体的・実践的に）
7. 保護者へのメッセージ（温かく丁寧に、200字程度）

【HTML作成ルール】
- <div id="diagnosis-report">〜</div> で返す
- A4印刷を想定した構成（@media printで改ページ制御）
- スコアは色分けで視覚化（80以上=緑、60-79=青、40-59=黄、40未満=赤）
- 表やボックスを使って見やすくする
- LaTeX記法は使わない

HTMLのみを返してください（説明文・JSONは不要）。`;

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
    return NextResponse.json({ error: `Claude APIエラー: ${err.error?.message ?? res.status}` }, { status: 500 });
  }

  const data = await res.json();
  const reportHtml = data.content?.[0]?.text ?? "";

  return NextResponse.json({
    reportHtml,
    volumeScore,
    qualityScore,
    readScore,
    writeScore,
    listenScore,
    speakScore,
  });
}
