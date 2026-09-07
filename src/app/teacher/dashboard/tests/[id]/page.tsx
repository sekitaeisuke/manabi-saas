"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";
import type { Test } from "@/lib/supabase";
import { showToast } from "@/lib/toast";
import { sanitizeHtml } from "@/lib/sanitize";
import { authFetch } from "@/lib/authFetch";
import { TEST_PAPER_CSS } from "@/lib/testPaperStyle";
import { printPaper } from "@/lib/printPaper";
import { TestQuestionEditor } from "@/components/TestQuestionEditor";
import { toBankRows, saveToBank } from "@/lib/questionBank";
import {
  renderTestHtml, renderAnswerSheetHtml,
  normalizePoints, renumber, sortByDifficulty, type TestQuestion,
} from "@/lib/testHtml";

// 保存済みテストを開いて、中身を確認・修正・印刷するページ。
//
// これまで一覧からできるのは「生徒に割り当てる／配信する／削除する」だけで、
// 保存したテストの中身を見ることも、答えを出すことも、刷ることもできなかった。

/** DBの1行を編集用の形にする。db_id は元の行を上書きするために覚えておく */
type EditableQuestion = TestQuestion & { db_id?: string };

type Row = {
  id: string;
  order_index: number;
  type: string;
  text: string;
  options: string[] | null;
  correct_answer: string | null;
  points: number | null;
  difficulty: string | null;
  section: string | null;
  unit: string | null;
  explanation: string | null;
  passage: string | null;
  passage_id: string | null;
  verify_status: string | null;
  verify_note: string | null;
};

