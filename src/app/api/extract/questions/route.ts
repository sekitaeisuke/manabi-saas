import { NextRequest, NextResponse } from "next/server";
import { requireTeacher } from "@/lib/apiAuth";

import {
  generateText, extractJson, aiErrorPayload,
  SUPPORTED_IMAGE_TYPES, type Attachment,
} from "@/lib/ai";
import { mathText } from "@/lib/mathText";

export const maxDuration = 60;

// 塾のプリント・問題集を撮った写真やPDFから、写っている問題を**そのまま書き起こす**。
//
// ここでは類似問題を作らない。読み取るだけ。理由は、読み間違い（6とb、x²とx2、分数の上下、
// 選択肢の取り違え）をそのまま類題に流すと、間違いに気づく機会が無くなるため。
// 読み取った原題は画面で講師に見せ、直してもらってから類題を作る段へ渡す。
//
// 原本（写真・PDF）は保存しない。読み取ったら捨てる。
// 市販教材の写真がサーバに溜まる状態を作らないため。

/** 1回で受け取る添付の上限。Vercelのリクエスト本体は4.5MBまで */
const MAX_FILES = 6;
const MAX_TOTAL_BYTES = 4 * 1024 * 1024;

export type ExtractedQuestion = {
  /** 写っていた設問（書き起こし） */
  text: string;
  /** 写っていた選択肢。選択式でなければ null */
  options: string[] | null;
  /** 読み取れた正解。書いていなければ空 */
  correct_answer: string;
  /**
   * 図・グラフ・表に**言及している、またはそれが無いと解けない**問題か。
   * 「右の図のように」と書いてあるだけで計算自体は図なしでも解ける問題も true にする。
   * そのまま類題を作ると「右の図のように」だけが残り、図のない壊れた問題になるため。
   */
  needs_figure: boolean;
  /** 見てとれた単元（自由記述） */
  unit_guess: string;
  /** 見てとれた難度 */
  difficulty_guess: "basic" | "standard" | "advanced";
  /** 読み取りに自信が無いところ。空なら問題なし */
  note: string;
};

