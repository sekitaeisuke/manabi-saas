"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import type { Test, Question } from "@/lib/supabase";

const SUBJECTS = ["国語", "数学", "英語", "理科", "社会"];
const GRADES = [
  "小学1年", "小学2年", "小学3年", "小学4年", "小学5年", "小学6年",
  "中学1年", "中学2年", "中学3年",
  "高校1年", "高校2年", "高校3年",
];

export default function TeacherTestsPage() {
  const [tests, setTests] = useState<Test[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"list" | "create">("list");

  useEffect(() => {
    fetchTests();
  }, []);

  const fetchTests = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("tests")
      .select("*")
      .order("created_at", { ascending: false });
    setTests(data ?? []);
    setLoading(false);
  };

  const deleteTest = async (id: string) => {
    if (!confirm("このテストを削除しますか？")) return;
    await supabase.from("tests").delete().eq("id", id);
    fetchTests();
  };

  return (
    <div className="min-h-screen bg-slate-100 px-6 py-10 text-slate-900">
      <main className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-950">診断テスト</h1>
            <p className="mt-1 text-slate-600">学力診断テストを作成・管理します。</p>
          </div>
          <div className="flex gap-3">
            {view === "list" ? (
              <button
                onClick={() => setView("create")}
                className="rounded-2xl bg-green-600 px-5 py-3 font-semibold text-white transition hover:bg-green-700"
              >
                + 新規作成
              </button>
            ) : (
              <button
                onClick={() => { setView("list"); fetchTests(); }}
                className="rounded-2xl border border-slate-300 bg-white px-5 py-3 text-slate-700 transition hover:bg-slate-50"
              >
                一覧に戻る
              </button>
            )}
            <Link
              href="/teacher/dashboard"
              className="rounded-2xl border border-slate-300 bg-white px-5 py-3 text-slate-700 transition hover:bg-slate-50"
            >
              ダッシュボード
            </Link>
          </div>
        </div>

        {view === "list" ? (
          <TestList tests={tests} loading={loading} onDelete={deleteTest} />
        ) : (
          <CreateTestForm onSaved={() => { setView("list"); fetchTests(); }} />
        )}
      </main>
    </div>
  );
}

