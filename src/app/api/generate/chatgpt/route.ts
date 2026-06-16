import { NextRequest, NextResponse } from "next/server";
import { requireTeacher } from "@/lib/apiAuth";

export async function POST(req: NextRequest) {
  const auth = await requireTeacher(req);
  if (auth instanceof NextResponse) return auth;
  const {
    testType, title, subject, grade,
    selectedUnits, difficulties, count,
    instructions,
  } = await req.json();

  const typeLabel = testType === "diagnostic"
    ? "学力学習習慣診断分析多層型テスト"
    : "授業確認テスト（報告書用）";

  const unitList = (selectedUnits as { grade: string; unit: string }[])
    .map((u) => `・${u.grade}「${u.unit}」`)
    .join("\n");

  const difficultyGuide = (difficulties as string[]).map((d) => {
    if (d === "basic") return "【基礎】基礎計算・基礎語彙・基礎知識・基礎英文法・基礎漢字を中心に出題（100%基礎問題）";
    if (d === "standard") return "【標準】基礎問題70%＋利用問題・英作文など30%を混在させる";
    if (d === "advanced") return "【応用】すべて利用問題・思考力問題・記述問題で構成";
    return "";
  }).join("\n");

  const prompt = `あなたは日本の学習塾の問題作成の専門家です。
以下の条件で「${typeLabel}」を作成してください。

【テスト情報】
テスト名: ${title}
主要学年: ${grade}　科目: ${subject}
問題数（合計）: 必ず${count}問以上作成すること（少なくとも20問以上）

【出題単元】
${unitList}

【難易度区分と出題方針】
${difficultyGuide}

【追加指示】
${instructions || "なし"}

【選択肢の正答位置バランス（必須）】
- 四択問題全体で、正解が A・B・C・D にほぼ均等に分散するようにすること
- 例：12問の四択 → A正解3問・B正解3問・C正解3問・D正解3問
- 正解が特定の選択肢（特にA・1番目）に偏らないよう意図的に分散させること
- correct_answer には必ず options の中の実際のテキストをそのままセットすること

【重要な出力規則】
- 難易度ごとにセクションを分けてHTMLで作成する
- 図・表が必要な場合はHTMLタグ（table/figureなど）を使う
- 解答欄は各問題の下に罫線（<div class="answer-box">）で示す
- 配点は各問題に明記する
- HTMLは<div id="test-body">〜</div>の形式で返す（html/body タグは不要）
- questionsは各問題を配列で返す（採点・分析用）

【数式の表記ルール（文字化け防止）】
- LaTeX記法（$...$や\frac等）は絶対に使用しない
- 累乗: x<sup>2</sup>、a<sup>3</sup>
- 分数: <sup>1</sup>/<sub>2</sub>（HTMLタグで表現）
- 平方根: √2、√3（Unicode文字を使う）
- 数学記号: ×、÷、±、≤、≥、≠、∞（Unicode文字を使う）
- 方程式: 2x + 3 = 7 のように半角英数字と記号で表現
- 解答欄の指定: 必ず「半角数字で答えなさい」と明記する（特に計算問題）

以下のJSON形式のみで返してください（説明文不要）:
{
  "html": "<div id=\\"test-body\\">...完全なHTMLテスト...</div>",
  "questions": [
    {
      "id": "q1",
      "difficulty": "basic",
      "section": "基礎",
      "text": "問題文（プレーンテキスト）",
      "type": "multiple-choice",
      "options": ["A","B","C","D"],
      "correct_answer": "A",
      "points": 5
    }
  ]
}

typeは "multiple-choice"（選択肢式）"short-answer"（短答式）"descriptive"（記述式）のいずれか。
JSONのみを返してください。`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      max_tokens: 8192,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    return NextResponse.json(
      { error: errBody?.error?.message ?? `OpenAI error ${res.status}` },
      { status: 500 }
    );
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) return NextResponse.json({ error: "生成に失敗しました" }, { status: 500 });
  try {
    return NextResponse.json(JSON.parse(content));
  } catch {
    return NextResponse.json({ error: "生成結果のJSON解析に失敗しました" }, { status: 500 });
  }
}