export async function POST(req: NextRequest) {
  const auth = await requireTeacher(req);
  if (auth instanceof NextResponse) return auth;
  const { files, subject, grade } = await req.json();

  const list = Array.isArray(files) ? (files as Attachment[]) : [];
  if (list.length === 0) {
    return NextResponse.json({ error: "写真またはPDFを選んでください" }, { status: 400 });
  }
  if (list.length > MAX_FILES) {
    return NextResponse.json(
      { error: `一度に読み取れるのは${MAX_FILES}枚までです` }, { status: 400 },
    );
  }

  const attachments: Attachment[] = [];
  let total = 0;
  for (const f of list) {
    if (!f?.data || typeof f.data !== "string") continue;
    const ok = f.mediaType === "application/pdf" || SUPPORTED_IMAGE_TYPES.includes(f.mediaType);
    if (!ok) {
      return NextResponse.json(
        { error: `${f.name ?? "このファイル"}は読み取れない形式です（JPEG・PNG・PDFに対応しています）` },
        { status: 400 },
      );
    }
    total += Math.ceil((f.data.length * 3) / 4);
    attachments.push({ mediaType: f.mediaType, data: f.data, name: f.name });
  }
  if (total > MAX_TOTAL_BYTES) {
    return NextResponse.json(
      { error: "ファイルが大きすぎます。枚数を減らすか、写真を小さくしてお試しください" },
      { status: 413 },
    );
  }

  const subjectText = subject ? `科目は「${subject}」、` : "";
  const gradeText = grade ? `対象は${grade}です。` : "";

  const prompt = `あなたは日本の学習塾の教材を読み取る担当です。
添付した画像・PDFは、塾のプリントや問題集のページです。${subjectText}${gradeText}

【やること】
写っている問題を**そのまま書き起こして**ください。**新しい問題を作らないでください。**
読み取れない字は推測で埋めず、note にその旨を書いてください。

【1問ずつ、次を拾ってください】
- text … 設問の文（写っているとおり）。問題番号（1. や (3) など）は含めない
- options … 選択肢（ア・イ・ウ・エ や ①②③④）が書かれていれば、**記号を除いた本文だけ**を
  配列にする。text の中に選択肢を混ぜないこと。選択式でなければ null
- correct_answer … 解答が誌面に書かれていればその文字列。書かれていなければ空文字
- needs_figure … 次のどちらかに当てはまれば **true**。
  　(a) 図・グラフ・表・地図・写真・数直線が無いと解けない
  　(b) **図に言及している**（「右の図のように」「下の表から」「次のグラフを見て」など）。
  　　　計算自体は図が無くても解ける場合でも、言及していれば true にすること。
  文字だけで完結し、図にも一切ふれていない問題だけ false。
- unit_guess … どの単元か（例「一次方程式」「不定詞」「化学変化と原子・分子」）
- difficulty_guess … "basic"（基礎・一問一答・計算練習）／"standard"（標準）／"advanced"（応用・思考）
- note … かすれ・見切れ・手書きなどで読み取りに自信が無いところ。無ければ空文字

【本文（国語の読解など）が写っている場合】
本文そのものは書き起こさないでください。代わりに、設問の text の先頭に
「（本文つき）」と付け、note に本文の題材と長さの目安を書いてください。

【数式・記号の書き方（そのまま文字として表示されます）】
- **HTMLタグもLaTeX（$…$、\\frac、^{}）も使わない**
- 累乗は x²、a³ ／ 添字は a₁ ／ 分数は 3/4 ／ 平方根は √2 ／ 記号は ×÷±≤≥≠π°∠△

【出力】次の形のJSONのみ（説明文・コードフェンス不要）:
{"questions": [
  {"text":"…","options":["…","…","…","…"],"correct_answer":"","needs_figure":false,
   "unit_guess":"…","difficulty_guess":"basic","note":""}
]}
写っている問題が1問も無ければ {"questions": []} を返してください。`;

  let raw: string;
  let solver = "";
  try {
    const res = await generateText({
      prompt, attachments, maxTokens: 8192, temperature: 0, json: true,
      feature: "test_extract",
      // 写真の読み取りだけ別のモデルにしたいときは、環境変数 AI_EXTRACT_MODEL に
      // モデル名を入れる（例 claude-opus-5）。他の機能のモデルは変わらない。
      // 未設定なら通常のモデルを使う。手元の検証では、傾き・影のあるプリントでも
      // 通常のモデルで読み取れている（新しいモデルにしても結果は同じだった）。
      model: process.env.AI_EXTRACT_MODEL || undefined,
    });
    raw = res.text;
    solver = res.provider;
  } catch (e) {
    return NextResponse.json(aiErrorPayload(e, "test_extract"), { status: 502 });
  }

  const parsed = extractJson<{ questions?: Partial<ExtractedQuestion>[] }>(raw);
  const got = Array.isArray(parsed?.questions) ? parsed!.questions! : [];

  const questions: ExtractedQuestion[] = [];
  for (const q of got) {
    const text = mathText(q?.text ?? "");
    if (!text.trim()) continue;
    questions.push({
      text,
      options: Array.isArray(q?.options) && q.options.length > 0
        ? q.options.map((o) => mathText(o)).filter((o) => o.trim())
        : null,
      correct_answer: mathText(q?.correct_answer ?? ""),
      needs_figure: q?.needs_figure === true,
      unit_guess: String(q?.unit_guess ?? "").trim(),
      difficulty_guess:
        q?.difficulty_guess === "standard" || q?.difficulty_guess === "advanced"
          ? q.difficulty_guess
          : "basic",
      note: String(q?.note ?? "").trim(),
    });
  }

  if (questions.length === 0) {
    return NextResponse.json({
      questions: [],
      warning: "問題を読み取れませんでした。ページ全体が入るように、明るいところで正面から撮り直してみてください。",
    });
  }

  const needFigure = questions.filter((q) => q.needs_figure).length;
  return NextResponse.json({
    questions,
    solver,
    ...(needFigure > 0
      ? {
          warning:
            `${needFigure}問は図・グラフ・表がないと解けない問題です。図は作れないため、` +
            `類似問題の対象からは外してあります（必要なら手で作ってください）。`,
        }
      : {}),
  });
}
