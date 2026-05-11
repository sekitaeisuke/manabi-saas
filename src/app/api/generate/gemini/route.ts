import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { questions, subject, grade, difficulties, instructions } = await req.json();

  const diffLabels = (difficulties as string[]).map((d: string) => ({
    basic: "基礎", standard: "標準", advanced: "応用",
  }[d] ?? d)).join("・");

  const prompt = `あなたは日本の学習塾のベテラン教師です。
以下の${grade}の${subject}テスト（${diffLabels}）の問題データを見直し、改善してください。

【現在の問題データ】
${JSON.stringify(questions, null, 2)}

【改善ポイント】
- 問題文の明確さ・わかりやすさ・日本語の正確さ
- 難易度区分が正しく守られているか
  - basic（基礎）：計算・語彙・知識・英文法・漢字のみ（利用問題を含めない）
  - standard（標準）：基礎問題70%＋利用問題30%（英作文含む）
  - advanced（応用）：全問が利用問題・思考力問題・記述問題
- 配点のバランス（全問合計が100点になるよう調整）
- 選択肢の適切さ（正答が明確、紛らわしい選択肢の改善）
- 学習指導要領との整合性
- 問題数が少ない場合は同じ難易度の問題を追加して30問以上にすること

【追加指示】
${instructions || "なし"}

改善した問題データのみをJSON形式で返してください（説明文不要）:
{"questions": [...]}`;

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
    const parsed = JSON.parse(content);
    return NextResponse.json({ questions: parsed.questions ?? parsed });
  } catch {
    return NextResponse.json({ error: "JSONパースに失敗しました", raw: content.slice(0, 300) }, { status: 500 });
  }
}
