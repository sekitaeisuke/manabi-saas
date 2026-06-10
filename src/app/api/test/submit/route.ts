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

function buildLessonReportHtml(p: {
  title: string; subject: string; grade: string; studentName: string;
  score: number; total: number; percentage: number; ai_analysis: string;
  questions: RawQuestion[]; answers: RawAnswer[]; gradedMap: Record<string, boolean | null>;
}): string {
  const pct = p.percentage;
  const pctColor = pct >= 80 ? "#059669" : pct >= 60 ? "#2563eb" : pct >= 40 ? "#d97706" : "#dc2626";
  const wrongQs = p.questions.filter((q) => p.gradedMap[q.id] === false);
  const correctCount = p.questions.filter((q) => p.gradedMap[q.id] === true).length;

  const wrongRows = wrongQs.map((q, i) => {
    const a = p.answers.find((a) => a.question_id === q.id);
    return `<tr>
      <td style="padding:6px 10px;border:1px solid #e2e8f0">${i + 1}. ${q.text}</td>
      <td style="padding:6px 10px;border:1px solid #e2e8f0;color:#dc2626">${a?.answer ?? "未回答"}</td>
      <td style="padding:6px 10px;border:1px solid #e2e8f0;color:#059669;font-weight:600">${q.correct_answer ?? "—"}</td>
    </tr>`;
  }).join("");

  return `
<h2>テスト結果</h2>
<p>${p.subject}・${p.grade}・${p.studentName}さん</p>
<div style="background:#f8fafc;border-radius:12px;padding:16px;margin:16px 0;border-left:4px solid ${pctColor}">
  <p style="font-size:1.4rem;font-weight:800;color:${pctColor};margin:0">
    ${p.score} / ${p.total}点　正答率 ${pct}%
  </p>
  <p style="margin:4px 0 0;font-size:0.85rem;color:#64748b">
    正解 ${correctCount}問 ／ 不正解 ${wrongQs.length}問 ／ 全 ${p.questions.length}問
  </p>
</div>

${p.ai_analysis ? `
<h2>AI 分析レポート</h2>
<div style="white-space:pre-wrap;line-height:1.8;color:#334155">${p.ai_analysis}</div>
` : ""}

${wrongQs.length > 0 ? `
<h2>間違えた問題（${wrongQs.length}問）</h2>
<table style="border-collapse:collapse;width:100%;font-size:0.875rem">
  <thead>
    <tr style="background:#f8fafc">
      <th style="padding:8px 10px;border:1px solid #e2e8f0;text-align:left">問題</th>
      <th style="padding:8px 10px;border:1px solid #e2e8f0;text-align:left">生徒の回答</th>
      <th style="padding:8px 10px;border:1px solid #e2e8f0;text-align:left">正解</th>
    </tr>
  </thead>
  <tbody>${wrongRows}</tbody>
</table>
` : `<p style="color:#059669;font-weight:600">🎉 全問正解！素晴らしい結果です。</p>`}
`.trim();
}

export async function POST(req: NextRequest) {
  const { session_id, student_name, grade, subject, answers, questions, questionnaire, test_type, test_title } =
    await req.json() as {
      session_id: string;
      student_name: string;
      grade: string;
      subject: string;
      answers: RawAnswer[];
      questions: RawQuestion[];
      questionnaire: { a: Record<string, number>; b: Record<string, number>; c: Record<string, number> } | null;
      test_type?: string;
      test_title?: string;
    };

  const isLessonTest = test_type === "lesson";

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // ── Step1: 選択式は即座に採点（正規化比較） ──────────
  const gradedMap: Record<string, boolean | null> = {};
  for (const q of questions) {
    const a = answers.find((a) => a.question_id === q.id);
    if (!a) { gradedMap[q.id] = null; continue; }
    if ((q.type === "multiple-choice" || q.type === "multi-select") && q.correct_answer) {
      if (q.correct_answer.includes(",")) {
        // 複数選択：順序を無視して集合比較
        const correctSet = new Set(q.correct_answer.split(",").map((s) => normalize(s.trim())));
        const answerSet  = new Set((a.answer || "").split(",").map((s) => normalize(s.trim())));
        gradedMap[q.id] =
          correctSet.size === answerSet.size &&
          [...correctSet].every((c) => answerSet.has(c));
      } else {
        gradedMap[q.id] = normalize(a.answer) === normalize(q.correct_answer);
      }
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

    // AI採点が得られなかった場合の正規化フォールバック（記述式を無得点で握りつぶさない）
    const fallbackGradeShortAnswers = () => {
      shortAnswerQs.forEach((q) => {
        const a = answers.find((a) => a.question_id === q.id);
        gradedMap[q.id] = a && q.correct_answer
          ? normalize(a.answer) === normalize(q.correct_answer)
          : false;
      });
    };

    try {
      const text = await callClaude(prompt, 1500);
      const match = text.match(/\{[\s\S]*\}/);
      const parsed = match ? JSON.parse(match[0]) : null;
      if (parsed && Array.isArray(parsed.grades)) {
        const grades: unknown[] = parsed.grades;
        // 記述式の採点結果を反映（ClaudeのgradesがshortAnswerQsと同サイズとは限らないため境界チェック）
        shortAnswerQs.forEach((q, i) => {
          gradedMap[q.id] = i < grades.length ? Boolean(grades[i]) : false;
        });
        ai_analysis = typeof parsed.analysis === "string" ? parsed.analysis : "";
      } else {
        // JSONが取れない／gradesが無い場合も正規化比較で救済
        console.warn("Claude採点：JSON解析不可。正規化フォールバックで継続");
        fallbackGradeShortAnswers();
      }
    } catch (err) {
      console.error("Claude採点エラー（正規化フォールバックで継続）:", err);
      fallbackGradeShortAnswers();
    }
  }

  // 全問正解の場合のメッセージ（AI分析が得られなかった場合のフォールバック）
  if (!ai_analysis && Object.values(gradedMap).every((v) => v === true)) {
    ai_analysis = "【全問正解】\nすべての問題を正解しました。非常に優秀な結果です！";
  }

  // ── Step3: session_id から student_id を取得 ──────────
  const { data: assignment } = await supabase
    .from("test_assignments")
    .select("student_id")
    .eq("test_session_id", session_id)
    .maybeSingle();
  const student_id = assignment?.student_id ?? null;

  // ── Step4: 採点結果を確定してDB保存 ──────────────────
  // 重複送信チェック（同一session_id + student_name で既に回答済みの場合は既存結果を返す）
  const { data: existingResult } = await supabase
    .from("results")
    .select("score, total, percentage")
    .eq("session_id", session_id)
    .eq("student_name", student_name)
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

  // ── Step5: テストタイプ別の後処理 ──────────────────────
  if (isLessonTest) {
    // 学力テスト → 報告書ドラフトを自動作成
    const reportHtml = buildLessonReportHtml({
      title: test_title ?? subject,
      subject, grade, studentName: student_name,
      score, total, percentage, ai_analysis,
      questions, answers, gradedMap,
    });
    await supabase.from("lesson_reports").insert({
      test_title: test_title ?? `${subject} テスト`,
      test_subject: subject,
      test_grade: grade,
      student_name,
      student_id,
      score,
      total,
      percentage,
      report_html: reportHtml,
      status: "draft",
      report_source: "test",
    });
  } else if (questionnaire) {
    // 多層分析テスト → アンケート＋AI分析を保存
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
