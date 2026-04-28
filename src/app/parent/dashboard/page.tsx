"use client";

import Link from "next/link";

const children = [
  {
    id: 1,
    name: "田中太郎",
    grade: "中3",
    recentTests: [
      { subject: "数学", date: "2026-01-20", score: 78, status: "合格" },
      { subject: "英語", date: "2026-01-19", score: 85, status: "優秀" },
    ],
    messages: [
      { date: "2026-01-15", teacher: "山田太郎", content: "今月の成績が良くなってきました。継続頑張りましょう。" },
    ],
  },
];

export default function ParentDashboardPage() {
  const child = children[0];

  const getStatusClass = (status: string) => {
    return status === "優秀" ? "bg-green-100 text-green-900" : "bg-blue-100 text-blue-900";
  };

  return (
    <div className="min-h-screen bg-slate-100 px-6 py-10 text-slate-900">
      <main className="mx-auto max-w-5xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-950">お子さまの学習状況</h1>
            <p className="mt-2 text-slate-600">{child.name} さんの学習状況と連絡事項をまとめています。</p>
          </div>
          <Link href="/" className="rounded-2xl border border-slate-300 bg-white px-5 py-3 text-slate-950 transition hover:bg-slate-50">
            トップに戻る
          </Link>
        </div>

        <div className="grid gap-8">
          <section className="grid gap-4 md:grid-cols-3">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-sm font-semibold text-slate-500">お子さまの名前</p>
              <p className="mt-3 text-2xl font-bold text-slate-950">{child.name}</p>
              <p className="mt-2 text-sm text-slate-600">{child.grade}</p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-sm font-semibold text-slate-500">直近のテスト</p>
              <p className="mt-3 text-2xl font-bold text-slate-950">{child.recentTests[0].score}点</p>
              <p className="mt-2 text-sm text-slate-600">{child.recentTests[0].subject}</p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-sm font-semibold text-slate-500">講師からの連絡</p>
              <p className="mt-3 text-2xl font-bold text-slate-950">{child.messages.length}件</p>
              <p className="mt-2 text-sm text-slate-600">未読あり</p>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
            <h2 className="text-xl font-semibold text-slate-950 mb-6">最近のテスト結果</h2>
            {child.recentTests.length > 0 ? (
              <div className="space-y-3">
                {child.recentTests.map((test, idx) => (
                  <div key={idx} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1">
                        <p className="font-semibold text-slate-950">{test.subject}</p>
                        <p className="mt-1 text-sm text-slate-600">{test.date}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-slate-950">{test.score}点</p>
                        <div className={`mt-1 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getStatusClass(test.status)}`}>
                          {test.status}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">テスト結果がまだ登録されていません</p>
            )}
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
            <h2 className="text-xl font-semibold text-slate-950 mb-6">講師からの連絡事項</h2>
            {child.messages.length > 0 ? (
              <div className="space-y-4">
                {child.messages.map((msg, idx) => (
                  <div key={idx} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <p className="font-semibold text-slate-950">{msg.teacher}</p>
                        <p className="mt-1 text-sm text-slate-600">{msg.date}</p>
                      </div>
                    </div>
                    <p className="mt-3 text-slate-700">{msg.content}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">まだ連絡事項がありません</p>
            )}
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
            <h2 className="text-xl font-semibold text-slate-950 mb-6">報告書</h2>
            <p className="text-slate-600 mb-4">講師からの報告書をダウンロードできます。</p>
            <button className="rounded-2xl bg-slate-950 px-6 py-3 font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed" disabled>
              報告書がまだ登録されていません
            </button>
          </section>
        </div>
      </main>
    </div>
  );
}
