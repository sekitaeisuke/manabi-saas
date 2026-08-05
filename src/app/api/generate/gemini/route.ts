import { NextRequest, NextResponse } from "next/server";
import { requireTeacher } from "@/lib/apiAuth";
import { generateText, resolveKey, extractJson } from "@/lib/ai";
import { normalizeQuestionMath } from "@/lib/mathText";

export const maxDuration = 60;

// テスト作成AIパイプラインの第2段階「推敲」。
// ChatGPTが作った問題ドラフト(questions)を Gemini が校閲・改善し、改善後の questions を返す。
// この後、第3段階 Claude が最終チェック＋HTML化を行う。
//
// この段は「あると品質が上がる」オプション。Googleのキーが無い塾では黙って省略し、
// 下書きをそのまま次の段へ渡す（3社そろわないと動かない機能を作らないため）。
//
// 問題数が多いと1回の応答に収まらず、途中で切れて問題が消える。そのため10問ずつに分けて推敲し、
// 失敗した束・数が合わない束は「元の問題をそのまま通す」。推敲でテストが減らないことを最優先する。

const CHUNK = 10;
const DEADLINE_MS = 45_000;

type Q = { text?: string; [k: string]: unknown };

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

  const chunks: Q[][] = [];
  for (let i = 0; i < questions.length; i += CHUNK) chunks.push((questions as Q[]).slice(i, i + CHUNK));

  const startedAt = Date.now();
  const result: Q[] = [];
  let refined = 0;
  let failed = 0;

  for (const chunk of chunks) {
    if (Date.now() - startedAt > DEADLINE_MS) {
      // 時間切れ。残りは推敲せずそのまま通す（問題を落とさない）
      result.push(...chunk);
      continue;
    }
    const prompt = `あなたは日本の学習塾の問題校閲のプロです。以下の「${typeLabel}」の問題(JSON)を「第2段階の推敲」として点検・改善してください。

【テスト情報】テスト名: ${title} ／ 主要学年: ${grade} ／ 科目: ${subject}

【推敲の方針】
・事実誤り・答えの不整合・あいまいな設問を直す
・${grade}の${subject}として難易度・語彙・表記・単位が適切かを点検し改善する
・選択肢の重複や不適切な選択肢を修正し、正答が1つに確定するようにする
・**問題数は必ず入力と同じ${chunk.length}問。増やすことも減らすこともしない**
・**JSONの構造・フィールド名・型・並び順は入力と同一に保つ**（新しいキーを足さない・id を変えない）
・数式はそのまま文字として表示されます。**HTMLタグ（<sup>等）もLaTeX（$…$、\\frac、^{}）も使わない**。
　累乗は x²、添字は a₁、分数は 3/4、平方根は √2 のように上付き・下付きのUnicode文字で書く
・追加指示: ${instructions || "（なし）"}

【入力（問題JSON・${chunk.length}問）】
${JSON.stringify(chunk)}

【出力】必ず次の形の JSON のみを返す（前後に文章やコードフェンスを付けない）:
{"questions": [ ...改善後の${chunk.length}問（入力と同じ構造・同じ順序） ]}`;

    try {
      const { text } = await generateText({
        provider: "google", prompt, maxTokens: 8192, temperature: 0.4, json: true,
        feature: "test_refine",
      });
      const parsed = extractJson<{ questions?: Q[] }>(text);
      const improved = parsed?.questions;
      // 数が合わない＝どこかが欠けている。そのときは元をそのまま使う
      if (Array.isArray(improved) && improved.length === chunk.length) {
        result.push(...improved.map((q, i) => normalizeQuestionMath({ ...chunk[i], ...q })));
        refined += chunk.length;
      } else {
        result.push(...chunk);
        failed += chunk.length;
      }
    } catch {
      // 推敲は品質向上のための任意の段。失敗しても下書きをそのまま次へ渡し、作成を止めない
      result.push(...chunk);
      failed += chunk.length;
    }
  }

  return NextResponse.json({
    questions: result,
    refined,
    ...(failed > 0
      ? { warning: `${failed}問は推敲を省略し、下書きのまま次へ進みました（AIの応答が得られなかったため）。` }
      : {}),
  });
}
