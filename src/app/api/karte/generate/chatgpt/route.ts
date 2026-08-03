import { NextRequest, NextResponse } from "next/server";
import { requireTeacher } from "@/lib/apiAuth";

import { generateText, extractJson, AiUnavailableError, aiErrorPayload } from "@/lib/ai";
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
  const auth = await requireTeacher(req);
  if (auth instanceof NextResponse) return auth;
  const {
    studentName, grade, subject,
    testScore, testTotal, testPercentage,
    habitScore, methodScore,
    aiAnalysis, textbooks,
  } = await req.json();

  const textbookInfo = Array.isArray(textbooks) && textbooks.length > 0
    ? (textbooks as TextbookInput[]).map((t) =>
        `・${t.name}（${t.type}${t.publisher ? " / " + t.publisher : ""}）`
      ).join("\n")
    : "（テキスト未選択）";

  const scoreText = testPercentage != null
    ? `${testPercentage}%（${testScore}/${testTotal}点）`
    : "未入力";

  const prompt = `あなたは日本の個別指導塾の熟練教育コンサルタントです。
以下の診断結果をもとに、生徒の3ヶ月間の個別指導カルテ（学習方針書）の初稿をJSON形式で作成してください。

【生徒情報】
氏名：${studentName}
学年：${grade}
科目：${subject}

【診断結果】
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

以下のJSON形式のみで返してください（説明文不要）:
{
  "currentAnalysis": "現状分析（200字程度）",
  "roadmap": [
    {
      "month": 1,
      "goal": "1ヶ月目の目標",
      "advanceUnits": ["先取り単元1", "先取り単元2"],
      "weeklyPlan": "週次計画の詳細",
      "textbookPages": "テキストの使用ページ・範囲",
      "specialProgram": ""
    },
    {
      "month": 2,
      "goal": "2ヶ月目の目標",
      "advanceUnits": ["先取り単元"],
      "weeklyPlan": "週次計画の詳細",
      "textbookPages": "テキストの使用ページ・範囲",
      "specialProgram": "講習会・集中補講の計画"
    },
    {
      "month": 3,
      "goal": "3ヶ月目の目標",
      "advanceUnits": ["先取り単元"],
      "weeklyPlan": "週次計画の詳細",
      "textbookPages": "テキストの使用ページ・範囲",
      "specialProgram": "特訓・模擬テスト対策"
    }
  ],
  "weaknessProgram": {
    "units": ["弱点単元1", "弱点単元2"],
    "exerciseVolume": "演習量の目安",
    "schedule": "講習会/特訓スケジュール（月・回数・内容）"
  },
  "advancePlan": {
    "units": ["先取り単元リスト"],
    "pace": "ペース配分と進め方の説明"
  },
  "studyMethod": {
    "steps": ["具体的学習ステップ1", "ステップ2", "ステップ3"],
    "noteTaking": "ノート術の具体的な指導内容",
    "problemPractice": "問題演習法の具体的な指導内容"
  },
  "dailyRoutine": [
    { "day": "平日", "timeSlot": "時間帯", "content": "学習内容", "duration": "時間・量" },
    { "day": "休日", "timeSlot": "時間帯", "content": "学習内容", "duration": "時間・量" }
  ],
  "parentMessage": "保護者への温かく具体的なメッセージ（3〜4文）"
}`;

  let content: string;
  try {
    content = (await generateText({
      provider: "openai", prompt, maxTokens: 8192, json: true, feature: "vision_draft",
    })).text;
  } catch (e) {
    return NextResponse.json(aiErrorPayload(e, "vision_draft"), { status: 502 });
  }
  const draft = extractJson(content);
  if (!draft) {
    return NextResponse.json({ error: "JSONパースに失敗しました", raw: content.slice(0, 300) }, { status: 500 });
  }
  return NextResponse.json({ draft });
}
