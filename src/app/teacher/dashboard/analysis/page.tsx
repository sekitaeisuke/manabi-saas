"use client";

import Link from "next/link";
import { useState } from "react";

const students = [
  { id: 1, name: "田中太郎", tests: [{subject: "数学", score: 78}, {subject: "英語", score: 85}] },
  { id: 2, name: "佐藤花子", tests: [{subject: "数学", score: 92}, {subject: "英語", score: 88}] },
  { id: 3, name: "鈴木次郎", tests: [{subject: "数学", score: 65}, {subject: "英語", score: 72}] },
];

export default function TeacherAnalysisPage() {
  const [selectedStudent, setSelectedStudent] = useState<number>(1);
  const [carteTitle, setCarteTitle] = useState("");
  const [carteContent, setCarteContent] = useState("");
  const [cartes, setCartes] = useState<Array<{id: number, studentId: number, title: string, content: string}>>([]);

  const currentStudent = students.find((s) => s.id === selectedStudent);

  const saveCarteData = () => {
    if (!carteTitle || !carteContent) {
      alert("タイトルと内容を入力してください");
      return;
    }
    const newCarte = {
      id: Date.now(),
      studentId: selectedStudent,
      title: carteTitle,
      content: carteContent,
    };
    setCartes([...cartes, newCarte]);
    setCarteTitle("");
    setCarteContent("");
    alert(`${currentStudent?.name} のカルテを保存しました`);
  };

  const deleteCarte = (id: number) => {
    setCartes(cartes.filter((c) => c.id !== id));
  };

  const studentCartes = cartes.filter((c) => c.studentId === selectedStudent);

  return (
    <div className="min-h-screen bg-slate-100 px-6 py-10 text-slate-900">
      <main className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-950">分析とカルテ</h1>
            <p className="mt-2 text-slate-600">テスト結果の分析とカルテを作成します。</p>
          </div>
          <Link href="/teacher/dashboard" className="rounded-2xl border border-slate-300 bg-white px-5 py-3 text-slate-950 transition hover:bg-slate-50">
            ダッシュボードに戻る
          </Link>
        </div>

        <div className="grid gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
              <h2 className="text-xl font-semibold text-slate-950 mb-4">生徒を選択</h2>
              <div className="grid gap-3 sm:grid-cols-3">
                {students.map((student) => (
                  <button
                    key={student.id}
                    onClick={() => setSelectedStudent(student.id)}
                    className={`rounded-2xl px-4 py-3 text-left font-semibold transition ${
                      selectedStudent === student.id
                        ? "bg-slate-950 text-white"
                        : "border border-slate-200 bg-slate-50 text-slate-950 hover:bg-slate-100"
                    }`}
                  >
                    {student.name}
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
              <h2 className="text-xl font-semibold text-slate-950 mb-6">テスト結果分析</h2>
              {currentStudent && (
                <div className="space-y-4">
                  {currentStudent.tests.map((test, idx) => (
                    <div key={idx} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-center justify-between">
                        <p className="font-semibold text-slate-950">{test.subject}</p>
                        <p className="text-2xl font-bold text-slate-950">{test.score}点</p>
                      </div>
                      <div className="mt-3 h-2 w-full rounded-full bg-slate-200 overflow-hidden">
                        <div
                          className="h-full bg-slate-950 transition"
                          style={{ width: `${test.score}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
              <h2 className="text-xl font-semibold text-slate-950 mb-4">カルテを作成</h2>
              <div className="grid gap-4">
                <label className="grid gap-2 text-sm text-slate-700">
                  カルテタイトル
                  <input
                    type="text"
                    value={carteTitle}
                    onChange={(e) => setCarteTitle(e.target.value)}
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:ring-2 focus:ring-slate-400"
                    placeholder="例：1月診断分析"
                  />
                </label>
                <label className="grid gap-2 text-sm text-slate-700">
                  分析と指導内容
                  <textarea
                    value={carteContent}
                    onChange={(e) => setCarteContent(e.target.value)}
                    className="min-h-[120px] rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:ring-2 focus:ring-slate-400"
                    placeholder="テスト結果に基づいた分析と、今後の指導方針を記入してください"
                  />
                </label>
              </div>
              <button
                onClick={saveCarteData}
                className="mt-4 w-full rounded-2xl bg-slate-950 px-6 py-3 font-semibold text-white transition hover:bg-slate-800"
              >
                カルテを保存
              </button>
            </section>
          </div>

          <aside className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm h-fit">
            <h3 className="font-semibold text-slate-950 mb-4">保存済みカルテ</h3>
            {studentCartes.length > 0 ? (
              <div className="space-y-3">
                {studentCartes.map((carte) => (
                  <div key={carte.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <p className="font-semibold text-sm text-slate-950">{carte.title}</p>
                    <p className="mt-2 text-xs text-slate-600 line-clamp-2">{carte.content}</p>
                    <button
                      onClick={() => deleteCarte(carte.id)}
                      className="mt-2 text-xs text-red-600 transition hover:text-red-700"
                    >
                      削除
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">まだカルテが作成されていません</p>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}
