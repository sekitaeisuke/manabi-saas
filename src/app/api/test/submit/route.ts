import { NextRequest, NextResponse, after } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { generateText, extractJson } from "@/lib/ai";
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

// 氏名照合用の正規化：上記に加えて空白を全除去（「山田 太郎」=「山田太郎」を同一視）
function normalizeName(s: string): string {
  return normalize(s).replace(/\s+/g, "");
}

// 受験URLは氏名を手入力するため、入力名から students を照合して student_id を解決する。
// service role で students を読み（RLSの影響を受けない）、一意に定まる場合のみ採用する。
// 誤紐付けを避けるため、同名が複数いる場合は null（講師が後から手当て）。
async function resolveStudentId(studentName: string, grade: string): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const target = normalizeName(studentName);
  if (!url || !serviceKey || !target) return null;

  const svc = createClient(url, serviceKey);

  const matchUnique = async (filterByGrade: boolean): Promise<string | null> => {
    let q = svc.from("students").select("id, name, grade");
    if (filterByGrade && grade) q = q.eq("grade", grade);
    const { data } = await q;
    if (!data) return null;
    const hits = data.filter((s) => normalizeName(s.name as string) === target);
    return hits.length === 1 ? (hits[0].id as string) : null;
  };

  // まず同学年で一意照合、ダメなら全学年で一意照合（学年表記ゆれ救済）
  return (grade ? await matchUnique(true) : null) ?? (await matchUnique(false));
}

