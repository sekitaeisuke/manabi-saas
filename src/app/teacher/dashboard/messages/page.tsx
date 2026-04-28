"use client";

import Link from "next/link";
import { useState } from "react";

const students = [
  { id: 1, name: "田中太郎", grade: "中3" },
  { id: 2, name: "佐藤花子", grade: "中3" },
  { id: 3, name: "鈴木次郎", grade: "中2" },
  { id: 4, name: "高橋美咲", grade: "中2" },
  { id: 5, name: "渡辺健太", grade: "中1" },
  { id: 6, name: "伊藤由美", grade: "中1" },
];

export default function TeacherMessagesPage() {
  const [selectedStudents, setSelectedStudents] = useState<number[]>([]);
  const [messageText, setMessageText] = useState("");
  const [sendToAll, setSendToAll] = useState(false);

  const toggleStudent = (id: number) => {
    setSelectedStudents((prev) =>
      prev.includes(id) ? prev.filter((sid) => sid !== id) : [...prev, id]
    );
  };

  const handleSend = () => {
    const count = sendToAll ? students.length : selectedStudents.length;
    alert(`メッセージを${count}人に送信します：\n\n${messageText}`);
    setMessageText("");
    setSelectedStudents([]);
    setSendToAll(false);
  };

  return (
    <div className="min-h-screen bg-slate-100 px-6 py-10 text-slate-900">
      <main className="mx-auto max-w-5xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-950">メッセージ送信</h1>
            <p className="mt-2 text-slate-600">生徒や保護者にメッセージを一括送信できます。</p>
          </div>
          <Link href="/teacher/dashboard" className="rounded-2xl border border-slate-300 bg-white px-5 py-3 text-slate-950 transition hover:bg-slate-50">
            ダッシュボードに戻る
          </Link>
        </div>

        <div className="grid gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
              <h2 className="text-xl font-semibold text-slate-950">メッセージ本文</h2>
              <textarea
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                className="mt-4 min-h-[120px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:ring-2 focus:ring-slate-400"
                placeholder="生徒や保護者に送るメッセージを入力してください..."
              />
              <div className="mt-4 text-sm text-slate-500">{messageText.length}文字</div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
              <h2 className="text-xl font-semibold text-slate-950 mb-4">送信先を選択</h2>
              
              <label className="flex items-center gap-3 p-3 rounded-2xl border border-slate-200 bg-slate-50 cursor-pointer hover:bg-slate-100">
                <input
                  type="checkbox"
                  checked={sendToAll}
                  onChange={() => {
                    setSendToAll(!sendToAll);
                    if (!sendToAll) setSelectedStudents([]);
                  }}
                  className="h-5 w-5 cursor-pointer"
                />
                <span className="font-semibold text-slate-950">全生徒に送信</span>
              </label>

              {!sendToAll && (
                <div className="mt-4 space-y-2">
                  {students.map((student) => (
                    <label key={student.id} className="flex items-center gap-3 p-3 rounded-2xl border border-slate-200 bg-slate-50 cursor-pointer hover:bg-slate-100">
                      <input
                        type="checkbox"
                        checked={selectedStudents.includes(student.id)}
                        onChange={() => toggleStudent(student.id)}
                        className="h-5 w-5 cursor-pointer"
                      />
                      <div className="flex-1">
                        <p className="font-semibold text-slate-950">{student.name}</p>
                        <p className="text-sm text-slate-600">{student.grade}</p>
                      </div>
                    </label>
                  ))}
                </div>
              )}

              <p className="mt-4 text-sm text-slate-600">
                {sendToAll
                  ? `全${students.length}人に送信予定`
                  : `${selectedStudents.length}人に送信予定`}
              </p>
            </section>

            <button
              onClick={handleSend}
              disabled={!messageText || (!sendToAll && selectedStudents.length === 0)}
              className="w-full rounded-2xl bg-slate-950 px-6 py-4 font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              メッセージを送信
            </button>
          </div>

          <aside className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm h-fit">
            <h3 className="font-semibold text-slate-950">送信ガイド</h3>
            <ul className="mt-4 space-y-3 text-sm text-slate-600">
              <li>・メッセージは即座に全送信先に届きます</li>
              <li>・一括送信の場合、個別にカスタマイズはできません</li>
              <li>・送信後はこの画面から編集や取消はできません</li>
              <li>・保護者にも同時に通知が送られます</li>
            </ul>
          </aside>
        </div>
      </main>
    </div>
  );
}
