import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  const { session_id, student_name, grade, subject, answers, questions, questionnaire } = await req.json();
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const gradedAnswers = answers.map((a: { question_id: string; answer: string }) => {
    const q = questions.find((q: { id: string; correct_answer: string | null }) => q.id === a.question_id);
    const isCorrect = q?.correct_answer
      ? a.answer.trim() === q.correct_answer.trim()
      : null;
    return { ...a, session_id, student_name, is_correct: isCorrect };
  });

  await supabase.from("answers").insert(gradedAnswers);

  let score = 0;
  let total = 0;
  for (const q of questions) {
    total += q.points;
    const ans = gradedAnswers.find((a: { question_id: string; is_correct: boolean | null }) => a.question_id === q.id);
    if (ans?.is_correct) score += q.points;
  }

  const percentage = total > 0 ? Math.round((score / total) * 100) : 0;
  await supabase.from("results").insert({ session_id, student_name, score, total, percentage });

  // Save questionnaire responses if provided
  // session_id をセッションUUID+生徒名の複合キーにして複数生徒が同一URLを使えるようにする
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
      status: "pending",
    });
  }

  return NextResponse.json({ score, total, percentage });
}
