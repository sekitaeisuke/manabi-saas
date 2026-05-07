import { NextRequest, NextResponse } from "next/server";

async function callClaude(prompt: string, maxTokens = 4096): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message ?? `HTTP ${res.status}`);
  }

  const data = await res.json();
  return data.content?.[0]?.text ?? "";
}

export async function POST(req: NextRequest) {
  const { questions, subject, grade, title, testType, instructions } = await req.json();

  const typeLabel = testType === "diagnostic"
    ? "学力学習習慣診断分析多層型テスト"
    : "授業確認テスト（報告書用）";

  // ── Step A: questionsの最終チェック ──
  const questionsPrompt = `あなたは日本の教育専門家です。
以下の「${title}」（${grade}・${subject}・${typeLabel}）の問題データを最終チェックして仕上げてください。

【問題データ】
${JSON.stringify(questions, null, 2)}

【最終調整項目】
- 問題文の表現統一・丁寧さ・誤字脱字チェック
- 配点の最終調整（全問合計が100点になるよう揃える）
- 難易度区分の確認（basic=基礎・standard=標準・advanced=応用）
- sectionフィールドが日本語（基礎・標準・応用）になっているか
- 日本の学習指導要領との整合性

【追加指示】
${instructions || "なし"}

{"questions": [...]} の形式のJSONのみで返してください（説明文不要）。`;

  let finalQuestions: object[];
  try {
    const qText = await callClaude(questionsPrompt, 4096);
    const match = qText.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("JSONが見つかりません: " + qText.slice(0, 200));
    const parsed = JSON.parse(match[0]);
    finalQuestions = parsed.questions ?? parsed;
  } catch (e) {
    return NextResponse.json({ error: "Claude（問題チェック）エラー: " + String(e) }, { status: 500 });
  }

  // ── Step B: HTMLテストの生成 ──
  const htmlPrompt = `あなたは日本の教育専門家です。
以下の問題データをもとに「${title}」（${grade}・${subject}・${typeLabel}）のHTMLテストを作成してください。

【問題データ】
${JSON.stringify(finalQuestions, null, 2)}

【HTML作成ルール】
- <div id="test-body">〜</div> の形式で返す（html/bodyタグは不要）
- テスト先頭に：テスト名・学年・科目・日付欄・氏名欄・合計点欄を入れる
- 難易度ごとに見出し（h2）でセクションを区切る（基礎・標準・応用）
- 各問題に問題番号・難易度・配点を明記する
- 解答欄は <div class="answer-box"></div> で示す
- 図・表が必要な場合はHTMLタグ（table/figure等）を使う
- 選択肢式は番号付きリストで表示する

【数式の表記ルール（文字化け防止）】
- LaTeX記法（$...$や\frac等）は絶対に使用しない
- 累乗: x<sup>2</sup>、a<sup>3</sup>
- 分数: <sup>1</sup>/<sub>2</sub>（HTMLタグで表現）
- 平方根: √2、√3（Unicode文字）
- 数学記号: ×、÷、±、≤、≥、≠（Unicode文字）
- 方程式: 2x + 3 = 7 のように半角英数字と記号で記述
- 計算問題の解答欄には必ず「半角数字で答えなさい」と明記する

HTMLのみを返してください（JSONや説明文は不要）。`;

  let finalHtml: string;
  try {
    const htmlText = await callClaude(htmlPrompt, 8192);
    const match = htmlText.match(/<div[\s\S]*<\/div>/);
    finalHtml = match ? match[0] : htmlText;
  } catch (e) {
    return NextResponse.json({ error: "Claude（HTML生成）エラー: " + String(e) }, { status: 500 });
  }

  return NextResponse.json({ html: finalHtml, questions: finalQuestions });
}