function TestList({
  tests,
  loading,
  onDelete,
}: {
  tests: Test[];
  loading: boolean;
  onDelete: (id: string) => void;
}) {
  if (loading) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center text-slate-500">
        読み込み中...
      </div>
    );
  }

  if (tests.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">
        テストがまだありません。「新規作成」から作成してください。
      </div>
    );
  }

  const difficultyLabel: Record<string, string> = {
    easy: "易しい", medium: "普通", hard: "難しい",
  };
  const statusLabel: Record<string, { label: string; color: string }> = {
    draft: { label: "下書き", color: "bg-slate-100 text-slate-600" },
    published: { label: "配信中", color: "bg-green-100 text-green-700" },
    closed: { label: "終了", color: "bg-red-100 text-red-700" },
  };

  return (
    <div className="space-y-3">
      {tests.map((test) => {
        const st = statusLabel[test.status] ?? statusLabel.draft;
        return (
          <div key={test.id} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <h2 className="font-semibold text-slate-950">{test.title}</h2>
                  <span className={`rounded-full px-3 py-0.5 text-xs font-medium ${st.color}`}>
                    {st.label}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  {test.subject} ・ {test.grade} ・ {difficultyLabel[test.difficulty] ?? test.difficulty}
                </p>
              </div>
              <div className="flex gap-2">
                <Link
                  href={`/teacher/dashboard/tests/${test.id}`}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
                >
                  編集
                </Link>
                <button
                  onClick={() => onDelete(test.id)}
                  className="rounded-xl border border-red-200 bg-white px-4 py-2 text-sm text-red-600 transition hover:bg-red-50"
                >
                  削除
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CreateTestForm({ onSaved }: { onSaved: () => void }) {
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState(SUBJECTS[0]);
  const [grade, setGrade] = useState(GRADES[6]);
  const [difficulty, setDifficulty] = useState("medium");
  const [questions, setQuestions] = useState<Omit<Question, "id" | "test_id">[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const saveTest = async () => {
    if (!title || questions.length === 0) {
      alert("テスト名と最低1問の問題が必要です");
      return;
    }
    setSaving(true);

    const { data: test, error } = await supabase
      .from("tests")
      .insert({ title, subject, grade, difficulty, status: "draft" })
      .select()
      .single();

    if (error || !test) {
      alert("保存に失敗しました");
      setSaving(false);
      return;
    }

    const rows = questions.map((q, i) => ({
      test_id: test.id,
      type: q.type,
      text: q.text,
      options: q.options,
      correct_answer: q.correct_answer,
      order_index: i,
      points: q.points,
    }));

    await supabase.from("questions").insert(rows);
    setSaving(false);
    onSaved();
  };

  const addQuestion = (q: Omit<Question, "id" | "test_id">) => {
    if (editingIndex !== null) {
      setQuestions(questions.map((old, i) => (i === editingIndex ? q : old)));
      setEditingIndex(null);
    } else {
      setQuestions([...questions, q]);
    }
    setShowAddForm(false);
  };

  return (
    <div className="grid gap-8 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-6">
        <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <h2 className="text-xl font-semibold">テスト情報</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm text-slate-700 sm:col-span-2">
              テスト名
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:ring-2 focus:ring-green-400"
                placeholder="例：1月学力診断テスト"
              />
            </label>
            <label className="grid gap-2 text-sm text-slate-700">
              科目
              <select
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:ring-2 focus:ring-green-400"
              >
                {SUBJECTS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </label>
            <label className="grid gap-2 text-sm text-slate-700">
              学年
              <select
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:ring-2 focus:ring-green-400"
              >
                {GRADES.map((g) => <option key={g}>{g}</option>)}
              </select>
            </label>
            <label className="grid gap-2 text-sm text-slate-700 sm:col-span-2">
              難易度
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:ring-2 focus:ring-green-400"
              >
                <option value="easy">易しい</option>
                <option value="medium">普通</option>
                <option value="hard">難しい</option>
              </select>
            </label>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">問題一覧（{questions.length}問）</h2>
            <button
              onClick={() => { setShowAddForm(!showAddForm); setEditingIndex(null); }}
              className="rounded-2xl bg-slate-950 px-4 py-2 text-sm text-white transition hover:bg-slate-800"
            >
              {showAddForm ? "キャンセル" : "+ 問題追加"}
            </button>
          </div>

          {showAddForm && (
            <QuestionForm
              initial={editingIndex !== null ? questions[editingIndex] : null}
              onSave={addQuestion}
              onCancel={() => { setShowAddForm(false); setEditingIndex(null); }}
            />
          )}

          {questions.length > 0 ? (
            <div className="mt-6 space-y-3">
              {questions.map((q, i) => (
                <div key={i} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <p className="text-xs font-semibold text-slate-400">第{i + 1}問</p>
                      <p className="mt-1 text-slate-900">{q.text}</p>
                      {q.type === "multiple-choice" && q.options && (
                        <ul className="mt-2 space-y-0.5 pl-3 text-sm text-slate-500">
                          {q.options.map((opt, j) => (
                            <li key={j}>○ {opt}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setEditingIndex(i); setShowAddForm(true); }}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                      >
                        編集
                      </button>
                      <button
                        onClick={() => setQuestions(questions.filter((_, j) => j !== i))}
                        className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                      >
                        削除
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-slate-500">
              まだ問題が追加されていません
            </div>
          )}
        </section>

        <button
          onClick={saveTest}
          disabled={!title || questions.length === 0 || saving}
          className="w-full rounded-2xl bg-green-600 px-6 py-4 font-semibold text-white transition hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? "保存中..." : "テストを保存"}
        </button>
      </div>

      <aside className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm h-fit">
        <h3 className="font-semibold text-slate-950">作成ガイド</h3>
        <ul className="mt-4 space-y-3 text-sm text-slate-600">
          <li>1. テスト名・科目・学年・難易度を入力</li>
          <li>2. 問題を追加（選択肢式・短答式）</li>
          <li>3. 「テストを保存」で下書き保存</li>
          <li className="mt-4 pt-4 border-t border-slate-200 text-slate-400">
            保存後に配信URLを発行できます
          </li>
        </ul>
      </aside>
    </div>
  );
}

function QuestionForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: Omit<Question, "id" | "test_id"> | null;
  onSave: (q: Omit<Question, "id" | "test_id">) => void;
  onCancel: () => void;
}) {
  const [type, setType] = useState<"multiple-choice" | "short-answer">(
    initial?.type ?? "multiple-choice"
  );
  const [text, setText] = useState(initial?.text ?? "");
  const [options, setOptions] = useState<string[]>(initial?.options ?? ["", "", "", ""]);
  const [correctAnswer, setCorrectAnswer] = useState(initial?.correct_answer ?? "");
  const [points, setPoints] = useState(initial?.points ?? 1);

  const handleSubmit = () => {
    if (!text) { alert("問題文を入力してください"); return; }
    if (type === "multiple-choice" && options.some((o) => !o.trim())) {
      alert("すべての選択肢を入力してください"); return;
    }
    onSave({
      type,
      text,
      options: type === "multiple-choice" ? options : null,
      correct_answer: type === "short-answer" ? correctAnswer : null,
      order_index: 0,
      points,
    });
  };

  return (
    <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-6 space-y-4">
      <label className="grid gap-2 text-sm text-slate-700">
        問題タイプ
        <select
          value={type}
          onChange={(e) => setType(e.target.value as "multiple-choice" | "short-answer")}
          className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-green-400"
        >
          <option value="multiple-choice">選択肢式</option>
          <option value="short-answer">短答式</option>
        </select>
      </label>

      <label className="grid gap-2 text-sm text-slate-700">
        問題文
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-green-400"
          placeholder="問題を入力してください"
        />
      </label>

      {type === "multiple-choice" && (
        <div className="grid gap-2 text-sm text-slate-700">
          <p className="font-medium">選択肢</p>
          {options.map((opt, i) => (
            <input
              key={i}
              type="text"
              value={opt}
              onChange={(e) => {
                const next = [...options];
                next[i] = e.target.value;
                setOptions(next);
              }}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-2 outline-none focus:ring-2 focus:ring-green-400"
              placeholder={`選択肢 ${i + 1}`}
            />
          ))}
        </div>
      )}

      {type === "short-answer" && (
        <label className="grid gap-2 text-sm text-slate-700">
          正答
          <input
            type="text"
            value={correctAnswer}
            onChange={(e) => setCorrectAnswer(e.target.value)}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-green-400"
            placeholder="正答を入力"
          />
        </label>
      )}

      <label className="grid gap-2 text-sm text-slate-700">
        配点
        <input
          type="number"
          value={points}
          onChange={(e) => setPoints(Number(e.target.value))}
          min={1}
          className="w-24 rounded-2xl border border-slate-200 bg-white px-4 py-2 outline-none focus:ring-2 focus:ring-green-400"
        />
      </label>

      <div className="flex gap-3 pt-2">
        <button
          onClick={handleSubmit}
          className="flex-1 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          問題を保存
        </button>
        <button
          onClick={onCancel}
          className="flex-1 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          キャンセル
        </button>
      </div>
    </div>
  );
}
