import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { draft, studentName, grade, subject } = await req.json();

  const prompt = `あなたは日本の個別指導塾のベテラン教師です。
以下の${grade}・${subject}のカルテ初稿を見直し、内容をより具体的・実践的に改善してください。

【生徒情報】
氏名：${studentName}
学年：${grade}
科目：${subject}

【カルテ初稿（JSON）】
${JSON.stringify(draft, null, 2)}

【改善ポイント】
- 現状分析：診断スコアを踏まえた具体的な課題の記述（曖昧な表現を避ける）
- ロードマップ：各月の目標・先取り単元・週次計画を明確・具体的に（教科書単元名を明記）
- 弱点克服プログラム：単元名・演習量・スケジュールを実行可能な内容に
- 先取り計画：${subject}の学習指導要領に沿った適切な先取り単元
- 学習法：${subject}に特化した実践的なステップ・ノート術・演習法
- 毎日のルーティン：曜日・時間・内容・量が具体的で実行しやすいか
- 保護者メッセージ：温かく励ます内容・具体的なサポート依頼を含む

改善したカルテデータのみをJSON形式で返してください（説明文不要）。
入力と同じJSON構造を維持してください。`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          maxOutputTokens: 8192,
        },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return NextResponse.json(
      { error: `Gemini APIエラー: ${err.error?.message ?? `HTTP ${res.status}`}` },
      { status: 500 }
    );
  }

  const data = await res.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) {
    return NextResponse.json({ error: "応答が空です" }, { status: 500 });
  }

  try {
    const refined = JSON.parse(content);
    return NextResponse.json({ refined });
  } catch {
    return NextResponse.json({ error: "JSONパースに失敗しました", raw: content.slice(0, 300) }, { status: 500 });
  }
}
