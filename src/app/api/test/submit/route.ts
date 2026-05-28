import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// 全角→半角正規化（数字・英字・スペース）
function normalize(s: string): string {
  return s
    .trim()
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/[Ａ-Ｚａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/　/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

async function callClaude(prompt: string, maxTokens = 1500): Promise<string> {
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
    const errText = await res.text().catch(() => "(読み取り不可)");
    throw new Error(`Claude API ${res.status}: ${errText}`);
  }
  const data = await res.json();
  return data.content?.[0]?.text ?? "";
}

type RawAnswer = { question_id: string; answer: string };
type RawQuestion = {
  id: string;
  type: string;
  text: string;
  options: string[] | null;
  correct_answer: string | null;
  points: number;
};

export async function POST(req: NextRequest) {
  const { session_id, student_name, grade, subject, answers, questions, questionnaire } =
    await req.json() as {
      session_id: string;
      student_name: string;
      grade: string;
      subject: string;
      answers: RawAnswer[];
      questions: RawQuestion[];
      questionnaire: { a: Record<string, number>; b: Record<string, number>; c: Record<string, number> } | null;
    };

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // ── Step1: 選択式は即座に採点（正規化比較） ──────────
  const gradedMap: Record<string, boolean | null> = {};
  for (const q of questions) {
    const a = answers.find((a) => a.question_id === q.id);
    if (!a) { gradedMap[q.id] = null; continue; }
    if (q.type === "multiple-choice" && q.correct_answer) {
      gradedMap[q.id] = normalize(a.answer) === normalize(q.correct_answer);
    } else {
      gradedMap[q.id] = null; // 記述式はAI採点待ち
    }
  }

  // ── Step2: Claude に「記述式採点＋誤答分析」を1回で依頼 ──
  const shortAnswerQs = questions.filter((q) => q.type === "short-answer" && q.correct_answer);
  const wrongMCQs = questions.filter(
    (q) => q.type === "multiple-choice" && gradedMap[q.id] === false
  );

  let ai_analysis = "";

  if (shortAnswerQs.length > 0 || wrongMCQs.length > 0) {
    const saSection = shortAnswerQs.length > 0
      ? `【記述式問題の採点】
以下の各問題について正誤を判定してください。数学的・内容的に正しければ正解です。
表記の揺れ（全角半角・スペース・助詞の違い等）は正解として扱ってください。

${shortAnswerQs.map((q, i) => {
  const a = answers.find((a) => a.question_id === q.id);
  return `記述式${i + 1}：${q.text}\n　正解：${q.correct_answer}\n　生徒の解答：${a?.answer || "（未回答）"}`;
}).join("\n\n")}`
      : "";

    const allWrongQs = [
      ...wrongMCQs.map((q) => {
        const a = answers.find((a) => a.question_id === q.id);
        return `・${q.text}（正解：${q.correct_answer}　生徒：${a?.answer || "未回答"}）`;
      }),
      ...shortAnswerQs.map((q, i) => `・記述式${i + 1}：${q.text}（正解：${q.correct_answer}）`),
    ];

    const analysisSection = allWrongQs.length > 0
      ? `【誤答分析】
${grade}の生徒が${subject}テストで間違えた・記述した問題を分析し、以下の形式で回答してください。

${allWrongQs.join("\n")}

【苦手な単元・概念】
・〇〇（3つ以内）

【間違いのパターン分析】
（2〜3文）

【優先的に取り組む学習アドバイス】
（具体的に2〜3文）`
      : "";

    const prompt = `あなたは日本の学習塾の採点・教育分析の専門家です。
${saSection}

${analysisSection}

以下のJSON形式のみで回答してください（説明文不要）：
{
  "grades": [${shortAnswerQs.map(() => "true/false").join(", ")}],
  "analysis": "分析テキスト"
}`;

    try {
      const text = await callClaude(prompt, 1500);
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        const grades: unknown[] = Array.isArray(parsed.grades) ? parsed.grades : [];
        // 記述式の採点結果を反映（ClaudeのgradesがshortAnswerQsと同サイズとは限らないため境界チェック）
        shortAnswerQs.forEach((q, i) => {
          gradedMap[q.id] = i < grades.length ? Boolean(grades[i]) : false;
        });
        ai_analysis = parsed.analysis ?? "";
      }
    } catch (err) {
      console.error("Claude採点エラー（正規化フォールバックで継続）:", err);
      // フォールバック：正規化比較
      shortAnswerQs.forEach((q) => {
        const a = answers.find((a) => a.question_id === q.id);
        gradedMap[q.id] = a && q.correct_answer
          ? normalize(a.answer) === normalize(q.correct_answer)
          : false;
      });
    }
  }

  // 全問正解の場合のメッセージ（AI分析が得られなかった場合のフォールバック）
  if (!ai_analysis && Object.values(gradedMap).every((v) => v === true)) {
    ai_analysis = "【全問正解】\nすべての問題を正解しました。非常に優秀な結果です！";
  }

  // ── Step3: session_id から student_id を取得 ──────────
  const { data: assignment } = await supabase
    .from("student_test_assignments")
    .select("student_id")
    .eq("session_id", session_id)
    .maybeSingle();
  const student_id = assignment?.student_id ?? null;

  // ── Step4: 採点結果を確定してDB保存 ──────────────────
  // 重複送信チェック（同一session_idで既に回答が存在する場合は既存結果を返す）
  const { data: existingResult } = await supabase
    .from("results")
    .select("score, total, percentage")
    .eq("session_id", session_id)
    .maybeSingle();
  if (existingResult) {
    return NextResponse.json({
      score: existingResult.score,
      total: existingResult.total,
      percentage: existingResult.percentage,
    });
  }

  const gradedAnswers = answers.map((a) => ({
    question_id: a.question_id,
    answer: a.answer,
    session_id,
    student_name,
    is_correct: gradedMap[a.question_id] ?? null,
  }));

  const { error: answersErr } = await supabase.from("answers").insert(gradedAnswers);
  if (answersErr) {
    console.error("answers insert:", answersErr);
    return NextResponse.json({ error: "回答の保存に失敗しました" }, { status: 500 });
  }

  // スコア計算
  let score = 0;
  let total = 0;
  for (const q of questions) {
    total += q.points;
    if (gradedMap[q.id] === true) score += q.points;
  }
  const percentage = total > 0 ? Math.round((score / total) * 100) : 0;

  const { error: resultsErr } = await supabase.from("results").insert({ session_id, student_name, score, total, percentage });
  if (resultsErr) {
    console.error("results insert:", resultsErr);
    return NextResponse.json({ error: "結果の保存に失敗しました" }, { status: 500 });
  }

  // アンケート＋AI分析を保存
  if (questionnaire) {
    const qr_key = `${session_id}:${student_name}`;
    const { error: qrErr } = await supabase.from("questionnaire_responses").insert({
      session_id: qr_key,
      student_name,
      student_id,
      grade: grade ?? null,
      subject: subject ?? null,
      test_score: score,
      test_total: total,
      test_percentage: percentage,
      section_a: questionnaire.a ?? {},
      section_b: questionnaire.b ?? {},
      section_c: questionnaire.c ?? {},
      ai_analysis,
      status: "pending",
    });
    if (qrErr) console.error("questionnaire_responses insert（非致命的）:", qrErr);
  }

  return NextResponse.json({ score, total, percentage });
}
