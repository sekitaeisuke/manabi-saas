import { NextRequest, NextResponse } from "next/server";

type TextbookInput = {
  id: string;
  name: string;
  subject: string;
  grade: string;
  publisher: string | null;
  description: string | null;
  type: string;
};

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    studentName, grade, subject,
    testScore, testTotal, testPercentage,
    habitScore, methodScore,
    aiAnalysis, textbooks,
    refined,  // from 3-step pipeline
  } = body;

  const scoreText = testPercentage != null
    ? `${testPercentage}%（${testScore}/${testTotal}点）`
    : "未入力";

  let prompt: string;

  if (refined) {
    // 3-step pipeline: format refined JSON as HTML
    prompt = `あなたは日本の個別指導塾の教育コンサルタントです。
以下の生徒カルテデータ（JSON）を、読みやすく美しいHTML形式に変換してください。

【生徒情報】
氏名：${studentName}
学年：${grade}
科目：${subject}
テスト正答率：${scoreText}
学習習慣スコア：${habitScore != null ? `${habitScore}/100` : "未入力"}
学習法スコア：${methodScore != null ? `${methodScore}/100` : "未入力"}

【カルテデータ（JSON）】
${JSON.stringify(refined, null, 2)}

【HTML変換ルール】
- 最外側を <div id="learning-plan"> で囲む
- マークダウン（\`\`\`など）は使わずHTMLのみ返す
- 各セクションは <h2> で区切る
- 表形式のデータは <table> を活用する
- リストは <ul>/<ol> を活用する
- 3ヶ月ロードマップは月ごとに <h3> で区切る

【構成】
①【現状分析】— currentAnalysis の内容
②【3ヶ月学習ロードマップ】— roadmap の各月（目標・先取り単元・週次計画・テキスト・特別プログラム）
③【弱点克服プログラム】— weaknessProgram の内容
④【先取り学習計画】— advancePlan の内容
⑤【推奨学習法】— studyMethod の内容（ステップ・ノート術・演習法）
⑥【毎日の学習ルーティン】— dailyRoutine を表形式で
⑦【保護者へのメッセージ】— parentMessage の内容`;
  } else {
    // standalone mode (direct generation without pipeline)
    const textbookInfo = Array.isArray(textbooks) && textbooks.length > 0
      ? (textbooks as TextbookInput[]).map((t) =>
          `・${t.name}（${t.type}${t.publisher ? " / " + t.publisher : ""}）${t.description ? " — " + t.description : ""}`
        ).join("\n")
      : "（テキスト未選択）";

    prompt = `あなたは日本の学習塾（個別指導）の熟練した教育コンサルタントです。
以下の診断テスト結果をもとに、生徒の3ヶ月間の個別指導カルテ（学習方針書）をHTML形式で作成してください。

【生徒情報】
氏名：${studentName}
学年：${grade}
科目：${subject}

【診断結果サマリー】
テスト正答率：${scoreText}
学習習慣スコア：${habitScore != null ? `${habitScore}/100` : "未入力"}
学習法スコア：${methodScore != null ? `${methodScore}/100` : "未入力"}
${aiAnalysis ? `\nAI診断分析：\n${aiAnalysis}` : ""}

【使用テキスト・教材】
${textbookInfo}

【本塾の指導方針（必ず全て反映すること）】
1. 先取り学習：現学年カリキュラムを先行して学習し、学校授業を完全に理解させる
2. 弱点克服：診断で検出した弱点単元を講習会・特訓（集中補講）で確実に補強する
3. 学習習慣確立：毎日継続的に取り組む学習ルーティンを定着させる
4. 学習法改善：${subject}に最適化された効果的な学習法を具体的に指導する

以下の構成でHTMLを作成してください。
- 最外側を <div id="learning-plan"> で囲む
- マークダウン（\`\`\`など）は使わずHTMLのみ返す
- 各セクションは <h2> で区切る
- 必要に応じて <table>・<ul>・<ol> を活用する

【構成】
①【現状分析】診断結果の解釈と主な課題（200字程度）
②【3ヶ月学習ロードマップ】
  - 1ヶ月目：目標・先取り単元・週次計画（テキストのページ数も明示）
  - 2ヶ月目：目標・先取り単元・講習会・集中補講計画
  - 3ヶ月目：目標・先取り単元・特訓・模擬テスト対策
③【弱点克服プログラム】具体的な単元名・演習量・講習会/特訓スケジュール
④【先取り学習計画】${subject}の先取り単元リストと進め方・ペース配分
⑤【推奨学習法】${subject}に特化した具体的な学習ステップ（ノート術・問題演習法など）
⑥【毎日の学習ルーティン】時間帯・内容・分量の具体的な提案（曜日別または平日/休日で示す）
⑦【保護者へのメッセージ】温かく・具体的に・励ましの内容（3〜4文）`;
  }

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
    const errText = await res.text();
    return NextResponse.json({ error: "AI生成に失敗しました", raw: errText.slice(0, 200) }, { status: 500 });
  }

  const data = await res.json();
  let planHtml = (data.content?.[0]?.text ?? "").trim();

  if (planHtml.startsWith("```html")) planHtml = planHtml.slice(7);
  else if (planHtml.startsWith("```")) planHtml = planHtml.slice(3);
  if (planHtml.endsWith("```")) planHtml = planHtml.slice(0, -3);
  planHtml = planHtml.trim();

  const match = planHtml.match(/<div id="learning-plan">[\s\S]*<\/div>/);
  if (match) planHtml = match[0];

  return NextResponse.json({ planHtml });
}
