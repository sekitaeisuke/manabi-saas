"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { Result, Answer, Question } from "@/lib/supabase";
import { Skeleton } from "@/components/Skeleton";

// results に test 情報を結合した一覧行
type ResultRow = Result & {
  test_id: string | null;
  test_title: string;
  test_subject: string | null;
  test_grade: string | null;
};

function scoreClass(pct: number | null) {
  if (pct == null) return "bg-slate-100 text-slate-600";
  if (pct >= 80) return "bg-green-100 text-green-700";
  if (pct >= 60) return "bg-blue-100 text-blue-700";
  if (pct >= 40) return "bg-yellow-100 text-yellow-700";
  return "bg-red-100 text-red-700";
}

const TYPE_JA: Record<string, string> = {
  "multiple-choice": "選択",
  "multi-select": "複数選択",
  "short-answer": "記述",
};

// ── 答案（解答一覧）ビュー ───────────────────────────────
function AnswerSheet({ row, onBack }: { row: ResultRow; onBack: () => void }) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [qRes, aRes] = await Promise.all([
        row.test_id
          ? supabase.from("questions").select("*").eq("test_id", row.test_id).order("order_index")
          : Promise.resolve({ data: [] as Question[] }),
        supabase.from("answers").select("*")
          .eq("session_id", row.session_id)
          .eq("student_name", row.student_name),
      ]);
      setQuestions((qRes.data as Question[]) ?? []);
      setAnswers((aRes.data as Answer[]) ?? []);
      setLoading(false);
    })();
  }, [row]);

  const answerOf = (questionId: string) => answers.find((a) => a.question_id === questionId);

  const correctCount = questions.filter((q) => answerOf(q.id)?.is_correct === true).length;
  const wrongCount = questions.filter((q) => answerOf(q.id)?.is_correct === false).length;
  const ungraded = questions.length - correctCount - wrongCount;

  return (
    <div className="min-h-screen bg-slate-100 px-6 py-10 text-slate-900">
      <main className="mx-auto max-w-4xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-950">{row.student_name}さんの答案</h1>
            <p className="mt-0.5 text-sm text-slate-500">
              {row.test_title}
              {row.test_subject && ` ・ ${row.test_subject}`}
              {row.test_grade && ` ・ ${row.test_grade}`}
              {row.completed_at && ` ・ ${row.completed_at.slice(0, 10)}`}
            </p>
          </div>
          <button onClick={onBack}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
            一覧に戻る
          </button>
        </div>

        {/* サマリー */}
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <span className={`rounded-full px-3 py-1 text-sm font-bold ${scoreClass(row.percentage)}`}>
              正答率 {row.percentage}%
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">
              {row.score} / {row.total}点
            </span>
            <span className="text-sm text-green-700">正解 {correctCount}</span>
            <span className="text-sm text-red-600">誤答 {wrongCount}</span>
            {ungraded > 0 && <span className="text-sm text-slate-400">未回答・未判定 {ungraded}</span>}
          </div>
          <p className="mt-3 text-xs text-slate-400">
            「正誤」はAI・自動採点の判定結果です。生徒の解答と正解を見比べて、判定が妥当かご確認ください。
          </p>
        </div>

        {/* 答案テーブル */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-2xl" />
            ))}
          </div>
        ) : questions.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-400">
            設問データが見つかりませんでした。
          </div>
        ) : (
          <div className="space-y-3">
            {questions.map((q, i) => {
              const a = answerOf(q.id);
              const studentAns = a?.answer ? a.answer.split(",").join("、") : null;
              const verdict =
                !a ? { label: "未回答", cls: "bg-slate-100 text-slate-500" }
                : a.is_correct === true ? { label: "✓ 正解", cls: "bg-green-100 text-green-700" }
                : a.is_correct === false ? { label: "✕ 誤答", cls: "bg-red-100 text-red-700" }
                : { label: "未判定", cls: "bg-slate-100 text-slate-500" };
              return (
                <div key={q.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-400">第{i + 1}問</span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                        {TYPE_JA[q.type] ?? q.type}
                      </span>
                      <span className="text-[11px] text-slate-400">{q.points}点</span>
                    </div>
                    <span className={`shrink-0 rounded-full px-3 py-0.5 text-xs font-bold ${verdict.cls}`}>
                      {verdict.label}
                    </span>
                  </div>

                  <p className="mb-3 text-sm font-medium leading-relaxed text-slate-900">{q.text}</p>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className={`rounded-xl border p-3 ${
                      a?.is_correct === false ? "border-red-200 bg-red-50" : "border-slate-200 bg-slate-50"
                    }`}>
                      <p className="mb-1 text-[11px] font-semibold text-slate-400">生徒の解答</p>
                      <p className={`text-sm font-medium ${
                        studentAns == null ? "text-slate-400" : a?.is_correct === false ? "text-red-700" : "text-slate-800"
                      }`}>
                        {studentAns ?? "未回答"}
                      </p>
                    </div>
                    <div className="rounded-xl border border-green-200 bg-green-50 p-3">
                      <p className="mb-1 text-[11px] font-semibold text-green-600">正解</p>
                      <p className="text-sm font-medium text-green-800">
                        {q.correct_answer ? q.correct_answer.split(",").join("、") : "—"}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

// ── 一覧ビュー ───────────────────────────────────────────
export default function TeacherResultsPage() {
  const [rows, setRows] = useState<ResultRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ResultRow | null>(null);
  const [studentFilter, setStudentFilter] = useState<string>("all");

  const load = useCallback(async () => {
    setLoading(true);
    const { data: results } = await supabase
      .from("results")
      .select("*")
      .order("completed_at", { ascending: false })
      .limit(300);
    const resultRows = (results as Result[]) ?? [];

    // results.session_id → test_sessions.test_id → tests(title/subject/grade) を結合
    const sessionIds = [...new Set(resultRows.map((r) => r.session_id))];
    const sessionToTest = new Map<string, string>();
    if (sessionIds.length > 0) {
      const { data: sessions } = await supabase
        .from("test_sessions").select("id, test_id").in("id", sessionIds);
      (sessions ?? []).forEach((s: { id: string; test_id: string }) => sessionToTest.set(s.id, s.test_id));
    }
    const testIds = [...new Set([...sessionToTest.values()])];
    const testMap = new Map<string, { title: string; subject: string | null; grade: string | null }>();
    if (testIds.length > 0) {
      const { data: tests } = await supabase
        .from("tests").select("id, title, subject, grade").in("id", testIds);
      (tests ?? []).forEach((t: { id: string; title: string; subject: string | null; grade: string | null }) =>
        testMap.set(t.id, { title: t.title, subject: t.subject, grade: t.grade }));
    }

    setRows(resultRows.map((r) => {
      const testId = sessionToTest.get(r.session_id) ?? null;
      const t = testId ? testMap.get(testId) : undefined;
      return {
        ...r,
        test_id: testId,
        test_title: t?.title ?? "（テスト不明）",
        test_subject: t?.subject ?? null,
        test_grade: t?.grade ?? null,
      };
    }));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (selected) {
    return <AnswerSheet row={selected} onBack={() => setSelected(null)} />;
  }

  const studentNames = [...new Set(rows.map((r) => r.student_name))].sort();
  const filtered = studentFilter === "all" ? rows : rows.filter((r) => r.student_name === studentFilter);

  return (
    <div className="min-h-screen bg-slate-100 px-6 py-10 text-slate-900">
      <main className="mx-auto max-w-5xl">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-slate-950">テスト結果・答案</h1>
          <p className="mt-1 text-slate-600">
            生徒が実際に提出した答案を確認できます。設問ごとの解答・正解・正誤（AI採点）まで見られます。
          </p>
        </div>

        {studentNames.length > 0 && (
          <div className="mb-6 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-400">生徒:</span>
            <button onClick={() => setStudentFilter("all")}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                studentFilter === "all" ? "bg-slate-800 text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}>
              全員
            </button>
            {studentNames.map((name) => (
              <button key={name} onClick={() => setStudentFilter(name)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  studentFilter === name ? "bg-indigo-600 text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}>
                {name}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-3">
                    <Skeleton className="h-6 w-32" />
                    <Skeleton className="h-4 w-56" />
                  </div>
                  <Skeleton className="h-10 w-24 rounded-2xl" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <p className="text-4xl mb-3">📝</p>
            <p className="font-semibold text-slate-700">テスト結果がまだありません</p>
            <p className="mt-1 text-sm text-slate-400">生徒がテストを提出すると、ここに答案が表示されます。</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((r) => (
              <div key={r.id}
                className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-indigo-200 hover:shadow-md">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    {r.completed_at && (
                      <p className="mb-1 text-xs text-slate-400">{r.completed_at.slice(0, 10)}</p>
                    )}
                    <p className="text-lg font-bold text-slate-900">{r.student_name}</p>
                    <p className="mt-0.5 text-sm text-slate-500">
                      {r.test_title}{r.test_subject && ` ・ ${r.test_subject}`}{r.test_grade && ` ・ ${r.test_grade}`}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${scoreClass(r.percentage)}`}>
                        正答率：{r.percentage}%
                      </span>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                        {r.score}/{r.total}点
                      </span>
                    </div>
                  </div>
                  <button onClick={() => setSelected(r)}
                    className="shrink-0 rounded-2xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 transition">
                    答案を見る
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
