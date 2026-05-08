import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

async function callClaude(prompt: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1200,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) return "";
  const data = await res.json();
  return data.content?.[0]?.text ?? "";
}

export async function POST(req: NextRequest) {
  const { session_id, student_name, grade, subject, answers, questions, questionnaire } = await req.json();
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // 採点
  const gradedAnswers = answers.map((a: { question_id: string; answer: string }) => {
    const q = questions.find((q: { id: string; correct_answer: string | null }) => q.id === a.question_id);
    const isCorrect = q?.correct_answer
      ? a.answer.trim() === q.correct_answer.trim()
      : null;
    return { ...a, session_id, student_name, is_correct: isCorrect };
  });

  await supabase.from("answers").insert(gradedAnswers);

  // スコア計算
  let score = 0;
  let total = 0;
  for (const q of questions) {
    total += q.points;
    const ans = gradedAnswers.find((a: { question_id: string; is_correct: boolean | null }) => a.question_id === q.id);
    if (ans?.is_correct) score += q.points;
  }
  const percentage = total > 0 ? Math.round((score / total) * 100) : 0;
  await supabase.from("results").insert({ session_id, student_name, score, total, percentage });

  // AI分析：間違えた問題を特定してClaudeに分析させる
  let ai_analysis = "";
  const wrongItems = questions
    .map((q: { id: string; text: string; correct_answer: string | null; options: string[] | null; points: number }) => {
      const ans = gradedAnswers.find((a: { question_id: string; answer: string; is_correct: boolean | null }) => a.question_id === q.id);
      return { text: q.text, correct: q.correct_answer ?? "（記述式）", student: ans?.answer || "（未回答）", is_correct: ans?.is_correct };
    })
    .filter((q: { is_correct: boolean | null }) => q.is_correct === false);

  if (wrongItems.length === 0) {
    ai_analysis = "【全問正解】\nすべての問題を正解しました。非常に優秀な結果です！";
  } else {
    const wrongSummary = wrongItems
      .map((q: { text: string; correct: string; student: string }, i: number) =>
        `問題${i + 1}：${q.text}\n　正解：${q.correct}\n　生徒の解答：${q.student}`
      ).join("\n\n");

    const prompt = `あなたは日本の優秀な教育アドバイザーです。
${grade}の生徒が${subject}のテスト（${total}点満点）で${score}点を取りました。
以下は間違えた問題です。これを分析し、下記の形式で日本語で回答してください。

【間違えた問題】
${wrongSummary}

以下の形式で分析してください：

【苦手な単元・概念】
・〇〇
・〇〇（箇条書きで3つ以内）

【間違いのパターン分析】
（2〜3文で、どのような理解不足や誤解があるかを分析）

【優先的に取り組む学習アドバイス】
（具体的に何を重点的に勉強すべきか、2〜3文で）`;

    try {
      ai_analysis = await callClaude(prompt);
    } catch {
      ai_analysis = "";
    }
  }

  // アンケート＋AI分析を保存
  if (questionnaire) {
    const qr_key = `${session_id}:${student_name}`;
    await supabase.from("questionnaire_responses").insert({
      session_id: qr_key,
      student_name,
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
  }

  return NextResponse.json({ score, total, percentage });
}