export default function SavedTestPage({ params }: { params: Promise<{ id: string }> }) {
  const [testId, setTestId] = useState<string | null>(null);
  const [test, setTest] = useState<Test | null>(null);
  const [questions, setQuestions] = useState<EditableQuestion[]>([]);
  const [originalIds, setOriginalIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState<"edit" | "paper">("edit");
  const [takenBy, setTakenBy] = useState(0);
  const [regenIndex, setRegenIndex] = useState<number | null>(null);
  const [addingOne, setAddingOne] = useState(false);

  const load = useCallback(async (id: string) => {
    setLoading(true);
    const [{ data: t }, { data: qs }] = await Promise.all([
      supabase.from("tests").select("*").eq("id", id).maybeSingle(),
      supabase.from("questions").select("*").eq("test_id", id).order("order_index"),
    ]);
    setTest((t as Test) ?? null);
    const rows = (qs ?? []) as Row[];
    setQuestions(
      rows.map((r) => ({
        db_id: r.id,
        id: r.id,
        text: r.text ?? "",
        type: r.type ?? "multiple-choice",
        options: r.options ?? [],
        correct_answer: r.correct_answer ?? "",
        points: r.points ?? 1,
        difficulty: r.difficulty ?? "basic",
        section: r.section ?? "",
        unit: r.unit ?? undefined,
        explanation: r.explanation ?? "",
        passage: r.passage ?? undefined,
        passage_id: r.passage_id ?? undefined,
        verify_status: (r.verify_status as TestQuestion["verify_status"]) ?? undefined,
        verify_note: r.verify_note ?? undefined,
      })),
    );
    setOriginalIds(rows.map((r) => r.id));

    // すでに受験されているテストは、問題を消すと過去の結果と食い違う。先に知らせる
    const { data: sessions } = await supabase.from("test_sessions").select("id").eq("test_id", id);
    const sessionIds = (sessions ?? []).map((s) => s.id as string);
    if (sessionIds.length > 0) {
      const { count } = await supabase
        .from("results").select("id", { count: "exact", head: true })
        .in("session_id", sessionIds);
      setTakenBy(count ?? 0);
    }
    setDirty(false);
    setLoading(false);
  }, []);

  useEffect(() => {
    params.then((p) => { setTestId(p.id); load(p.id); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ordered = () => renumber(normalizePoints(sortByDifficulty(questions)));

  const paperHtml = (withAnswers: boolean) =>
    renderTestHtml({
      title: test?.title ?? "",
      grade: test?.grade, subject: test?.subject,
      questions: ordered(), withAnswers,
    });

  const doPrint = (withAnswers: boolean) => {
    const ok = printPaper(
      withAnswers ? `${test?.title ?? ""}（解答・解説）` : test?.title ?? "",
      paperHtml(withAnswers),
    );
    if (!ok) showToast("印刷用の画面を開けませんでした。ポップアップの許可をご確認ください", "error");
  };

  const printAnswerSheet = () =>
    printPaper(
      `${test?.title ?? ""}（解答用紙）`,
      renderAnswerSheetHtml({
        title: test?.title ?? "",
        grade: test?.grade, subject: test?.subject,
        questions: ordered(),
      }),
    );

  const regenerateOne = async (index: number) => {
    const target = questions[index];
    if (!target || !test) return;
    setRegenIndex(index);
    const res = await authFetch("/api/generate/one", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subject: test.subject, grade: test.grade, title: test.title,
        difficulty: target.difficulty, points: target.points,
        passage: target.passage ?? "",
        avoidTexts: questions.filter((_, i) => i !== index).map((x) => x.text),
      }),
    });
    const data = await res.json().catch(() => null);
    setRegenIndex(null);
    if (!data || data.error) { showToast(data?.error ?? "問題を作れませんでした", "error"); return; }
    const q = data.question as TestQuestion;
    setQuestions((prev) => prev.map((x, i) => (i === index
      // db_id は残す（元の行を上書きするため。消して作り直すと過去の解答と切り離される）
      ? { ...q, db_id: x.db_id, id: x.id, passage_id: x.passage_id, passage: x.passage ?? q.passage }
      : x)));
    setDirty(true);
    showToast("問題を作り直しました", "success");
  };

  const addOneQuestion = async () => {
    if (!test) return;
    setAddingOne(true);
    const res = await authFetch("/api/generate/one", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subject: test.subject, grade: test.grade, title: test.title,
        difficulty: questions[questions.length - 1]?.difficulty ?? "basic",
        avoidTexts: questions.map((x) => x.text),
      }),
    });
    const data = await res.json().catch(() => null);
    setAddingOne(false);
    if (!data || data.error) { showToast(data?.error ?? "問題を作れませんでした", "error"); return; }
    setQuestions((prev) => [...prev, data.question as EditableQuestion]);
    setDirty(true);
  };

  const save = async () => {
    if (!testId) return;
    setSaving(true);
    const rows = ordered() as EditableQuestion[];

    // ── 消された問題。すでに解答があるものは消さない（過去の結果と食い違うため）──
    const keptIds = new Set(rows.map((q) => q.db_id).filter(Boolean) as string[]);
    const removed = originalIds.filter((id) => !keptIds.has(id));
    let blocked = 0;
    if (removed.length > 0) {
      const { data: used } = await supabase
        .from("answers").select("question_id").in("question_id", removed);
      const usedIds = new Set((used ?? []).map((a) => a.question_id as string));
      const deletable = removed.filter((id) => !usedIds.has(id));
      blocked = removed.length - deletable.length;
      if (deletable.length > 0) {
        await supabase.from("questions").delete().in("id", deletable);
      }
    }

    // ── 残った問題は上書き、増えた問題は追加 ──
    const payload = (q: EditableQuestion, i: number) => ({
      test_id: testId,
      order_index: i,
      type: "multiple-choice",
      text: q.text,
      options: q.options ?? null,
      correct_answer: q.correct_answer ?? null,
      points: q.points ?? 1,
      difficulty: q.difficulty ?? null,
      section: q.section ?? null,
      unit: q.unit ?? null,
      explanation: q.explanation ?? null,
      passage: q.passage ?? null,
      passage_id: q.passage_id ?? null,
      verify_status: q.verify_status ?? null,
      verify_note: q.verify_note ?? null,
    });

    let failed = "";
    for (let i = 0; i < rows.length; i++) {
      const q = rows[i];
      if (q.db_id) {
        const { error } = await supabase.from("questions").update(payload(q, i)).eq("id", q.db_id);
        if (error) failed = error.message;
      } else {
        const { error } = await supabase.from("questions").insert(payload(q, i));
        if (error) failed = error.message;
      }
    }

    // 検算を通った問題は問題バンクへ貯める（失敗しても保存自体は成立している）
    if (test) {
      const bankRows = toBankRows(rows, { subject: test.subject, grade: test.grade, testId });
      if (bankRows.length > 0) {
        const { error: bankErr } = await saveToBank(supabase, bankRows);
        if (bankErr) console.warn("問題バンクへの保存に失敗（非致命的）:", bankErr);
      }
    }

    setSaving(false);
    if (failed) { showToast("保存に失敗しました: " + failed, "error"); return; }
    if (blocked > 0) {
      showToast(`保存しました。${blocked}問はすでに解答があるため残しました`, "info");
    } else {
      showToast("保存しました", "success");
    }
    await load(testId);
  };

  if (loading) {
    return <Shell><div className="rounded-3xl border border-slate-200 bg-white p-12 text-center text-slate-500">読み込み中...</div></Shell>;
  }
  if (!test) {
    return (
      <Shell>
        <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center">
          <p className="text-slate-600">テストが見つかりません。</p>
          <Link href="/teacher/dashboard/tests" className="mt-4 inline-block text-indigo-600 hover:underline">
            テスト一覧に戻る
          </Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">{test.title}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {test.grade}・{test.subject}・全{questions.length}問
            {test.type === "diagnostic" ? "（多層型診断テスト）" : "（授業確認テスト）"}
          </p>
        </div>
        <Link href="/teacher/dashboard/tests"
          className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
          テスト一覧に戻る
        </Link>
      </div>

      {takenBy > 0 && (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-800">
          このテストはすでに <strong>{takenBy}件</strong> 受験されています。
          問題を書き換えると、過去の結果と中身が食い違います。
          すでに解答がある問題は、削除しても消さずに残します。
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-xl border border-slate-200 bg-white p-0.5 text-sm">
          <button onClick={() => setTab("edit")}
            className={`rounded-lg px-3 py-1.5 ${tab === "edit" ? "bg-indigo-600 font-semibold text-white" : "text-slate-600"}`}>
            問題を直す
          </button>
          <button onClick={() => setTab("paper")}
            className={`rounded-lg px-3 py-1.5 ${tab === "paper" ? "bg-indigo-600 font-semibold text-white" : "text-slate-600"}`}>
            用紙
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => doPrint(false)}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
            問題用紙を印刷
          </button>
          <button onClick={() => doPrint(true)}
            className="rounded-xl border border-green-300 bg-green-50 px-4 py-2 text-sm font-medium text-green-700 hover:bg-green-100">
            解答・解説を印刷
          </button>
          <button onClick={printAnswerSheet}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
            解答用紙を印刷
          </button>
          <button onClick={save} disabled={saving || !dirty}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400">
            {saving ? "保存中..." : dirty ? "変更を保存" : "保存済み"}
          </button>
        </div>
      </div>

      {tab === "edit" ? (
        <TestQuestionEditor
          questions={questions}
          onChange={(next) => { setQuestions(next); setDirty(true); }}
          onRegenerate={regenerateOne}
          onAdd={addOneQuestion}
          busyIndex={regenIndex}
          adding={addingOne}
        />
      ) : (
        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <style>{TEST_PAPER_CSS}</style>
          <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(paperHtml(false)) }} />
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-100 px-6 py-10 text-slate-900">
      <main className="mx-auto max-w-5xl">{children}</main>
    </div>
  );
}
