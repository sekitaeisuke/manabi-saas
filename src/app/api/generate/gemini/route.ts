import { NextRequest, NextResponse } from "next/server";
import { requireTeacher } from "@/lib/apiAuth";
import { generateText, resolveKey } from "@/lib/ai";

// テスト作成AIパイプラインの第2段階「推敲」。
// ChatGPTが作った問題ドラフト(questions)を Gemini が校閲・改善し、改善後の questions を返す。
// この後、第3段階 Claude が最終チェック＋HTML化を行う。
//
// この段は「あると品質が上がる」オプション。Googleのキーが無い塾では黙って省略し、
// 下書きをそのまま次の段へ渡す（3社そろわないと動かない機能を作らないため）。
async function callGemini(prompt: string): Promise<string> {
  const { text } = await generateText({
    provider: "google", prompt, maxTokens: 8192, temperature: 0.4, json: true,
    feature: "test_refine",
  });
  return text;
}

export async function POST(req: NextRequest) {
  const auth = await requireTeacher(req);
  if (auth instanceof NextResponse) return auth;
  const { questions, subject, grade, title, testType, instructions } = await req.json();

  if (!Array.isArray(questions) || questions.length === 0) {
    return NextResponse.json({ error: "推敲対象の問題がありません（先に作成を実行してください）" }, { status: 400 });
  }

  // Googleのキーが無ければ推敲を飛ばす。呼び出し側は d2.questions ?? d1.questions で受けている。
  if (!(await resolveKey("google"))) {
    return NextResponse.json({
      questions,
      skipped: true,
      note: "Gemini（Google）のキーが未設定のため、推敲の段を省略しました。",
    });
  }

  const typeLabel = testType === "diagnostic"
    ? "学力学習習慣診断分析多層型テスト"
    : "授業確認テスト（報告書用）";

  const prompt = `あなたは日本の学習塾の問題校閲のプロです。以下の「${typeLabel}」の問題ドラフト(JSON)を「第2段階の推敲」として点検・改善してください。

【テスト情報】テスト名: ${title} ／ 主要学年: ${grade} ／ 科目: ${subject}

【推敲の方針】
・事実誤り・答えの不整合・あいまいな設問を直す
・${grade}の${subject}として難易度・語彙・表記・単位が適切かを点検し改善する
・選択肢の重複や不適切な選択肢を修正し、正答が1つに確定するようにする
・問題数・出題意図・各問の役割は維持する（水増し・削減はしない）
・**JSONの構造・フィールド名・型は入力と同一に保つ**（新しいキーを足さない）
・追加指示: ${instructions || "（なし）"}

【入力（問題ドラフトJSON）】
${JSON.stringify(questions)}

【出力】必ず次の形の JSON のみを返す（前後に文章やコードフェンスを付けない）:
{"questions": [ ...改善後の問題配列（入力と同じ構造） ]}`;

  try {
    let text = await callGemini(prompt);
    // 念のためコードフェンス除去
    text = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
    const parsed = JSON.parse(text);
    const improved = Array.isArray(parsed.questions) && parsed.questions.length > 0 ? parsed.questions : questions;
    return NextResponse.json({ questions: improved });
  } catch (e) {
    return NextResponse.json({ error: "Gemini（推敲）エラー: " + String(e) }, { status: 500 });
  }
}
