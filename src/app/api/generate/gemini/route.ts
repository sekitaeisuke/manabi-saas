import { NextRequest, NextResponse } from "next/server";

// ─── 正答位置の強制均等分散 ─────────────────────────────
type AnyQuestion = { type: string; options?: string[] | null; correct_answer?: string | null } & Record<string, unknown>;

function redistributeAnswers(questions: AnyQuestion[]): AnyQuestion[] {
  // 四択問題だけを対象
  const mcIdxs = questions.reduce<number[]>((acc, q, i) => {
    if (q.type === "multiple-choice" && Array.isArray(q.options) && (q.options?.length ?? 0) >= 2) acc.push(i);
    return acc;
  }, []);
  if (mcIdxs.length === 0) return questions;

  const n = mcIdxs.length;
  // 均等ターゲット配列: [0,1,2,3, 0,1,2,3, …] を作ってシャッフル
  const targets = Array.from({ length: n }, (_, i) => i % 4);
  for (let i = targets.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [targets[i], targets[j]] = [targets[j], targets[i]];
  }

  const result = [...questions];
  mcIdxs.forEach((qIdx, t) => {
    const q = result[qIdx];
    const opts = [...(q.options as string[])];
    const correct = q.correct_answer as string | null;
    if (!correct) return;
    const curPos = opts.indexOf(correct);
    const tgtPos = targets[t];
    if (curPos === -1 || curPos === tgtPos) return;
    // correct_answer の位置を tgtPos に移動（swap）
    [opts[curPos], opts[tgtPos]] = [opts[tgtPos], opts[curPos]];
    result[qIdx] = { ...q, options: opts };
    // correct_answer はテキスト値のため変更不要
  });
  return result;
}

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
- 【重要】四択問題の正答位置（A・B・C・D）が特定の選択肢に偏っていないか確認し、均等になるよう選択肢の並び順を入れ替えること
- 学習指導要領との整合性
- 問題数が少ない場合は同じ難易度の問題を追加して30問以上にすること

【追加指示】
${instructions || "なし"}

改善した問題データのみをJSON形式で返してください（説明文不要）:
{"questions": [...]}`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          maxOutputTokens: 65536,
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
    const raw: AnyQuestion[] = parsed.questions ?? parsed;
    // 正答位置を均等に再配置してから返す
    const balanced = redistributeAnswers(raw);
    return NextResponse.json({ questions: balanced });
  } catch {
    return NextResponse.json({ error: "JSONパースに失敗しました", raw: content.slice(0, 300) }, { status: 500 });
  }
}