type RawAnswer = { question_id: string; answer: string };
type RawQuestion = {
  id: string;
  type: string;
  text: string;
  options: string[] | null;
  correct_answer: string | null;
  points: number;
  /** なぜその答えになるかの説明。間違えた問題の表に添えて、家庭で振り返れるようにする */
  explanation?: string | null;
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
    const why = q.explanation
      ? `<div style="margin-top:4px;font-size:0.8125rem;color:#64748b">${q.explanation}</div>`
      : "";
    return `<tr>
      <td style="padding:6px 10px;border:1px solid #e2e8f0">${i + 1}. ${q.text}${why}</td>
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

// 提出の流れ（2026-09-11 に組み直した）
//
// 高島さんの数学（多層診断）で、1回目の提出は保存まで済んでいたのに、画面では失敗に見え、
// 押し直した12回がすべて「回答の保存に失敗しました」になった。原因は3つ:
//   ① 「提出済みか」の確認を匿名キーで読んでいた。RLS で匿名は results を読めないので
//      必ず「未提出」になり、同じ回答をもう一度 INSERT して一意制約で落ちていた
//   ② 保存の前にAIの誤答分析（15〜25秒）を待っていた。生徒は「提出中…」のまま待たされる
//   ③ AIは分析を文章でなく項目分けしたオブジェクトで返すことがあり、文字列以外を捨てていた
// そこで:
//   ・DB は service role で読み書きする（匿名で読めない表を読むため。書き込みも同じ鍵にそろえる）
//   ・提出済みなら、採点もAIもやり直さずに即「受け付けた」を返す（押し直しても失敗にしない）
//   ・回答・結果・アンケートを先に保存して応答を返し、誤答分析は after() で後から書き足す
//   ・誤答分析はJSONをやめて文章で書かせる（記述式の採点だけJSONで短く返させる）
export const maxDuration = 60;

function serverDb(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key);
}

type Questionnaire = { a: Record<string, number>; b: Record<string, number>; c: Record<string, number> };

/** アンケートに1問でも答えがあるか（空のまま行を作らない） */
function hasQuestionnaire(q: Questionnaire | null | undefined): q is Questionnaire {
  return !!q && [q.a, q.b, q.c].some((s) => s && Object.keys(s).length > 0);
}

/** 記述式を採点する。AIが使えないときは表記ゆれだけ吸収して文字列で比べる */
async function gradeShortAnswers(
  shortAnswerQs: RawQuestion[], answers: RawAnswer[], gradedMap: Record<string, boolean | null>,
): Promise<void> {
  const fallback = () => {
    shortAnswerQs.forEach((q) => {
      const a = answers.find((x) => x.question_id === q.id);
      gradedMap[q.id] = a && q.correct_answer ? normalize(a.answer) === normalize(q.correct_answer) : false;
    });
  };
  const prompt = `あなたは日本の学習塾の採点担当です。次の記述式問題の正誤を判定してください。
数学的・内容的に正しければ正解です。表記の揺れ（全角半角・スペース・助詞の違い等）は正解として扱います。

${shortAnswerQs.map((q, i) => {
  const a = answers.find((x) => x.question_id === q.id);
  return `記述式${i + 1}：${q.text}\n　正解：${q.correct_answer}\n　生徒の解答：${a?.answer || "（未回答）"}`;
}).join("\n\n")}

次の形のJSONだけを返してください（${shortAnswerQs.length}個の true/false を問題の順に）:
{"grades": [${shortAnswerQs.map(() => "true").join(", ")}]}`;
  try {
    const { text } = await generateText({ prompt, maxTokens: 300, json: true, feature: "test_submit_grade" });
    const parsed = extractJson<{ grades?: unknown[] }>(text);
    if (!parsed || !Array.isArray(parsed.grades)) { fallback(); return; }
    const grades = parsed.grades;
    shortAnswerQs.forEach((q, i) => {
      gradedMap[q.id] = i < grades.length ? grades[i] === true || grades[i] === "true" : false;
    });
  } catch (err) {
    console.error("記述式の採点エラー（文字列比較で継続）:", err);
    fallback();
  }
}

/** 間違えた問題の分析を文章で書かせる。書けなければ空文字（提出は止めない） */
async function writeAnalysis(
  grade: string, subject: string, wrongQs: RawQuestion[], answers: RawAnswer[],
): Promise<string> {
  if (wrongQs.length === 0) return "";
  const lines = wrongQs.map((q) => {
    const a = answers.find((x) => x.question_id === q.id);
    return `・${q.text}（正解：${q.correct_answer ?? "—"}　生徒：${a?.answer || "未回答"}）`;
  });
  const prompt = `あなたは日本の学習塾の教育分析の専門家です。
${grade}の生徒が${subject}のテストで間違えた問題です。

${lines.join("\n")}

次の3つの見出しで、ふつうの文章で書いてください（JSON・コードブロック・前置きは不要）。

【苦手な単元・概念】
・〇〇（3つ以内）

【間違いのパターン分析】
（2〜3文）

【優先的に取り組む学習アドバイス】
（具体的に2〜3文）`;
  try {
    const { text } = await generateText({ prompt, maxTokens: 1200, feature: "test_submit" });
    return text.replace(/^```[a-z]*\s*|```\s*$/gi, "").trim();
  } catch (err) {
    console.error("誤答分析エラー（分析なしで継続）:", err);
    return "";
  }
}

export async function POST(req: NextRequest) {
  const { session_id, student_name, grade, subject, answers: rawAnswers, questionnaire, test_type, test_title } =
    await req.json() as {
      session_id: string;
      student_name: string;
      grade: string;
      subject: string;
      answers: RawAnswer[];
      questionnaire: Questionnaire | null;
      test_type?: string;
      test_title?: string;
    };

  if (!session_id || !String(student_name ?? "").trim()) {
    return NextResponse.json({ error: "受験URLまたは名前がありません" }, { status: 400 });
  }
  const answers = Array.isArray(rawAnswers) ? rawAnswers : [];
  const isLessonTest = test_type === "lesson";
  const db = serverDb();

  // ── 採点はクライアント送信値ではなく、DB の正解・配点で行う（改ざん防止）──
  const { data: ts } = await db
    .from("test_sessions").select("test_id").eq("id", session_id).maybeSingle();
  if (!ts) {
    return NextResponse.json({ error: "テストセッションが見つかりません" }, { status: 404 });
  }
  const { data: dbQuestions, error: qErr } = await db
    .from("questions")
    .select("id, type, text, options, correct_answer, points, explanation")
    .eq("test_id", (ts as { test_id: string }).test_id)
    .order("order_index");
  if (qErr || !dbQuestions) {
    return NextResponse.json({ error: "問題の取得に失敗しました" }, { status: 500 });
  }
  const questions = dbQuestions as RawQuestion[];

  // ── 受験URLの割り当てから生徒を決める（1人ならその生徒、それ以外は入力名で照合）──
  // 1つのセッション（＝1つの受験URL）を複数の生徒に割り当てるのが普通なので maybeSingle は使わない
  const resolveStudent = async (): Promise<string | null> => {
    const { data: assignments } = await db
      .from("test_assignments").select("student_id").eq("test_session_id", session_id);
    const ids = ((assignments ?? []) as { student_id: string }[]).map((a) => a.student_id);
    return ids.length === 1 ? ids[0] : await resolveStudentId(student_name, grade);
  };

  const saveQuestionnaire = async (
    student_id: string | null, r: { score: number; total: number; percentage: number },
  ): Promise<{ id: string | null; error: string | null }> => {
    const { data, error } = await db.from("questionnaire_responses").insert({
      session_id: `${session_id}:${student_name}`,
      student_name,
      student_id,
      grade: grade ?? null,
      subject: subject ?? null,
      test_score: r.score,
      test_total: r.total,
      test_percentage: r.percentage,
      section_a: questionnaire?.a ?? {},
      section_b: questionnaire?.b ?? {},
      section_c: questionnaire?.c ?? {},
      ai_analysis: "",
      status: "pending",
    }).select("id").single();
    return { id: (data as { id: string } | null)?.id ?? null, error: error?.message ?? null };
  };

  // ── ① 提出済みなら、採点もAIもやり直さずにそのまま受け付ける ──────────
  // 通信が切れて画面では失敗に見えても、保存は済んでいることがある。押し直しを失敗にしない。
  // アンケートだけ保存し損ねていた場合は、ここで保存する。
  const findResult = async () => {
    const { data } = await db
      .from("results").select("score, total, percentage")
      .eq("session_id", session_id).eq("student_name", student_name).maybeSingle();
    return data as { score: number; total: number; percentage: number } | null;
  };
  const acceptExisting = async (r: { score: number; total: number; percentage: number }) => {
    if (!isLessonTest && hasQuestionnaire(questionnaire)) {
      const { data: qr } = await db
        .from("questionnaire_responses").select("id")
        .eq("session_id", `${session_id}:${student_name}`).limit(1);
      if (!qr || qr.length === 0) {
        const saved = await saveQuestionnaire(await resolveStudent(), r);
        if (saved.error) {
          console.error("questionnaire_responses insert（再提出時）:", saved.error);
          return NextResponse.json({ error: "アンケートの保存に失敗しました" }, { status: 500 });
        }
      }
    }
    return NextResponse.json({ score: r.score, total: r.total, percentage: r.percentage, alreadySubmitted: true });
  };

  const existing = await findResult();
  if (existing) return acceptExisting(existing);

  // ── ② 採点。選択式はその場で、記述式はAIで（得点が決まらないと保存できないので先に行う）──
  const gradedMap: Record<string, boolean | null> = {};
  for (const q of questions) {
    const a = answers.find((x) => x.question_id === q.id);
    if (!a) { gradedMap[q.id] = null; continue; }
    if ((q.type === "multiple-choice" || q.type === "multi-select") && q.correct_answer) {
      if (q.correct_answer.includes(",")) {
        // 複数選択：順序を無視して集合比較
        const correctSet = new Set(q.correct_answer.split(",").map((s) => normalize(s.trim())));
        const answerSet = new Set((a.answer || "").split(",").map((s) => normalize(s.trim())));
        gradedMap[q.id] =
          correctSet.size === answerSet.size && [...correctSet].every((c) => answerSet.has(c));
      } else {
        gradedMap[q.id] = normalize(a.answer) === normalize(q.correct_answer);
      }
    } else {
      gradedMap[q.id] = null; // 記述式はAI採点待ち
    }
  }
  const shortAnswerQs = questions.filter((q) => q.type === "short-answer" && q.correct_answer);
  if (shortAnswerQs.length > 0) await gradeShortAnswers(shortAnswerQs, answers, gradedMap);

  let score = 0;
  let total = 0;
  for (const q of questions) {
    total += q.points;
    if (gradedMap[q.id] === true) score += q.points;
  }
  const percentage = total > 0 ? Math.round((score / total) * 100) : 0;
  const student_id = await resolveStudent();

  // ── ③ 保存。回答 → 結果 の順 ─────────────────────────────
  // 同じ提出がほぼ同時に2回来たときや、前回が回答だけ保存して落ちていたときも、
  // 一意制約にぶつかったものは飛ばして続ける（ignoreDuplicates）。
  const { error: answersErr } = await db.from("answers").upsert(
    answers.map((a) => ({
      question_id: a.question_id,
      answer: a.answer,
      session_id,
      student_name,
      is_correct: gradedMap[a.question_id] ?? null,
    })),
    { onConflict: "session_id,student_name,question_id", ignoreDuplicates: true },
  );
  if (answersErr) {
    console.error("answers insert:", answersErr);
    return NextResponse.json({ error: "回答の保存に失敗しました" }, { status: 500 });
  }

  const { error: resultsErr } = await db.from("results")
    .insert({ session_id, student_name, score, total, percentage });
  if (resultsErr) {
    // ほぼ同時の二重送信で、もう片方が先に保存した
    const raced = await findResult();
    if (raced) return acceptExisting(raced);
    console.error("results insert:", resultsErr);
    return NextResponse.json({ error: "結果の保存に失敗しました" }, { status: 500 });
  }

  // ── ④ テストの種類ごとの保存。誤答分析は応答を返したあとで書き足す ──────
  const wrongQs = questions.filter((q) => gradedMap[q.id] === false);
  const allCorrect = questions.length > 0 && questions.every((q) => gradedMap[q.id] === true);
  const fallbackAnalysis = allCorrect ? "【全問正解】\nすべての問題を正解しました。非常に優秀な結果です！" : "";

  if (isLessonTest) {
    // 学力テスト → 報告書ドラフトを自動作成
    const reportFor = (ai_analysis: string) => buildLessonReportHtml({
      title: test_title ?? subject,
      subject, grade, studentName: student_name,
      score, total, percentage, ai_analysis,
      questions, answers, gradedMap,
    });
    const { data: report, error: lrErr } = await db.from("lesson_reports").insert({
      test_title: test_title ?? `${subject} テスト`,
      test_subject: subject,
      test_grade: grade,
      student_name,
      student_id,
      score,
      total,
      percentage,
      report_html: reportFor(fallbackAnalysis),
      status: "draft",
      report_source: "test",
    }).select("id").single();
    if (lrErr) console.error("lesson_reports insert（非致命的）:", lrErr);
    const reportId = (report as { id: string } | null)?.id;
    if (reportId && wrongQs.length > 0) {
      after(async () => {
        const analysis = await writeAnalysis(grade, subject, wrongQs, answers);
        if (analysis) {
          await db.from("lesson_reports").update({ report_html: reportFor(analysis) }).eq("id", reportId);
        }
      });
    }
  } else if (questionnaire) {
    // 多層分析テスト → アンケートを保存。保存できなければ失敗として返す
    // （結果は保存済みなので、押し直すと①の流れでアンケートだけ保存される）
    const saved = await saveQuestionnaire(student_id, { score, total, percentage });
    if (saved.error || !saved.id) {
      console.error("questionnaire_responses insert:", saved.error);
      return NextResponse.json({ error: "アンケートの保存に失敗しました" }, { status: 500 });
    }
    const qrId = saved.id;
    if (wrongQs.length > 0) {
      after(async () => {
        const analysis = await writeAnalysis(grade, subject, wrongQs, answers);
        if (analysis) {
          await db.from("questionnaire_responses").update({ ai_analysis: analysis }).eq("id", qrId);
        }
      });
    } else if (fallbackAnalysis) {
      await db.from("questionnaire_responses").update({ ai_analysis: fallbackAnalysis }).eq("id", qrId);
    }
  }

  return NextResponse.json({ score, total, percentage });
}
